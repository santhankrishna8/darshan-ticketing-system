// Firestore security rules tests. Run with: npm run test:rules (starts the emulator).
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createHash } from 'node:crypto';
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

const sha = s => createHash('sha256').update(s).digest('hex');

const settings = (over = {}) => ({
  season: S,
  totalTickets: 5,
  maxPerGroup: 3,
  minAge: 12,
  maxAge: 100,
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

/** One member exactly as RegistrationService.register writes it. */
const memberDoc = (m, ticketNumber) => ({
  ticketNumber,
  name: m.name,
  age: 40,
  gender: 'Male',
  dob: '',
  aadhaarLast4: m.aadhaar.slice(-4),
  phone: m.phone,
  address: 'Peruru village',
  coordinator: '',
  paymentStatus: 'Not Paid',
  scanned: false,
});

/**
 * The same writes RegistrationService.register makes. `tamper` lets a test change one thing the way an
 * attacker calling Firestore directly (not through the app) could.
 */
function register(db, members, { createdBy = null, tamper = {} } = {}) {
  const regRef = doc(collection(db, `seasons/${S}/registrations`));
  return runTransaction(db, async tx => {
    const c = (await tx.get(doc(db, `seasons/${S}/meta/counter`))).data();
    const first = c.lastTicket + 1;
    const phoneSnaps = await Promise.all(members.map(m => tx.get(doc(db, `seasons/${S}/phones/${m.phone}`))));
    const reg = {
      submissionNo: c.lastSubmission + 1,
      firstTicket: first,
      members: tamper.members ? tamper.members(members, first) : members.map((m, i) => ({ ...memberDoc(m, first + i), ...tamper.member?.(i) })),
      swamyName: 'Guru Swamy',
      swamyPhone: '9848011111',
      createdAt: serverTimestamp(),
      createdBy,
      ...tamper.registration,
    };
    for (const key of tamper.omit ?? []) delete reg[key];
    tx.set(regRef, reg);
    tx.update(doc(db, `seasons/${S}/meta/counter`), {
      lastTicket: c.lastTicket + members.length,
      lastSubmission: c.lastSubmission + 1,
      lastRegistrationId: regRef.id,
      ...tamper.counter,
    });
    members.forEach((m, i) =>
      tx.set(doc(db, `seasons/${S}/aadhaar/${tamper.aadhaarId?.(i) ?? sha(m.aadhaar)}`), {
        aadhaar: m.aadhaar,
        registrationId: regRef.id,
        ticketNumber: first + i,
        ...tamper.aadhaarDoc?.(i),
      }),
    );
    members.forEach((m, i) => {
      const id = tamper.phoneId?.(i) ?? m.phone;
      if (phoneSnaps[i].exists()) tx.update(doc(db, `seasons/${S}/phones/${id}`), { registrationIds: arrayUnion(regRef.id) });
      else tx.set(doc(db, `seasons/${S}/phones/${id}`), { registrationIds: [regRef.id], ...tamper.phoneDoc?.(i) });
    });
    return regRef.id;
  });
}

const devotee = n => ({ name: `Devotee ${n}`, aadhaar: String(234500000000 + n), phone: `98480000${String(n).padStart(2, '0')}` });

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

  it('registers a full group of 10 (the most the rules allow), signed in or not', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `seasons/${S}`), { maxPerGroup: 10, totalTickets: 100 }));
    const ten = Array.from({ length: 10 }, (_, i) => devotee(i + 1));
    await assertSucceeds(register(as(null), ten));
    await staff('vol', 'approved');
    await assertSucceeds(register(as({ uid: 'vol', email: 'vol@example.com' }), ten.map((d, i) => devotee(i + 21)), { createdBy: 'vol' }));
  });

  it('registers a family of 9 who all share one phone number', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `seasons/${S}`), { maxPerGroup: 10, totalTickets: 100 }));
    const family = Array.from({ length: 9 }, (_, i) => ({ ...devotee(i + 1), phone: '9848011111' }));
    await assertSucceeds(register(as(null), family));
  });

  it('refuses an 11th devotee in one registration even when settings allow more', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `seasons/${S}`), { maxPerGroup: 20, totalTickets: 100 }));
    await assertFails(register(as(null), Array.from({ length: 11 }, (_, i) => devotee(i + 1))));
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

  it('cannot register devotees as already paid or with shuffled ticket numbers', async () => {
    await assertFails(register(as(null), [devotee(1), devotee(2)], { tamper: { member: i => (i === 1 ? { paymentStatus: 'Paid' } : {}) } }));
    await assertFails(register(as(null), [devotee(1), devotee(2)], { tamper: { member: i => ({ ticketNumber: 2 - i }) } }));
    await assertSucceeds(register(as(null), [devotee(1), devotee(2)]));
  });

  it('fetches a registration by id but cannot list registrations or the Aadhaar index', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}/registrations/${id}`)));
    await assertSucceeds(getDoc(doc(as(null), `seasons/${S}/aadhaar/${sha(devotee(1).aadhaar)}`)));
    await assertFails(getDocs(collection(as(null), `seasons/${S}/registrations`)));
    await assertFails(getDocs(collection(as(null), `seasons/${S}/aadhaar`)));
    await assertFails(getDocs(collection(as(null), `seasons/${S}/phones`)));
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

describe('public attacks on the registration writes', () => {
  const ok = (name, tamper, user = null) => it(name, () => assertSucceeds(register(as(user), [devotee(1)], { tamper })));
  const bad = (name, tamper) => it(name, () => assertFails(register(as(null), [devotee(1)], { tamper })));

  ok('baseline: an untampered registration is accepted', {});

  describe('member fields', () => {
    bad('an extra field on a member', { member: () => ({ isAdmin: true }) });
    bad('a missing field on a member', { members: (ms, first) => ms.map((m, i) => { const { phone: _p, ...rest } = memberDoc(m, first + i); return rest; }) });
    bad('a name that is not text', { member: () => ({ name: 12345 }) });
    bad('a one-letter name', { member: () => ({ name: 'A' }) });
    bad('a 5000-character name', { member: () => ({ name: 'A'.repeat(5000) }) });
    bad('a name that is a map', { member: () => ({ name: { $gt: '' } }) });
    bad('a 5000-character address', { member: () => ({ address: 'A'.repeat(5000) }) });
    bad('a 5000-character coordinator', { member: () => ({ coordinator: 'A'.repeat(5000) }) });
    bad('an age that is text', { member: () => ({ age: '40' }) });
    bad('a fractional age', { member: () => ({ age: 40.5 }) });
    bad('a 5000-character gender', { member: () => ({ gender: 'x'.repeat(5000) }) });
    bad('a phone number that is too short', { member: () => ({ phone: '12345' }) });
    bad('a phone number with letters', { member: () => ({ phone: '98480abcde' }) });
    bad('a phone number starting with 1', { member: () => ({ phone: '1234567890' }) });
    bad('a phone number that borrows digits from the last-4 field', { member: () => ({ phone: '984800000', aadhaarLast4: '12345' }) });
    bad('last-4 digits that are not digits', { member: () => ({ aadhaarLast4: 'abcd' }) });
    bad('a full Aadhaar number in the public registration', { member: () => ({ aadhaarLast4: '234500000001' }) });
    bad('dob that is huge', { member: () => ({ dob: 'x'.repeat(500) }) });
    bad('members as a map instead of a list', { registration: { members: { 0: memberDoc(devotee(1), 1) } } });
    bad('a submission number that is text', { registration: { submissionNo: '1' } });
    bad('an extra top-level field', { registration: { approved: true } });
    bad('no swamy name', { omit: ['swamyName'] });
    bad('no swamy phone', { omit: ['swamyPhone'] });
    bad('an empty swamy name', { registration: { swamyName: '' } });
    bad('a one-letter swamy name', { registration: { swamyName: 'A' } });
    bad('a 5000-character swamy name', { registration: { swamyName: 'A'.repeat(5000) } });
    bad('a swamy name that is not text', { registration: { swamyName: 12345 } });
    bad('a swamy phone that is too short', { registration: { swamyPhone: '12345' } });
    bad('a swamy phone starting with 1', { registration: { swamyPhone: '1234567890' } });
    bad('a swamy phone that is a number', { registration: { swamyPhone: 9848011111 } });
    bad('a registration id that is a path, not an id', { counter: { lastRegistrationId: 'abc/def/ghi' } });
  });

  describe('Aadhaar index entry', () => {
    bad('an id that is not a SHA-256 hash', { aadhaarId: () => 'a1' });
    bad('an id with upper-case hex', { aadhaarId: () => sha('x').toUpperCase() });
    bad('an Aadhaar value that is not 12 digits', { aadhaarDoc: () => ({ aadhaar: 'hello' }) });
    bad('an Aadhaar value of 5000 characters', { aadhaarDoc: () => ({ aadhaar: '1'.repeat(5000) }) });
    bad('an Aadhaar value that is a number', { aadhaarDoc: () => ({ aadhaar: 234500000001 }) });
    bad('an extra field', { aadhaarDoc: () => ({ note: 'hi' }) });
    bad('a ticket number that is a fraction', { aadhaarDoc: () => ({ ticketNumber: 1.5 }) });
  });

  describe('phone lookup entry', () => {
    bad('an id that is not a member phone number', { phoneId: () => '9000000099' });
    bad('an id that is garbage', { phoneId: () => 'not-a-phone' });
    bad('an extra field', { phoneDoc: () => ({ note: 'hi' }) });

    it("cannot add its registration to someone else's phone lookup", async () => {
      const victim = { name: 'Victim', aadhaar: '234599999999', phone: '9000000099' };
      await assertSucceeds(register(as(null), [victim]));
      const attacker = devotee(7);
      // The attacker's registration is valid; the only difference is the extra write to the victim's phone entry.
      const attack = extraWrite => {
        const db = as(null);
        const regRef = doc(collection(db, `seasons/${S}/registrations`));
        return runTransaction(db, async tx => {
          const c = (await tx.get(doc(db, `seasons/${S}/meta/counter`))).data();
          tx.set(regRef, { submissionNo: c.lastSubmission + 1, firstTicket: c.lastTicket + 1, members: [memberDoc(attacker, c.lastTicket + 1)], swamyName: 'Guru Swamy', swamyPhone: '9848011111', createdAt: serverTimestamp(), createdBy: null });
          tx.update(doc(db, `seasons/${S}/meta/counter`), { lastTicket: c.lastTicket + 1, lastSubmission: c.lastSubmission + 1, lastRegistrationId: regRef.id });
          tx.set(doc(db, `seasons/${S}/aadhaar/${sha(attacker.aadhaar)}`), { aadhaar: attacker.aadhaar, registrationId: regRef.id, ticketNumber: c.lastTicket + 1 });
          tx.set(doc(db, `seasons/${S}/phones/${attacker.phone}`), { registrationIds: [regRef.id] });
          if (extraWrite) tx.update(doc(db, `seasons/${S}/phones/9000000099`), { registrationIds: arrayUnion(regRef.id) });
        });
      };
      await assertFails(attack(true));
      await assertSucceeds(attack(false));
    });
  });
});

describe('public attacks on single documents', () => {
  it('cannot bump the ticket counter without a registration', async () => {
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/meta/counter`), { lastTicket: 1, lastSubmission: 1, lastRegistrationId: 'x' }));
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/meta/counter`), { lastTicket: 5 }));
  });

  it('cannot create, replace or delete the counter, season or registrations', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertFails(setDoc(doc(as(null), `seasons/${S}/meta/counter`), { lastTicket: 0, lastSubmission: 0, lastRegistrationId: '' }));
    await assertFails(deleteDoc(doc(as(null), `seasons/${S}/meta/counter`)));
    await assertFails(setDoc(doc(as(null), 'seasons/2027'), settings({ season: '2027' })));
    await assertFails(deleteDoc(doc(as(null), `seasons/${S}`)));
    await assertFails(deleteDoc(doc(as(null), `seasons/${S}/registrations/${id}`)));
    await assertFails(deleteDoc(doc(as(null), `seasons/${S}/aadhaar/${sha(devotee(1).aadhaar)}`)));
    await assertFails(deleteDoc(doc(as(null), `seasons/${S}/phones/${devotee(1).phone}`)));
  });

  it('cannot edit an existing Aadhaar entry or write to unknown paths', async () => {
    await register(as(null), [devotee(1)]);
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/aadhaar/${sha(devotee(1).aadhaar)}`), { ticketNumber: 99 }));
    await assertFails(setDoc(doc(as(null), `seasons/${S}/meta/other`), { a: 1 }));
    await assertFails(setDoc(doc(as(null), `seasons/${S}/anything/x`), { a: 1 }));
    await assertFails(setDoc(doc(as(null), 'stuff/x'), { a: 1 }));
  });

  it('cannot create the same registration twice or reuse an old registration id', async () => {
    const id = await register(as(null), [devotee(1)]);
    const db = as(null);
    await assertFails(
      runTransaction(db, async tx => {
        const c = (await tx.get(doc(db, `seasons/${S}/meta/counter`))).data();
        tx.set(doc(db, `seasons/${S}/registrations/${id}`), { submissionNo: c.lastSubmission + 1, firstTicket: c.lastTicket + 1, members: [memberDoc(devotee(2), c.lastTicket + 1)], swamyName: 'Guru Swamy', swamyPhone: '9848011111', createdAt: serverTimestamp(), createdBy: null });
        tx.update(doc(db, `seasons/${S}/meta/counter`), { lastTicket: c.lastTicket + 1, lastSubmission: c.lastSubmission + 1, lastRegistrationId: id });
      }),
    );
  });

  it('cannot read staff requests, signed in or not', async () => {
    await staff('alice', 'pending');
    await assertFails(getDoc(doc(as(null), `seasons/${S}/staff/alice`)));
    await assertFails(getDoc(doc(as({ uid: 'mallory', email: 'mallory@example.com' }), `seasons/${S}/staff/alice`)));
    await assertFails(getDocs(collection(as({ uid: 'mallory', email: 'mallory@example.com' }), `seasons/${S}/staff`)));
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

  it('cannot file a request under someone else\'s email or with extra fields', async () => {
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ email: OWNER.email })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ decidedBy: OWNER.email })));
  });

  it('cannot file a request that is oversized, has a foreign picture, or a made-up time', async () => {
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ name: 'A'.repeat(5000) })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ name: 42 })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ photoURL: 'https://evil.example/track.png' })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ photoURL: 'javascript:alert(1)' })));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ requestedAt: new Date('2020-01-01') })));
    await assertSucceeds(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request({ photoURL: 'https://lh3.googleusercontent.com/a/abc=s96-c' })));
  });

  it('cannot delete or re-file a decided request', async () => {
    await staff('alice', 'rejected');
    await assertFails(deleteDoc(doc(as(alice), `seasons/${S}/staff/alice`)));
    await assertFails(setDoc(doc(as(alice), `seasons/${S}/staff/alice`), request()));
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
    await assertFails(updateDoc(doc(as(carol), `seasons/${S}/staff/carol`), { role: 'admin', status: 'approved' }));
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
    // Look-alike addresses are not the owner either.
    for (const email of ['SANTHANKRISHNA18@gmail.com', 'santhankrishna18@gmail.com.evil.com', 'xsanthankrishna18@gmail.com']) {
      await assertFails(updateDoc(doc(as({ uid: 'x', email }), `seasons/${S}`), { totalTickets: 10 }));
    }
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

  /** Mark one registration's members the way the app does and let the test change them further. */
  const edit = async (user, id, change) => {
    const ref = doc(as(user), `seasons/${S}/registrations/${id}`);
    const members = (await getDoc(ref)).data().members.map((m, i) => ({ ...m, ...change(m, i) }));
    return updateDoc(ref, { members, updatedAt: serverTimestamp() });
  };

  it('volunteers list registrations and mark payments', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(getDocs(collection(as(vol), `seasons/${S}/registrations`)));
    await assertSucceeds(edit(vol, id, () => ({ paymentStatus: 'Paid' })));
    await assertFails(updateDoc(doc(as(vol), `seasons/${S}/registrations/${id}`), { submissionNo: 99 }));
  });

  it('volunteers correct a name, age, gender, phone and address but nothing else', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(edit(vol, id, () => ({ name: 'Corrected Name', age: 41, gender: 'Female', phone: '9848000099', address: 'New address' })));
    await assertFails(edit(vol, id, () => ({ ticketNumber: 99 })));
    await assertFails(edit(vol, id, () => ({ aadhaarLast4: '0000' })));
    await assertFails(edit(vol, id, () => ({ isAdmin: true })));
    await assertFails(edit(vol, id, () => ({ name: 'A'.repeat(5000) })));
    await assertFails(edit(vol, id, () => ({ phone: 'abc' })));
    await assertFails(edit(vol, id, () => ({ paymentStatus: 'Refunded' })));
    await assertFails(edit(vol, id, () => ({ age: 'old' })));
  });

  it('admins also correct the last 4 digits of the Aadhaar number', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertSucceeds(edit(adm, id, () => ({ aadhaarLast4: '1234' })));
    await assertFails(edit(adm, id, () => ({ ticketNumber: 99 })));
  });

  it('a staff edit stamps the real server time and keeps the number of devotees', async () => {
    const id = await register(as(null), [devotee(1), devotee(2)]);
    const ref = doc(as(vol), `seasons/${S}/registrations/${id}`);
    const members = (await getDoc(ref)).data().members;
    await assertFails(updateDoc(ref, { members, updatedAt: new Date('2020-01-01') }));
    await assertFails(updateDoc(ref, { members: members.slice(0, 1), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { members, updatedAt: serverTimestamp() }));
  });

  it('pending, declined and removed people see nothing', async () => {
    await register(as(null), [devotee(1)]);
    await staff('rej', 'rejected');
    await staff('rev', 'revoked');
    for (const uid of ['pend', 'rej', 'rev']) {
      const u = { uid, email: `${uid}@example.com` };
      await assertFails(getDocs(collection(as(u), `seasons/${S}/registrations`)));
      await assertFails(getDocs(collection(as(u), `seasons/${S}/phones`)));
    }
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
    const fixed = sha('234500000099');
    const move = db => runTransaction(db, async tx => {
      tx.set(doc(db, `seasons/${S}/aadhaar/${fixed}`), { aadhaar: '234500000099', registrationId: id, ticketNumber: 1 });
      tx.delete(doc(db, `seasons/${S}/aadhaar/${sha(devotee(1).aadhaar)}`));
    });
    await assertFails(move(as(null)));
    await assertFails(move(as(vol)));
    await assertSucceeds(move(as(adm)));
  });

  it('even an admin cannot file a malformed Aadhaar entry', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertFails(setDoc(doc(as(adm), `seasons/${S}/aadhaar/not-a-hash`), { aadhaar: '234500000099', registrationId: id, ticketNumber: 1 }));
    await assertFails(setDoc(doc(as(adm), `seasons/${S}/aadhaar/${sha('x')}`), { aadhaar: 'bad', registrationId: id, ticketNumber: 1 }));
  });

  it('organizers move a registration to a corrected phone number; the public cannot', async () => {
    const id = await register(as(null), [devotee(1)]);
    await register(as(null), [devotee(2)]); // so the first is no longer the latest registration
    await assertFails(setDoc(doc(as(null), `seasons/${S}/phones/9000000001`), { registrationIds: [id] }));
    await assertSucceeds(setDoc(doc(as(vol), `seasons/${S}/phones/9000000001`), { registrationIds: [id] }));
    await assertSucceeds(updateDoc(doc(as(vol), `seasons/${S}/phones/${devotee(1).phone}`), { registrationIds: [] }));
    await assertFails(updateDoc(doc(as(null), `seasons/${S}/phones/9000000001`), { registrationIds: [] }));
  });

  it('organizers cannot write a phone entry that is not a phone number', async () => {
    await assertFails(setDoc(doc(as(vol), `seasons/${S}/phones/hello`), { registrationIds: [] }));
    await assertFails(setDoc(doc(as(vol), `seasons/${S}/phones/9000000001`), { registrationIds: 'x' }));
  });

  it('only the main admin deletes registrations', async () => {
    const id = await register(as(null), [devotee(1)]);
    await assertFails(deleteDoc(doc(as(adm), `seasons/${S}/registrations/${id}`)));
    await assertFails(deleteDoc(doc(as(vol), `seasons/${S}/registrations/${id}`)));
    await assertSucceeds(deleteDoc(doc(as(OWNER), `seasons/${S}/registrations/${id}`)));
  });

  it('a removed organizer loses access straight away', async () => {
    await register(as(null), [devotee(1)]);
    await assertSucceeds(getDocs(collection(as(vol), `seasons/${S}/registrations`)));
    await staff('vol', 'revoked');
    await assertFails(getDocs(collection(as(vol), `seasons/${S}/registrations`)));
  });
});
