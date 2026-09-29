import { firebaseConfig } from './firebase-config';

export const environment = {
  production: false,
  /** The season (Firestore document seasons/{season}) this build registers into. */
  season: '2026',
  /** Talks to the local Firebase emulators instead of the real project. */
  useEmulators: true,
  firebaseConfig,
};
