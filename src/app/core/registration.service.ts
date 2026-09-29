import { Injectable } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { SEASON, db } from './firebase';
import { AadhaarIndex, Member, MemberInput, PaymentStatus, Registration, SeasonSettings } from './models';
import { counterRef, seasonRef } from './season.service';

const registrations = () => collection(db, 'seasons', SEASON, 'registrations');
const aadhaarIndex = () => collection(db, 'seasons', SEASON, 'aadhaar');
const phoneIndex = () => collection(db, 'seasons', SEASON, 'phones');

export class RegistrationError extends Error {
  constructor(
    readonly code: 'closed' | 'sold-out' | 'duplicate' | 'not-ready',
    message: string,
    readonly aadhaars: string[] = [],
  ) {
    super(message);
  }
}

/** SHA-256 of the Aadhaar number, used as the index document id. */
export async function aadhaarKey(aadhaar: string): Promise<string> {
  const bytes = new TextEncoder().encode(aadhaar.replace(/\D/g, ''));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function coordinatorFor(ticket: number, s: Pick<SeasonSettings, 'coordinators' | 'ticketsPerCoordinator'>): string {
  if (!s.coordinators.length) return '';
  const i = Math.floor((ticket - 1) / Math.max(1, s.ticketsPerCoordinator));
  return s.coordinators[Math.min(i, s.coordinators.length - 1)];
}

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  /** The ticket number an Aadhaar number is already registered under, or null if it is free. */
  async registeredTicket(aadhaar: string): Promise<number | null> {
    const snap = await getDoc(doc(aadhaarIndex(), await aadhaarKey(aadhaar)));
    return snap.exists() ? ((snap.data() as AadhaarIndex).ticketNumber ?? 0) : null;
  }

  /**
   * Allocates ticket numbers and saves the group in one transaction, so two phones
   * submitting at the same moment can never get the same ticket or register the same Aadhaar twice.
   */
  async register(inputs: MemberInput[], createdBy: string | null): Promise<Registration> {
    const keys = await Promise.all(inputs.map(m => aadhaarKey(m.aadhaar)));
    const seen = new Set<string>();
    const repeated = inputs.filter((_, i) => seen.size === seen.add(keys[i]).size).map(m => m.aadhaar);
    if (repeated.length) throw new RegistrationError('duplicate', 'The same Aadhaar is entered twice in this form.', repeated);

    const regRef = doc(registrations());
    const phones = [...new Set(inputs.map(m => m.phone))];

    return runTransaction(db, async tx => {
      const [seasonSnap, counterSnap] = await Promise.all([tx.get(seasonRef()), tx.get(counterRef())]);
      if (!seasonSnap.exists() || !counterSnap.exists()) throw new RegistrationError('not-ready', 'Registration has not started yet.');
      const s = seasonSnap.data() as SeasonSettings;
      const c = counterSnap.data() as { lastTicket: number; lastSubmission: number };

      if (!s.registrationOpen && !createdBy) throw new RegistrationError('closed', 'Registration is closed.');
      if (c.lastTicket + inputs.length > s.totalTickets)
        throw new RegistrationError('sold-out', `Only ${Math.max(0, s.totalTickets - c.lastTicket)} tickets are left.`);

      const existing = await Promise.all(keys.map(k => tx.get(doc(aadhaarIndex(), k))));
      const dupes = inputs.filter((_, i) => existing[i].exists()).map(m => m.aadhaar);
      if (dupes.length) throw new RegistrationError('duplicate', 'Already registered.', dupes);

      const phoneSnaps = await Promise.all(phones.map(p => tx.get(doc(phoneIndex(), p))));

      const submissionNo = c.lastSubmission + 1;
      const firstTicket = c.lastTicket + 1;
      const members: Member[] = inputs.map((m, i) => ({
        ticketNumber: firstTicket + i,
        name: m.name.trim(),
        age: Number(m.age),
        gender: m.gender,
        dob: m.dob ?? '',
        aadhaarLast4: m.aadhaar.slice(-4),
        phone: m.phone,
        address: m.address.trim(),
        coordinator: coordinatorFor(firstTicket + i, s),
        paymentStatus: 'Not Paid' as PaymentStatus,
        scanned: m.scanned,
      }));

      tx.set(regRef, { submissionNo, firstTicket, members, createdAt: serverTimestamp(), createdBy });
      tx.update(counterRef(), {
        lastTicket: c.lastTicket + inputs.length,
        lastSubmission: submissionNo,
        lastRegistrationId: regRef.id,
      });
      inputs.forEach((m, i) =>
        tx.set(doc(aadhaarIndex(), keys[i]), {
          aadhaar: m.aadhaar,
          registrationId: regRef.id,
          ticketNumber: firstTicket + i,
        } satisfies AadhaarIndex),
      );
      phones.forEach((p, i) =>
        phoneSnaps[i].exists()
          ? tx.update(doc(phoneIndex(), p), { registrationIds: arrayUnion(regRef.id) })
          : tx.set(doc(phoneIndex(), p), { registrationIds: [regRef.id] }),
      );

      return { id: regRef.id, submissionNo, firstTicket, members, createdAt: null, createdBy };
    });
  }

  async get(id: string): Promise<Registration | null> {
    const snap = await getDoc(doc(registrations(), id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Registration) : null;
  }

  async findByAadhaar(aadhaar: string): Promise<Registration[]> {
    const snap = await getDoc(doc(aadhaarIndex(), await aadhaarKey(aadhaar)));
    if (!snap.exists()) return [];
    const reg = await this.get((snap.data() as AadhaarIndex).registrationId);
    return reg ? [reg] : [];
  }

  async findByPhone(phone: string): Promise<Registration[]> {
    const snap = await getDoc(doc(phoneIndex(), phone));
    if (!snap.exists()) return [];
    const ids: string[] = snap.data()['registrationIds'] ?? [];
    const regs = await Promise.all(ids.map(id => this.get(id)));
    return regs.filter((r): r is Registration => !!r).sort((a, b) => a.submissionNo - b.submissionNo);
  }

  // ---- staff only ----

  watchAll(onChange: (regs: Registration[]) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      registrations(),
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Registration).sort((a, b) => a.firstTicket - b.firstTicket)),
      onError,
    );
  }

  async setPayment(registrationId: string, ticketNumber: number, status: PaymentStatus): Promise<void> {
    const ref = doc(registrations(), registrationId);
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Registration not found');
      const members = (snap.data()['members'] as Member[]).map(m => (m.ticketNumber === ticketNumber ? { ...m, paymentStatus: status } : m));
      tx.update(ref, { members, updatedAt: serverTimestamp() });
    });
  }

  /** Admins: the full Aadhaar number of one devotee. */
  async aadhaarOf(registrationId: string, ticketNumber: number): Promise<string | null> {
    const snap = await getDocs(query(aadhaarIndex(), where('registrationId', '==', registrationId)));
    const hit = snap.docs.map(d => d.data() as AadhaarIndex).find(a => a.ticketNumber === ticketNumber);
    return hit?.aadhaar ?? null;
  }

  /**
   * Corrects one devotee's details. Changing the Aadhaar number (admins) moves its duplicate-check
   * entry; changing the phone moves the registration between phone lookups. All in one transaction.
   */
  async updateMember(
    registrationId: string,
    ticketNumber: number,
    changes: Pick<Member, 'name' | 'age' | 'gender' | 'phone' | 'address'>,
    aadhaar?: { from: string; to: string },
  ): Promise<void> {
    const ref = doc(registrations(), registrationId);
    const keys = aadhaar && aadhaar.to !== aadhaar.from ? { from: await aadhaarKey(aadhaar.from), to: await aadhaarKey(aadhaar.to) } : null;

    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Registration not found');
      const members = snap.data()['members'] as Member[];
      const index = members.findIndex(m => m.ticketNumber === ticketNumber);
      if (index < 0) throw new Error('Devotee not found');
      const before = members[index];

      if (keys && (await tx.get(doc(aadhaarIndex(), keys.to))).exists())
        throw new RegistrationError('duplicate', 'This Aadhaar number is already registered.', [aadhaar!.to]);

      const phoneChanged = changes.phone !== before.phone;
      const newPhoneSnap = phoneChanged ? await tx.get(doc(phoneIndex(), changes.phone)) : null;
      const oldPhoneSnap = phoneChanged ? await tx.get(doc(phoneIndex(), before.phone)) : null;

      const updated: Member = {
        ...before,
        ...changes,
        name: changes.name.trim(),
        address: changes.address.trim(),
        age: Number(changes.age),
        aadhaarLast4: keys ? aadhaar!.to.slice(-4) : before.aadhaarLast4,
      };
      const next = members.map((m, i) => (i === index ? updated : m));
      tx.update(ref, { members: next, updatedAt: serverTimestamp() });

      if (keys) {
        tx.set(doc(aadhaarIndex(), keys.to), { aadhaar: aadhaar!.to, registrationId, ticketNumber } satisfies AadhaarIndex);
        tx.delete(doc(aadhaarIndex(), keys.from));
      }
      if (phoneChanged) {
        if (newPhoneSnap!.exists()) tx.update(doc(phoneIndex(), changes.phone), { registrationIds: arrayUnion(registrationId) });
        else tx.set(doc(phoneIndex(), changes.phone), { registrationIds: [registrationId] });
        const stillUsed = next.some(m => m.phone === before.phone);
        if (!stillUsed && oldPhoneSnap!.exists()) tx.update(doc(phoneIndex(), before.phone), { registrationIds: arrayRemove(registrationId) });
      }
    });
  }

  /** Full Aadhaar numbers keyed by "registrationId:ticketNumber", for exports. */
  async aadhaarNumbers(): Promise<Map<string, string>> {
    const snap = await getDocs(aadhaarIndex());
    const map = new Map<string, string>();
    snap.forEach(d => {
      const a = d.data() as AadhaarIndex;
      map.set(`${a.registrationId}:${a.ticketNumber}`, a.aadhaar);
    });
    return map;
  }

  /** Main admin only. Ticket numbers are not reused; the Aadhaar numbers become free to register again. */
  async delete(reg: Registration): Promise<void> {
    const numbers = await this.aadhaarNumbers();
    const batch = writeBatch(db);
    for (const m of reg.members) {
      const aadhaar = numbers.get(`${reg.id}:${m.ticketNumber}`);
      if (aadhaar) batch.delete(doc(aadhaarIndex(), await aadhaarKey(aadhaar)));
    }
    for (const phone of new Set(reg.members.map(m => m.phone))) {
      const ref = doc(phoneIndex(), phone);
      if ((await getDoc(ref)).exists()) batch.update(ref, { registrationIds: arrayRemove(reg.id) });
    }
    batch.delete(doc(registrations(), reg.id));
    await batch.commit();
  }
}
