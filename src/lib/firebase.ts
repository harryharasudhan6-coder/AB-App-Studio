// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// CRITICAL FIX: Read environment variables from the Vercel/Next.js runtime.
// If the variables were hardcoded, Vercel deployment would fail to connect.
const firebaseConfig = {
  // We use the NEXT_PUBLIC_ prefix to access these keys in the browser environment
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

// Initialize Firebase
// This check prevents initializing the app multiple times in a server/hot-reload environment
const app = !getApps().length ? initializeApp(firebaseConfig as any) : getApp();
const db = getFirestore(app);

export { app, db };
