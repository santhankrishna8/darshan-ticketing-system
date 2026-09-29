// Firestore security rules tests. Run with: npm run test:rules (starts the emulator).
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const S = '2026';
const OWNER = { uid: 'owner', email: 'santhankrishna18@gmail.com' };
let env;

const settings = (over = {}) => ({
  season: S,
  totalTickets: 5,
  maxPerGroup: 3,
  registrationOpen: true,
  coordinators: [],
  ticketsPerCoordinator: 50,
  fee: 300,
  ...over,
});

const as = user =>
  user ? env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore() : env.unauthenticatedContext().firestore();

async function seed(extra = async () => {}) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, `seasons/${S}`), settings());
    await setDoc(doc(db, `seasons/${S}/meta/counter`), { lastTicket: 0, lastSubmission: 0, lastRegistrationId: '' });
    await setDoc(doc(db, 'devotees/1'), { submissionId: 1, members: [{ name: 'Old', aadhar: '1' }] });
    await extra(db);
  });
}

async function staff(uid, status, role = 'volunteer') {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), `seasons/${S}/staff/${uid}`), {
      uid,
      email: `${uid}@example.com`,
      name: uid,
      photoURL: '',
      status,
      role,
      biometricAllowed: false,
    });
  });
}

/** The same writes RegistrationService.register makes. */
function register(db, members, { createdBy = null, tamper = {} } = {}) {
  const regRef = doc(collection(db, `seasons/${S}/registrations`));
  return runTransaction(db, async tx => {
    const c = (await tx.get(doc(db, `seasons/${S}/meta/counter`))).data();
    const first = c.lastTicket + 1;
    const phoneSnaps = await Promise.all(members.map(m => tx.get(doc(db, `seasons/${S}/phones/${m.phone}`))));
    tx.set(regRef, {
      submissionNo: c.lastSubmission + 1,
      firstTicket: first,
      members: members.map((m, i) => ({ ticketNumber: first + i, name: m.name, paymentStatus: 'Not Paid', aadhaarLast4: m.aadhaar.slice(-4) })),
      createdAt: serverTimestamp(),
      createdBy,
      ...tamper.registration,
    });
    tx.update(doc(db, `seasons/${S}/meta/counter`), {
      lastTicket: c.lastTicket + members.length,
      lastSubmission: c.lastSubmission + 1,
      lastRegistrationId: regRef.id,
      ...tamper.counter,
    });
    members.forEach((m, i) =>
      tx.set(doc(db, `seasons/${S}/aadhaar/${m.aadhaar}`), { aadhaar: m.aadhaar, registrationId: regRef.id, ticketNumber: first + i }),
    );
    members.forEach((m, i) =>
      phoneSnaps[i].exists()
        ? tx.update(doc(db, `seasons/${S}/phones/${m.phone}`), { registrationIds: arrayUnion(regRef.id) })
        : tx.set(doc(db, `seasons/${S}/phones/${m.phone}`), { registrationIds: [regRef.id] }),
    );
    return regRef.id;
  });
}

const devotee = n => ({ name: `Devotee ${n}`, aadhaar: `a${n}`, phone: `98480000${String(n).padStart(2, '0')}` });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-darshan',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('public', () => {
  it('reads season settings and counter', async () => {
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}`)));
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}/meta/counter`)));
  });

  it('registers a group while registration is open', async () => {
    await assertSucceeds(register(as(null), [devotee(1), devotee(2)]));
  });

  it('cannot register when registration is closed', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `seasons/${S}`), { registrationOpen: false }));
    await assertFails(register(as(null), [devotee(1)]));
  });

  it('cannot take more tickets than exist or than a group allows', async () => {
    await assertFails(register(as(null), [devotee(1), devotee(2), devotee(3), devotee(4)])); // maxPerGroup 3
    await assertSucceeds(register(as(null), [devotee(1), devotee(2), devotee(3)]));
    await assertFails(register(as(null), [devotee(4), devotee(5), devotee(6)])); // only 2 of 5 left
  });

  it('cannot register an Aadhaar number twice', async () => {
    await assertSucceeds(register(as(null), [devotee(1)]));
    await assertFails(register(as(null), [devotee(1)]));
  });

  it('cannot tamper with ticket numbers or claim to be staff', async () => {
    await assertFails(register(as(null), [devotee(1)], { tamper: { counter: { lastTicket: 3 } } }));
    await assertFails(register(as(null), [devotee(1)], { tamper: { registration: { firstTicket: 7 } } }));
    await assertFails(register(as(null), [devotee(1)], { createdBy: 'owner' }));
  });

  it('fetches a registration by id but cannot list registrations or the Aadhaar index', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}/registrations/${id}`)));
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}/aadhaar/a1`)));
    await assertFails(getDocs(collection(as(null), `seasons/${S}/registrations`)));
    await assertFails(getDocs(collection(as(null), `seasons/${S}/aadhaar`)));
  });

  it('cannot mark payments or change settings', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/registrations/${id}`), { members: [] }));
    await assertFails(updateDoc(doc(as(null), `seasons/${S}`), { totalTickets: 9999 }));
  });

  it('cannot read last year', async () => {
    await assertFails(getDocs(collection(as(null), 'devotees')));
  });
});

describe('access requests', () => {
  const alice = { uid: 'alice', email: 'alice@example.com' };
  const request = over => ({
    uid: 'alice',
    email: 'alice@example.com',
    name: 'Alice',
    photoURL: '',
    status: 'pending',
    role: 'volunteer',
    biometricAllowed: false,
    requestedAt: serverTimestamp(),
    ...over,
  });

  it('a signed-in person can request access for themselves only, as pending', async () => {
    await assertSucceeds(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request()));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/bob`), request({ uid: 'bob' })));
  });

  it('cannot approve themselves or pick a role', async () => {
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ status: 'approved' })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ role: 'admin' })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ biometricAllowed: true })));
    await staff('alice', 'pending');
    await assertFails(updateDoc(doc(as(alice), `seasons/${S}/staff/alice`), { status: 'approved' }));
  });

  it('the main admin sees requests and approves them', async () => {
    await staff('alice', 'pending');
    await assertSucceeds(getDocs(collection(as(OWNER), `seasons/${S}/staff`)));
    await assertSucceeds(updateDoc(doc(as(OWNER), `seasons/${S}/staff/alice`), { status: 'approved', role: 'admin', biometricAllowed: true }));
  });

  it('an approved admin still cannot manage people', async () => {
    await staff('carol', 'approved', 'admin');
    await staff('alice', 'pending');
    const carol = { uid: 'carol', email: 'carol@example.com' };
    await assertFails(getDocs(collection(as(carol), `seasons/${S}/staff`)));
    await assertFails(updateDoc(doc(as(carol), `seasons/${S}/staff/alice`), { status: 'approved' }));
  });

  it('only verified owner emails are the main admin', async () => {
    const unverified = env.authenticatedContext('owner', { email: OWNER.email, email_verified: false }).firestore();
    await assertFails(updateDoc(doc(unverified, `seasons/${S}`), { totalTickets: 10 }));
    await assertSucceeds(updateDoc(doc(as(OWNER), `seasons/${S}`), { totalTickets: 10 }));
  });

  it('any other Google account is not the main admin', async () => {
    const other = { uid: 'x', email: 'someone.else@gmail.com' };
    await assertFails(updateDoc(doc(as(other), `seasons/${S}`), { totalTickets: 10 }));
    await assertFails(getDocs(collection(as(other), `seasons/${S}/staff`)));
  });
});

