// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const environment = {
    production: false,
  firebaseConfig: {
  apiKey: "AIzaSyCDU_3F4zpbTE1w7PJ606WutApGVJM1Ibc",
  authDomain: "darshanregistration.firebaseapp.com",
  projectId: "darshanregistration",
  storageBucket: "darshanregistration.firebasestorage.app",
  messagingSenderId: "63632252330",
  appId: "1:63632252330:web:948c10457058d23c955fd3",
  measurementId: "G-NB6GB5H0F6"
  }
};
// Initialize Firebase
const app = initializeApp(environment.firebaseConfig);
const analytics = getAnalytics(app);