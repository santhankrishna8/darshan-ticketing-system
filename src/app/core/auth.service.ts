import { Injectable, computed, inject, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, Unsubscribe, updateDoc } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { BiometricService } from './biometric.service';
import { SEASON, db } from './firebase';
import { auth } from './firebase-auth';
import { StaffMember, StaffRole, StaffStatus } from './models';

export type Access = 'loading' | 'signed-out' | 'locked' | 'pending' | 'rejected' | 'revoked' | 'approved';
export type Role = 'owner' | StaffRole;

const staffCollection = () => collection(db, 'seasons', SEASON, 'staff');

/**
 * Staff sign-in with Google and a permission-request model: anyone may sign in, which
 * files an access request; the main admin (environment.ownerEmails) approves it and
 * picks a role. Firestore rules enforce the same model on the server.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly biometric = inject(BiometricService);

  readonly user = signal<User | null | undefined>(undefined);
  readonly isOwner = signal(false);
  readonly staff = signal<StaffMember | null | undefined>(undefined);
  readonly error = signal<string | null>(null);

  readonly role = computed<Role | null>(() => {
    if (this.isOwner()) return 'owner';
    const s = this.staff();
    return s?.status === 'approved' ? s.role : null;
  });
  readonly canAdmin = computed(() => this.role() === 'owner' || this.role() === 'admin');
  readonly biometricAllowed = computed(() => this.isOwner() || !!this.staff()?.biometricAllowed);

  readonly access = computed<Access>(() => {
    const user = this.user();
    if (user === undefined) return 'loading';
    if (!user) return 'signed-out';
    if (this.biometric.isEnrolled(user.uid) && !this.biometric.isUnlocked(user.uid)) return 'locked';
    if (this.isOwner()) return 'approved';
    const s = this.staff();
    if (s === undefined) return 'loading';
    return (s?.status ?? 'pending') as StaffStatus;
  });

  private staffSub?: Unsubscribe;
  private markReady!: () => void;
  /** Resolves once the first sign-in state and main-admin check are known. */
  readonly ready = new Promise<void>(resolve => (this.markReady = resolve));

  constructor() {
    onAuthStateChanged(auth, user => this.onUser(user));
  }

  async signInWithGoogle(): Promise<void> {
    this.error.set(null);
    // The popup must open straight from the tap: no await before it, or phones block it.
    // ponytail: no redirect fallback; authDomain is another site, so browsers drop the redirect result and sign-in loops.
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const { user } = await signInWithPopup(auth, provider);
      this.biometric.markUnlocked(user.uid);
    } catch (e: any) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        this.error.set(friendly(e));
      }
    }
  }

  /** Backup sign-in at /staff-login for an organizer whose phone cannot finish Google sign-in. Same approval flow afterwards. */
  async signInWithPassword(email: string, password: string): Promise<boolean> {
    this.error.set(null);
    if (!email.trim() || !password) {
      this.error.set('Enter your email and password.');
      return false;
    }
    try {
      const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
      this.biometric.markUnlocked(user.uid);
      return true;
    } catch (e: any) {
      this.error.set(friendly(e));
      return false;
    }
  }

  /** Locks the desk without signing out, so the fingerprint can open it again. */
  lock(): void {
    this.biometric.lock();
  }

  async signOut(): Promise<void> {
    // Fingerprint setup stays on this device; signing out only locks it.
    this.biometric.lock();
    await signOut(auth);
  }

  // ---- main admin: managing people ----

  watchStaff(onChange: (list: StaffMember[]) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      staffCollection(),
      snap => onChange(snap.docs.map(d => d.data() as StaffMember).sort((a, b) => a.email.localeCompare(b.email))),
      onError,
    );
  }

  async decide(uid: string, changes: Partial<Pick<StaffMember, 'status' | 'role' | 'biometricAllowed'>>): Promise<void> {
    await updateDoc(doc(staffCollection(), uid), { ...changes, decidedBy: this.user()?.email ?? '', decidedAt: serverTimestamp() });
  }

  private async onUser(user: User | null): Promise<void> {
    this.staffSub?.();
    this.staff.set(undefined);
    this.isOwner.set(false);
    this.user.set(user);
    if (!user) return this.markReady();

    const email = (user.email ?? '').toLowerCase();
    this.isOwner.set(user.emailVerified && environment.ownerEmails.includes(email));
    if (this.isOwner()) this.markReady();

    const ref = doc(staffCollection(), user.uid);
    this.staffSub = onSnapshot(
      ref,
      async snap => {
        if (snap.exists()) {
          this.staff.set(snap.data() as StaffMember);
          this.markReady();
        } else if (!this.isOwner()) {
          // First sign-in: file an access request for the main admin to review.
          await setDoc(ref, {
            uid: user.uid,
            email: user.email ?? '',
            name: user.displayName ?? '',
            photoURL: user.photoURL ?? '',
            status: 'pending',
            role: 'volunteer',
            biometricAllowed: false,
            requestedAt: serverTimestamp(),
          }).catch(e => {
            this.error.set(friendly(e));
            this.staff.set(null);
            this.markReady();
          });
        } else {
          this.staff.set(null);
        }
      },
      e => {
        this.error.set(friendly(e));
        this.staff.set(null);
        this.markReady();
      },
    );
  }
}

function friendly(e: any): string {
  switch (e?.code) {
    case 'auth/network-request-failed':
      return 'No internet connection. Please try again.';
    case 'auth/unauthorized-domain':
      return 'This website is not yet allowed for Google sign-in. Add it under Firebase Authentication > Settings > Authorized domains.';
    case 'auth/popup-blocked':
      return 'The Google sign-in window was blocked. Allow pop-ups for this site, then tap Sign in again.';
    case 'auth/operation-not-supported-in-this-environment':
      return 'Google sign-in does not work in this app view. Open this page in Chrome or Safari and sign in there.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not turned on yet in Firebase.';
    case 'permission-denied':
      return 'Permission denied. Please make sure the Firestore rules are deployed.';
    default:
      return e?.message ?? 'Something went wrong.';
  }
}
