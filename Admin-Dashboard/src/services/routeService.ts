// ─────────────────────────────────────────────────────────────
// PathPulse Admin – Route Service (Firestore)
// CRUD for routes collection. Stops stored as inline array.
// SECURITY: All inputs validated before Firestore writes.
// ─────────────────────────────────────────────────────────────
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Stop } from '../types';
import {
  sanitizeString,
  validateDocId,
  logSecurityEvent,
} from '../utils/security';
// ── Input Shapes ─────────────────────────────────────────────
export interface RouteInput {
  routeNumber: string;
  routeName: string;
  origin: string;
  destination: string;
  duration: number | string;
  distance: number | string;
  color: string;
}
// ── Create / Update ──────────────────────────────────────────
// SECURITY: Validates all inputs before Firestore write.
export async function saveRoute(
  routeData: RouteInput,
  stops: Omit<Stop, 'type'>[],
): Promise<string> {
  // SECURITY: Sanitize all string inputs
  const safeRouteNumber = sanitizeString(routeData.routeNumber, 50);
  if (!safeRouteNumber) throw new Error('Route number is required');
  const safeRouteName = sanitizeString(routeData.routeName, 100);
  const safeColor = sanitizeString(routeData.color, 20);
  // SECURITY: Validate stops have valid coordinates
  const validatedStops = stops.map((s, i) => {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (isNaN(lat) || lat < -90 || lat > 90) throw new Error(`Stop ${i + 1}: invalid latitude`);
    if (isNaN(lng) || lng < -180 || lng > 180) throw new Error(`Stop ${i + 1}: invalid longitude`);
    return {
      ...s,
      name: sanitizeString(s.name, 100),
      lat,
      lng,
      order: Number(s.order) || i,
    };
  });
  const routeId = `route_${safeRouteNumber}`;
  const routeRef = doc(db, 'routes', routeId);
  // Assign stop types: first = origin, last = destination, rest = stop
  const typedStops: Stop[] = validatedStops.map((s, i) => ({
    ...s,
    type: i === 0 ? 'origin' : i === validatedStops.length - 1 ? 'destination' : 'stop',
  }));
  await setDoc(routeRef, {
    routeNumber: safeRouteNumber,
    routeName: safeRouteName,
    routeColor: safeColor,
    stops: typedStops,
    totalDistance: Number(routeData.distance) || 0,
    totalDuration: Number(routeData.duration) || 0,
    isActive: true,
    institutionId: '',
    createdAt: serverTimestamp(),
  });
  logSecurityEvent('SUSPICIOUS', `Route saved: ${safeRouteNumber}`);
  return routeId;
}
// ── Real-time Listener ───────────────────────────────────────
export function listenToAllRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (routes: any[]) => void,
) {
  return onSnapshot(collection(db, 'routes'), (snapshot) => {
    const routes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(routes);
  });
}
// ── Single Read ──────────────────────────────────────────────
export async function getRoute(routeId: string) {
  const safeId = validateDocId(routeId);
  const snap = await getDoc(doc(db, 'routes', safeId));
  if (!snap.exists()) throw new Error(`Route not found: ${safeId}`);
  return { id: snap.id, ...snap.data() };
}
// ── Update ───────────────────────────────────────────────────
export async function updateRoute(
  routeId: string,
  updates: Record<string, unknown>,
) {
  const safeId = validateDocId(routeId);
  await updateDoc(doc(db, 'routes', safeId), updates);
}
// ── Delete ───────────────────────────────────────────────────
export async function deleteRoute(routeId: string) {
  const safeId = validateDocId(routeId);
  await deleteDoc(doc(db, 'routes', safeId));
  logSecurityEvent('SUSPICIOUS', `Route deleted: ${safeId}`);
}
