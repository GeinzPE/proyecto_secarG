// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCi0i4DDZdCcynAyG-_pabpzAXnqi7ZuQ0",
  authDomain: "geinz-77974.firebaseapp.com",
  projectId: "geinz-77974",
  storageBucket: "geinz-77974.firebasestorage.app",
  messagingSenderId: "981084787845",
  appId: "1:981084787845:web:225839feded3309abf85ec",
  measurementId: "G-G71DYCXS0F"
};



const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Firestore
export const db = getFirestore(app);
