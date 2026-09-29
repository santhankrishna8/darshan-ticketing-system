import { Injectable, signal } from '@angular/core';

const STORE = 'seva.biometric';
const UNLOCKED = 'seva.unlocked';

interface Enrollment {
  uid: string;
  credentialId: string;
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

function read<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: biometric unlock simply stays unavailable */
  }
}

/**
 * Fingerprint / face unlock for staff on their own phone, using the device's platform
 * authenticator (WebAuthn). Google sign-in stays the real identity check that Firestore
 * rules enforce; this adds a device lock on top so a persisted session cannot be used by
 * whoever picks up the phone. The unlock lasts until the browser tab is closed.
 */
@Injectable({ providedIn: 'root' })
export class BiometricService {
  readonly supported = signal(false);
  private readonly enrollment = signal<Enrollment | null>(read(localStorage, STORE));
  private readonly unlockedUid = signal<string | null>(read(sessionStorage, UNLOCKED));

  constructor() {
    const PKC = (globalThis as any).PublicKeyCredential;
    PKC?.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then((ok: boolean) => this.supported.set(ok))
      .catch(() => this.supported.set(false));
  }

  isEnrolled(uid: string | undefined): boolean {
    return !!uid && this.enrollment()?.uid === uid;
  }

  isUnlocked(uid: string | undefined): boolean {
    return !!uid && this.unlockedUid() === uid;
  }

  markUnlocked(uid: string | null): void {
    this.unlockedUid.set(uid);
    write(sessionStorage, UNLOCKED, uid);
  }

  async enroll(user: { uid: string; email: string; name: string }): Promise<void> {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge(),
        rp: { name: 'Govindamala Seva', id: location.hostname },
        user: { id: new TextEncoder().encode(user.uid), name: user.email, displayName: user.name || user.email },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Fingerprint setup was cancelled.');
    const enrollment = { uid: user.uid, credentialId: b64url(cred.rawId) };
    this.enrollment.set(enrollment);
    write(localStorage, STORE, enrollment);
    this.markUnlocked(user.uid);
  }

  /** Resolves true only when the device confirmed the person with fingerprint, face or device PIN. */
  async unlock(uid: string): Promise<boolean> {
    const e = this.enrollment();
    if (!e || e.uid !== uid) return false;
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64url(e.credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const data = assertion && new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData);
    const userVerified = !!data && (data[32] & 0x04) !== 0; // UV flag
    if (userVerified) this.markUnlocked(uid);
    return userVerified;
  }

  forget(): void {
    this.enrollment.set(null);
    write(localStorage, STORE, null);
    this.markUnlocked(null);
  }
}
