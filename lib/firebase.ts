import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** False when any NEXT_PUBLIC_FIREBASE_* value is blank — callers skip Firebase entirely. */
export const firebaseEnabled = Object.values(config).every(Boolean);

/** UI gate only. Firestore rules are what actually block non-admin writes. */
export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const isAdminEmail = (email?: string | null) => !!email && ADMIN_EMAILS.includes(email.toLowerCase());

let app: FirebaseApp | null = null;
function firebaseApp(): FirebaseApp {
  if (!firebaseEnabled) throw new Error("Firebase env vars are missing");
  return (app ??= getApps().length ? getApp() : initializeApp(config));
}

export const db = (): Firestore => getFirestore(firebaseApp());
export const auth = (): Auth => getAuth(firebaseApp());
