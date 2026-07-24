// ─────────────────────────────────────────────────────────────
// PathPulse Student – Shared Types (aligned with spec)
// ─────────────────────────────────────────────────────────────
export type StopType = 'origin' | 'stop' | 'destination';
export interface Stop {
  order: number;
  name: string;
  lat: number;
  lng: number;
  type: StopType;
}
export type BusStatus = 'Active' | 'Idle' | 'At Rest' | 'Delayed' | 'Offline';
export interface GeoPoint {
  lat: number;
  lng: number;
}
export interface BusDoc {
  id: string;
  busNumber: string;
  institutionId?: string;
  assignedRouteId: string | null;
  driverId: string | null;
  status: BusStatus;
  lastLocation: GeoPoint | null;
  lastUpdated: unknown | null;
  speed?: number;
  manualDirection?: 'forward' | 'reverse' | null;
}
export interface RouteDoc {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  stops: Stop[];
  isActive: boolean;
  totalDistance?: number;
totalDuration?: number;
institutionId?: string;
createdAt?: unknown;
}
export interface BusPosition {
  top: number;
  index: number;
  ratio: number;
}
export interface TrackingStatus {
  nearStop: Stop | null;
  busPosition: BusPosition;
  speed: number | null;
  etaMinutes: number | null;
}
export interface DashboardRow {
  busId: string;
  busNumber: string;
  assignedRouteId: string | null;
  routeNumber: string;
  driverName: string;
  driverPhone: string;
  lastLocation: GeoPoint | null;
  status: BusStatus;
  lastUpdated: unknown | null;
  manualDirection?: 'forward' | 'reverse' | null;
  currentDirection: 'forward' | 'reverse';
  speed?: number;
}

export interface DashboardData {
  rows: DashboardRow[];
  totalBuses: number;
  activeBuses: number;
  idleBuses: number;
  delayedBuses: number;
  offlineBuses: number;
}
export type Bus = BusDoc;
export type Route = RouteDoc;