describe('staff', () => {
  const vol = { uid: 'vol', email: 'vol@example.com' };
  const adm = { uid: 'adm', email: 'adm@example.com' };
  const pend = { uid: 'pend', email: 'pend@example.com' };

  beforeEach(async () => {
    await staff('vol', 'approved', 'volunteer');
    await staff('adm', 'approved', 'admin');
    await staff('pend', 'pending');
  });

  it('volunteers list registrations and mark payments', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(getDocs(collection(as(vol), `seasons/${S}/registrations`)));
    const ref = doc(as(vol), `seasons/${S}/registrations/${id}`);
    const members = (await getDoc(ref)).data().members.map(m => ({ ...m, paymentStatus: 'Paid' }));
    await assertSucceeds(updateDoc(ref, { members, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { submissionNo: 99 }));
  });

  it('pending people see nothing', async () => {
    await register(as(null), [devotee(1)]);
    await assertFails(getDocs(collection(as(pend), `seasons/${S}/registrations`)));
  });

  it('staff register walk-ins while public registration is closed', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `seasons/${S}`), { registrationOpen: false }));
    await assertSucceeds(register(as(vol), [devotee(1)], { createdBy: 'vol' }));
    await assertFails(register(as(pend), [devotee(2)], { createdBy: 'pend' }));
  });

  it('only admins export full Aadhaar numbers', async () => {
    await register(as(null), [devotee(1)]);
    await assertFails(getDocs(collection(as(vol), `seasons/${S}/aadhaar`)));
    await assertSucceeds(getDocs(collection(as(adm), `seasons/${S}/aadhaar`)));
  });

  it('nobody, not even the main admin, can read or change last year\'s data', async () => {
    for (const user of [null, vol, adm, OWNER]) {
      for (const c of ['devotees', 'tickets', 'submissions']) {
        await assertFails(getDocs(collection(as(user), c)));
        await assertFails(getDoc(doc(as(user), `${c}/1`)));
      }
      await assertFails(setDoc(doc(as(user), 'devotees/1'), { members: [] }));
    }
  });

  it('admins correct an Aadhaar number; organizers and the public cannot', async () => {
    const id = await register(as(null), [devotee(1)]);
    const move = db => runTransaction(db, async tx => {
      tx.set(doc(db, `seasons/${S}/aadhaar/fixed`), { aadhaar: 'fixed', registrationId: id, ticketNumber: 1 });
      tx.delete(doc(db, `seasons/${S}/aadhaar/a1`));
    });
    await assertFails(move(as(null)));
    await assertFails(move(as(vol)));
    await assertSucceeds(move(as(adm)));
  });

  it('organizers move a registration to a corrected phone number; the public cannot', async () => {
    const id = await register(as(null), [devotee(1)]);
    await register(as(null), [devotee(2)]); // so the first is no longer the latest registration
    await assertFails(setDoc(doc(as(null), `seasons/${S}/phones/9000000001`), { registrationIds: [id] }));
    await assertSucceeds(setDoc(doc(as(vol), `seasons/${S}/phones/9000000001`), { registrationIds: [id] }));
    await assertSucceeds(updateDoc(doc(as(vol), `seasons/${S}/phones/${devotee(1).phone}`), { registrationIds: [] }));
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/phones/9000000001`), { registrationIds: [] }));
  });

  it('only the main admin deletes registrations', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertFails(deleteDoc(doc(as(adm), `seasons/${S}/registrations/${id}`)));
    await assertSucceeds(deleteDoc(doc(as(OWNER), `seasons/${S}/registrations/${id}`)));
  });
});
