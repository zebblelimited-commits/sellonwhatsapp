// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth"; // Added GoogleAuthProvider
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCWWU6i7mzba9UKukC2ii118IMHB88onwc",
  // Set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to the Firebase-connected custom
  // domain after DNS is verified. Keep the Firebase fallback for recovery.
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "sellonwhatsapp-c3e0c.firebaseapp.com",
  projectId: "sellonwhatsapp-c3e0c",
  storageBucket: "sellonwhatsapp-c3e0c.firebasestorage.app",
  messagingSenderId: "574073567173",
  appId: "1:574073567173:web:faf6673db6968701be7dac",
  measurementId: "G-BRFJWG1LEF"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); // Initialized for registration/login
// export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
