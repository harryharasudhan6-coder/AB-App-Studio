// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration - HARDCODED VALUES FOR TESTING VERCEL
const firebaseConfig = {
  "projectId": "ab-account-xdg7o",
  "appId": "1:187606527823:web:6ebfbef5f65ed459979f3a",
  "storageBucket": "ab-account-xdg7o.firebasestorage.app", // Using the correct .firebasestorage.app
  "apiKey": "AIzaSyDDlng2qM0WSWn6Ev-PfvK0q_2HSHQ-_Ck",
  "authDomain": "ab-account-xdg7o.firebaseapp.com",
  "messagingSenderId": "187606527823"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig as any) : getApp();
const db = getFirestore(app);

export { app, db };
