import { firebaseConfig } from './firebase-config';

export const environment = {
  production: false,
  /** The season (Firestore document seasons/{season}) this build registers into. */
  season: '2026',
  /** Local testing against the Firebase emulators (npm run start:emulators). */
  useEmulators: false,
  firebaseConfig,
};
