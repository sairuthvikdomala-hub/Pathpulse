import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logSecurityEvent } from '../utils/security';
/**
 * Login flow (SECURITY HARDENED):
 * 1. Authenticate with Firebase Auth (email/password)
 * 2. Check if users/{uid} doc exists in Firestore
 * 3. If NOT exists → DENY access (no auto-creation of admin profiles)
 * 4. Return user + role
 *
 * SECURITY FIX: Removed auto-admin creation on first login.
 * Previously, ANY Firebase Auth user who logged in would get
 * auto-created as an admin — a critical privilege escalation bug.
 * Now, admin users MUST be pre-created via the admin panel.
 */
export async function login(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;
  // SECURITY: Check if user profile exists — do NOT auto-create
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    // SECURITY: Deny access — user has no profile in Firestore
    logSecurityEvent('AUTH_FAIL', `Login denied: no user profile for UID (profile missing)`);
    await signOut(auth); // Sign out the unauthorized user
    throw new Error('Access denied. No admin profile found. Contact the system administrator.');
  }
  const role = snap.data().role as string;
  // SECURITY: Log successful admin logins
  if (role === 'admin') {
    logSecurityEvent('SUSPICIOUS', `Admin login successful`);
  }
  return { user: credential.user, role };
}
export async function logout() {
  await signOut(auth);
}
export async function getUserRole(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 'unknown';
  return snap.data().role as string;
}
export function listenToAuthState(callback: (val: { user: import('firebase/auth').User; role: string } | null) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const role = await getUserRole(user.uid);
        callback({ user, role });
      } catch {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}