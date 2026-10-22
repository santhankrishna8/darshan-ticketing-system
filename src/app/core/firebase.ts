import { initializeApp } from 'firebase/app';
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

export const firebaseApp = initializeApp(environment.firebaseConfig);
export const db = getFirestore(firebaseApp);
export const SEASON = environment.season;

// App Check proves a request comes from this website and not from a script calling Firestore directly.
// It does nothing until a site key is set here and "Enforce" is switched on in the Firebase console.
if (environment.appCheckSiteKey && !environment.useEmulators) {
  initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(environment.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}

if (environment.useEmulators) connectFirestoreEmulator(db, location.hostname, 8080);
