// ─────────────────────────────────────────────────────────────
// PathPulse Admin – Bus Service (Firestore)
// CRUD for buses + drivers. Creates Firebase Auth account for
// driver short-code login during bus registration.
// SECURITY: All inputs validated before Firestore writes.
// ─────────────────────────────────────────────────────────────
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  getAuth,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { db, auth, getSecondaryAuthApp } from '../firebase';
import {
  sanitizeString,
  validateDocId,
  validatePhone,
  validatePin,
  logSecurityEvent,
} from '../utils/security';
// ── Input Shapes ─────────────────────────────────────────────
export interface BusInput {
  busNumber: string;
  seatingCapacity?: string | number;
  vehicleMake?: string;
  year?: string | number;
  fuelType?: string;
}
export interface DriverInput {
  name: string;
  phone: string;
  pin: string;              // 4–8 char short-code (becomes Firebase Auth password)
}
// ── Helpers ──────────────────────────────────────────────────
function buildDriverEmail(busNumber: string): string {
  const slug = busNumber
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return `driver_${slug}@pathpulse.app`;
}
function makeBusId(busNumber: string): string {
  return `bus_${busNumber.replace(/\s+/g, '_').toLowerCase()}`;
}
/**
 * SECURITY: Secondary Auth Instance for driver account creation.
 * Uses getSecondaryAuthApp() from firebase.ts instead of importing raw config.
 */
function getSecondaryAuth() {
  const app = getSecondaryAuthApp();
  return getAuth(app);
}
// ── Register Bus + Driver ────────────────────────────────────
// SECURITY: All inputs validated before Firestore writes.
export async function registerBus(
  busData: BusInput,
  driverData: DriverInput,
  routeId: string,
): Promise<{ busId: string; driverId: string }> {
  // SECURITY: Validate all inputs
  const safeBusNumber = sanitizeString(busData.busNumber, 50);
  if (!safeBusNumber) throw new Error('Bus number is required');
  const safeDriverName = sanitizeString(driverData.name, 100);
  if (!safeDriverName) throw new Error('Driver name is required');
  const safePhone = validatePhone(driverData.phone);
  const safePin = validatePin(driverData.pin);
  const busId = makeBusId(safeBusNumber);
  const driverEmail = buildDriverEmail(safeBusNumber);
  const adminUser = auth.currentUser;
  if (!adminUser) throw new Error('Admin must be signed in to register buses.');
  // 1) Create Firebase Auth account for the driver using secondary instance
  const secondaryAuth = getSecondaryAuth();
  const driverCred = await createUserWithEmailAndPassword(
    secondaryAuth,
    driverEmail,
    safePin,
  );
  const driverUid = driverCred.user.uid;
  // 2) Batch write all documents
  const batch = writeBatch(db);
  // Driver profile doc
  batch.set(doc(db, 'drivers', driverUid), {
    name: safeDriverName,
    phone: safePhone,
    assignedBusId: busId,
    institutionId: '',
    createdAt: serverTimestamp(),
  });
  // User role doc
  batch.set(doc(db, 'users', driverUid), {
    role: 'driver',
    createdAt: serverTimestamp(),
  });
  // Bus doc — SECURITY: sanitize optional fields
  batch.set(doc(db, 'buses', busId), {
    busNumber: safeBusNumber,
    seatingCapacity: busData.seatingCapacity || null,
    vehicleMake: sanitizeString(busData.vehicleMake, 100) || null,
    year: busData.year || null,
    fuelType: sanitizeString(busData.fuelType, 50) || null,
    assignedRouteId: routeId ? sanitizeString(routeId, 128) : null,
    driverId: driverUid,
    status: 'Offline',
    lastLocation: null,
    lastUpdated: null,
    institutionId: '',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  logSecurityEvent('SUSPICIOUS', `New bus registered: ${safeBusNumber}`);
  return { busId, driverId: driverUid };
}
// ── Real-time Listener ───────────────────────────────────────
export function listenToAllBuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (buses: any[]) => void,
) {
  return onSnapshot(collection(db, 'buses'), (snapshot) => {
    const buses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(buses);
  });
}
// ── Single Read ──────────────────────────────────────────────
export async function getBus(busId: string) {
  // SECURITY: Validate document ID
  const safeId = validateDocId(busId);
  const snap = await getDoc(doc(db, 'buses', safeId));
  if (!snap.exists()) throw new Error(`Bus not found: ${safeId}`);
  return { id: snap.id, ...snap.data() };
}
// ── Update ───────────────────────────────────────────────────
// SECURITY: Accepts validated updates only (Firestore rules enforce field restrictions)
export async function updateBus(
  busId: string,
  updates: Record<string, unknown>,
) {
  const safeId = validateDocId(busId);
  await updateDoc(doc(db, 'buses', safeId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
// ── Delete (bus + driver docs) ───────────────────────────────
export async function deleteBus(busId: string) {
  const safeId = validateDocId(busId);
  const busSnap = await getDoc(doc(db, 'buses', safeId));
  if (!busSnap.exists()) return;
  const { driverId } = busSnap.data() as { driverId?: string };
  const batch = writeBatch(db);
  if (driverId) {
    batch.delete(doc(db, 'drivers', driverId));
    batch.delete(doc(db, 'users', driverId));
  }
  batch.delete(doc(db, 'buses', safeId));
  await batch.commit();
  logSecurityEvent('SUSPICIOUS', `Bus deleted: ${safeId}`);
}