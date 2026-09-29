import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

export const firebaseApp = initializeApp(environment.firebaseConfig);
export const db = getFirestore(firebaseApp);
export const SEASON = environment.season;

if (environment.useEmulators) connectFirestoreEmulator(db, location.hostname, 8080);
