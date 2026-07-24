// ─────────────────────────────────────────────────────────────
// PathPulse Driver – Driver Service (Firestore)
// Queries assigned bus, fetches route, and handles GPS updates.
// SECURITY: All inputs validated before Firestore writes.
// SECURITY: Rate limiting on GPS updates to prevent abuse.
// ─────────────────────────────────────────────────────────────
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  validateGpsCoords,
  validateBusStatus,
  validateSpeed,
  validateDocId,
  RateLimiter,
  logSecurityEvent,
} from '../utils/security';
// ── Types ────────────────────────────────────────────────────
export interface DriverInfo {
  uid: string;
  name: string;
  phone: string;
  busId: string;
  busNumber: string;
  routeId: string | null;
  routeOrigin: string;
  routeDestination: string;
}
export interface RouteInfo {
  routeNumber: string;
  routeName: string;
  origin: string;
  destination: string;
  stops: {
    order: number;
    name: string;
    lat: number;
    lng: number;
    type: string;
  }[];
}
// ── SECURITY: Rate limiters for Firestore writes ─────────────
// 60 GPS updates per minute (one every second, generous limit)
const gpsRateLimiter = new RateLimiter(60, 60000);
// 60 telemetry writes per minute
const telemetryRateLimiter = new RateLimiter(60, 60000);
// ── Fetch assigned bus for this driver UID ────────────────────
export async function getDriverInfo(uid: string): Promise<DriverInfo> {
  // SECURITY: Validate UID format before Firestore query
  const safeUid = validateDocId(uid);
  const driverSnap = await getDoc(doc(db, 'drivers', safeUid));
  if (!driverSnap.exists()) throw new Error('Driver profile not found');
  const driverData = driverSnap.data();
  const busId = driverData.assignedBusId as string;
  // SECURITY: Validate busId before using in Firestore path
  const safeBusId = validateDocId(busId);
  const busSnap = await getDoc(doc(db, 'buses', safeBusId));
  if (!busSnap.exists()) throw new Error('Assigned bus not found');
  const busData = busSnap.data();
  const routeId = (busData.assignedRouteId as string) || null;
  let routeOrigin = '—';
  let routeDestination = '—';
  if (routeId) {
    const safeRouteId = validateDocId(routeId);
    const routeSnap = await getDoc(doc(db, 'routes', safeRouteId));
    if (routeSnap.exists()) {
      const rd = routeSnap.data();
      const stops = (rd.stops as { name: string; type: string }[]) || [];
      const org = stops.find((s) => s.type === 'origin');
      const dest = stops.find((s) => s.type === 'destination');
      routeOrigin = org?.name || stops[0]?.name || '—';
      routeDestination = dest?.name || stops[stops.length - 1]?.name || '—';
    }
  }
  return {
    uid: safeUid,
    name: driverData.name as string,
    phone: driverData.phone as string,
    busId: safeBusId,
    busNumber: busData.busNumber as string,
    routeId,
    routeOrigin,
    routeDestination,
  };
}
// ── Fetch full route data ────────────────────────────────────
export async function getRouteInfo(routeId: string): Promise<RouteInfo | null> {
  // SECURITY: Validate routeId before Firestore query
  const safeId = validateDocId(routeId);
  const routeSnap = await getDoc(doc(db, 'routes', safeId));
  if (!routeSnap.exists()) return null;
  const rd = routeSnap.data();
  const stops = (rd.stops as RouteInfo['stops']) || [];
  return {
    routeNumber: rd.routeNumber as string,
    routeName: rd.routeName as string,
    origin:
      stops.find((s) => s.type === 'origin')?.name || stops[0]?.name || '—',
    destination:
      stops.find((s) => s.type === 'destination')?.name ||
      stops[stops.length - 1]?.name ||
      '—',
    stops,
  };
}
// ── Push GPS update to Firestore ─────────────────────────────
// SECURITY: Validates all inputs and enforces rate limiting.
// Only ['lastLocation', 'lastUpdated', 'status'] sent to comply with Firestore rules.
export async function pushGpsUpdate(
  busId: string,
  lat: number,
  lng: number,
  _speed: number,
  status: 'Active' | 'Idle' | 'Delayed' | 'Offline'
): Promise<void> {
 // void _speed; // Intentionally unused in bus doc update (strict rule compliance)
  // SECURITY: Rate limiting — prevent excessive Firestore writes
  if (!gpsRateLimiter.tryAcquire()) {
    logSecurityEvent('RATE_LIMIT', `GPS update rate-limited for bus ${busId}`);
    throw new Error(
      'Rate limited: too many GPS updates. Retry after ' +
        Math.ceil(gpsRateLimiter.getRetryAfterMs() / 1000) +
        's'
    );
  }
  // SECURITY: Validate all inputs before Firestore write
  const safeBusId = validateDocId(busId);
  const safeCoords = validateGpsCoords(lat, lng);
  const safeStatus = validateBusStatus(status);
  const safeSpeed = validateSpeed(_speed); 
  await updateDoc(doc(db, 'buses', safeBusId), {
    lastLocation: safeCoords,
    lastUpdated: serverTimestamp(),
    status: safeStatus,
    speed: Math.round(safeSpeed),
  });
}
// ── Write telemetry history ──────────────────────────────────
// SECURITY: Validates inputs and enforces rate limiting.
export async function writeTelemetry(
  busId: string,
  lat: number,
  lng: number,
  speed: number
): Promise<void> {
  // SECURITY: Rate limiting for telemetry writes
  if (!telemetryRateLimiter.tryAcquire()) {
    logSecurityEvent('RATE_LIMIT', `Telemetry rate-limited for bus ${busId}`);
    return; // Silently skip — telemetry is optional/supplementary
  }
  // SECURITY: Validate all inputs
  const safeBusId = validateDocId(busId);
  const safeCoords = validateGpsCoords(lat, lng);
  const safeSpeed = validateSpeed(speed);
  await addDoc(collection(db, 'buses', safeBusId, 'telemetry'), {
    lat: safeCoords.lat,
    lng: safeCoords.lng,
    speed: Math.round(safeSpeed),
    timestamp: serverTimestamp(),
  });
}
// ── Mark bus as stopped ──────────────────────────────────────
// SECURITY: Validates busId before Firestore write.
export async function markBusStopped(busId: string): Promise<void> {
  const safeBusId = validateDocId(busId);
  await updateDoc(doc(db, 'buses', safeBusId), {
    status: 'Offline',
    lastUpdated: serverTimestamp(),
  });
}
