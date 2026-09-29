import { GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential } from 'firebase/auth';
import { environment } from '../../environments/environment';
import { firebaseApp } from './firebase';

// Kept apart from firebase.ts so public pages do not download the auth SDK.
export const auth = getAuth(firebaseApp);

if (environment.useEmulators) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  // Automated tests: sign in as a Google user without the Google popup. The emulator accepts
  // unsigned tokens; the real project never would, and this build flag is off in production.
  (window as any).__emulatorSignIn = (email: string, name = email) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
}
