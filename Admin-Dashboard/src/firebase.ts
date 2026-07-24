import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// SECURITY: Keep Firebase config private to this module.
// Previously exported publicly, which allowed abuse via secondary auth instances.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
// SECURITY: Export a function for secondary auth (bus registration only).
// This is controlled and only used by busService.ts.
export function getSecondaryAuthApp() {
  const secondaryAppName = 'SecondaryAuth';
  const existingApp = getApps().find((a) => a.name === secondaryAppName);
  return existingApp || initializeApp(firebaseConfig, secondaryAppName);
}
export default app;
