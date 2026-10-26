// Firebase web config is public by design; access is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCDU_3F4zpbTE1w7PJ606WutApGVJM1Ibc',
  // Sign-in runs on this site's own domain (vercel.json proxies /__/auth to Firebase): phones drop the
  // popup result when the sign-in helper lives on another site. ponytail: localhost has no proxy, so it keeps firebaseapp.com.
  authDomain: location.hostname === 'localhost' ? 'darshanregistration.firebaseapp.com' : location.host,
  projectId: 'darshanregistration',
  storageBucket: 'darshanregistration.firebasestorage.app',
  messagingSenderId: '63632252330',
  appId: '1:63632252330:web:948c10457058d23c955fd3',
  measurementId: 'G-NB6GB5H0F6',
};
