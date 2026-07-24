// ─────────────────────────────────────────────────────────────
// PathPulse Admin – Dashboard Service (Firestore)
// Merges buses, drivers, and routes into a unified dashboard
// view using real-time listeners. No separate liveTracking
// collection — live data is in buses/{busId} directly.
// ─────────────────────────────────────────────────────────────
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { BusStatus, DashboardRow, DashboardData } from '../types';
// Re-export for consumers
export type { DashboardData, DashboardRow };
const OFFLINE_THRESHOLD_SECONDS = 300; // 5 minutes
function computeStatus(bus: Record<string, unknown>): BusStatus {
  if (!bus.lastUpdated) return 'Offline';
  const ts = bus.lastUpdated as Timestamp;
  const secondsAgo = (Date.now() - ts.toDate().getTime()) / 1000;
  if (secondsAgo > OFFLINE_THRESHOLD_SECONDS) return 'Offline';
  const movedTs = bus.lastMovedTime as Timestamp;
  if (movedTs) {
    const movedAgo = (Date.now() - movedTs.toDate().getTime()) / 1000;
    // 10 minutes = 600 seconds
    if (movedAgo > 600 && bus.speed === 0) return 'At Rest';
  } else if (bus.speed === 0 && secondsAgo < OFFLINE_THRESHOLD_SECONDS) {
    const stored = bus.status as BusStatus | undefined;
    if (stored === 'At Rest') return 'At Rest';
  }
  const stored = bus.status as BusStatus | undefined;
  return stored === 'Idle' || stored === 'Delayed' ? stored : 'Active';
}
function calculateDirection(
  bus: Record<string, unknown>
): 'forward' | 'reverse' {
  // 1. Check for manual override
  const manual = bus.manualDirection as
    | 'forward'
    | 'reverse'
    | null
    | undefined;
  if (manual) return manual;
  // 2. Default to Time-Based Auto Reversal
  const now = new Date();
  const hour = now.getHours();
  // Morning: 7am to 10am -> Forward (Home to School)
  if (hour >= 7 && hour < 10) return 'forward';
  // Evening: 4pm to 7pm -> Reverse (School to Home)
  if (hour >= 16 && hour < 19) return 'reverse';
  // Default
  return 'forward';
}
export function listenToDashboard(
  onUpdate: (data: DashboardData) => void
): () => void {
  let busesMap: Record<string, Record<string, unknown>> = {};
  let driversMap: Record<string, Record<string, unknown>> = {};
  let routesMap: Record<string, Record<string, unknown>> = {};
  function merge() {
    const rows: DashboardRow[] = Object.values(busesMap).map((bus) => {
      const driver = driversMap[bus.driverId as string] || {};
      const route = routesMap[bus.assignedRouteId as string] || {};
      const status = computeStatus(bus);
      const loc = bus.lastLocation as { lat: number; lng: number } | null;
      const currentDirection = calculateDirection(bus);
      return {
        busId: bus.id as string,
        busNumber: bus.busNumber as string,
        assignedRouteId: (bus.assignedRouteId as string) || null,
        routeNumber: (route.routeNumber as string) || '—',
        driverName: (driver.name as string) || '—',
        driverPhone: (driver.phone as string) || '—',
        lastLocation: loc || null,
        status,
        lastUpdated: bus.lastUpdated || null,
        manualDirection:
          (bus.manualDirection as 'forward' | 'reverse' | null) || null,
        currentDirection,
      };
    });
    const stats = {
      totalBuses: rows.length,
      activeBuses: rows.filter((r) => r.status === 'Active').length,
      idleBuses: rows.filter((r) => r.status === 'Idle').length,
      delayedBuses: rows.filter((r) => r.status === 'Delayed').length,
      offlineBuses: rows.filter((r) => r.status === 'Offline').length,
    };
    onUpdate({ rows, ...stats });
  }
  const unsubBuses = onSnapshot(collection(db, 'buses'), (snap) => {
    busesMap = {};
    snap.docs.forEach((d) => {
      busesMap[d.id] = { id: d.id, ...d.data() };
    });
    merge();
  });
  const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
    driversMap = {};
    snap.docs.forEach((d) => {
      driversMap[d.id] = { id: d.id, ...d.data() };
    });
    merge();
  });
  const unsubRoutes = onSnapshot(collection(db, 'routes'), (snap) => {
    routesMap = {};
    snap.docs.forEach((d) => {
      routesMap[d.id] = { id: d.id, ...d.data() };
    });
    merge();
  });
  return function unsubscribeAll() {
    unsubBuses();
    unsubDrivers();
    unsubRoutes();
  };
}
