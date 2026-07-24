import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { validateDocId } from '../utils/security';
// SECURITY: All document IDs validated before Firestore operations.
export async function getDriver(driverId: string) {
  const safeId = validateDocId(driverId);
  const snap = await getDoc(doc(db, 'drivers', safeId));
  if (!snap.exists()) throw new Error(`Driver not found: ${safeId}`);
  return { id: snap.id, ...snap.data() };
}
export function listenToDriver(driverId: string, callback: (data: Record<string, unknown> | null) => void) {
  const safeId = validateDocId(driverId);
  return onSnapshot(doc(db, 'drivers', safeId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
}
export async function updateDriver(driverId: string, updates: Record<string, unknown>) {
  const safeId = validateDocId(driverId);
  await updateDoc(doc(db, 'drivers', safeId), updates);
}
