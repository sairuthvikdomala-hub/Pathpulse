import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import busIcon from '../assets/bus.png';
const busImage = busIcon;
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import type { Stop, BusDoc, RouteDoc } from '../types';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;
// ── Haversine distance (km) ────────────────────
function calculateDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
// ── Predictive ETA: ETA = distance / max(speed, 20) ────
function calculateETA(distanceKm: number, speedKmh: number): number {
  if (distanceKm <= 0) return 0;
  const effectiveSpeed = Math.max(speedKmh, MIN_SPEED_KMH);
  let mins = (distanceKm / effectiveSpeed) * 60;
  if (mins < 1 && distanceKm > 0.2) mins = 1;
  return Math.round(mins);
}
// ── Find next upcoming stop ────────────────────
function getNextStop(busPos: { lat: number; lng: number }, stops: Stop[]) {
  if (stops.length < 2)
    return {
      nextStop: null as Stop | null,
      nextStopIndex: -1,
      distanceToNextStop: 0,
      currentLegIndex: -1,
    };
  for (let i = 0; i < stops.length - 1; i++) {
    const A = stops[i],
      B = stops[i + 1];
    const dAB = calculateDistance(A, B);
    const dA = calculateDistance(A, busPos);
    const dB = calculateDistance(busPos, B);
    if (dA + dB <= dAB + 0.1) {
      return {
        nextStop: B as Stop | null,
        nextStopIndex: i + 1,
        distanceToNextStop: dB,
        currentLegIndex: i,
      };
    }
  }
  let minDist = Infinity,
    nearIdx = 0;
  stops.forEach((s, i) => {
    const d = calculateDistance(busPos, s);
    if (d < minDist) {
      minDist = d;
      nearIdx = i;
    }
  });
  const nextIdx = Math.min(nearIdx + 1, stops.length - 1);
  return {
    nextStop: stops[nextIdx] as Stop | null,
    nextStopIndex: nextIdx,
    distanceToNextStop: calculateDistance(busPos, stops[nextIdx]),
    currentLegIndex: nearIdx,
  };
}
// ── Get ETA for ALL upcoming stops ─────────────
interface UpcomingStopETA {
  stopName: string;
  distanceKm: number;
  etaMinutes: number;
  passed: boolean;
}
function getUpcomingStopsETA(
  busPos: { lat: number; lng: number },
  stops: Stop[],
  speedKmh: number,
  legDistances?: number[]
): UpcomingStopETA[] {
  if (stops.length < 2) return [];
  const { currentLegIndex, distanceToNextStop } = getNextStop(busPos, stops);
  const results: UpcomingStopETA[] = [];
  let cumDist = 0;
  for (let i = 0; i < stops.length; i++) {
    if (i <= currentLegIndex) {
      results.push({
        stopName: stops[i].name,
        distanceKm: 0,
        etaMinutes: 0,
        passed: true,
      });
      continue;
    }
    if (i === currentLegIndex + 1) {
      cumDist = distanceToNextStop;
    } else {
      const legDist = legDistances?.[i - 1];
      cumDist +=
        legDist !== undefined
          ? legDist
          : calculateDistance(stops[i - 1], stops[i]);
    }
    results.push({
      stopName: stops[i].name,
      distanceKm: parseFloat(cumDist.toFixed(2)),
      etaMinutes: calculateETA(cumDist, speedKmh),
      passed: false,
    });
  }
  return results;
}
const MIN_SPEED_KMH = 20; // Floor speed for ETA — prevents infinite ETA when stopped
const STOP_GAP = 92;
const PIN_H = 56; // SVG height in px
const PIN_W = 52; // SVG width in px
const ON_LEG_TOLERANCE_KM = 0.5;
// ── OSRM road route fetch ──────────────────────
async function fetchRoadRoute(stops: Stop[]): Promise<{
  distance: number;
  coords: [number, number][];
  legDistances: number[];
}> {
  if (stops.length < 2) return { distance: 0, coords: [], legDistances: [] };
  const coordStr = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const legDistances = route.legs
        ? route.legs.map((l: any) => l.distance / 1000)
        : [];
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      return { distance: route.distance / 1000, coords, legDistances };
    }
  } catch (err) {
    console.error('OSRM routing failed:', err);
  }
  const coords: [number, number][] = stops.map((s) => [s.lat, s.lng]);
  const legDistances: number[] = [];
  let dist = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const d = calculateDistance(stops[i], stops[i + 1]);
    dist += d;
    legDistances.push(d);
  }
  return { distance: dist, coords, legDistances };
}

// ── Derive speed from GPS position delta ──────
// Called BEFORE updateBusOnMap overwrites prevBusPos
function deriveSpeedFromDelta(
  prevPos: { lat: number; lng: number; time: number } | null,
  currentPos: { lat: number; lng: number },
  reportedSpeed: number
): number {
  // If driver app reports a valid non-zero speed, trust it
  if (reportedSpeed > 0) return reportedSpeed;

  // Otherwise compute from position change
  if (!prevPos) return 0;

  const timeDeltaMs = Date.now() - prevPos.time;
  // Only compute if last update was between 1s and 5 minutes ago
  if (timeDeltaMs < 1000 || timeDeltaMs > 300_000) return 0;

  const timeDeltaHours = timeDeltaMs / 3_600_000;
  const distKm = calculateDistance(prevPos, currentPos);

  // Ignore sub-meter noise (GPS jitter)
  if (distKm < 0.005) return 0;

  const derived = Math.round(distKm / timeDeltaHours);

  // Sanity clamp: buses don't go faster than 120 km/h
  return Math.min(derived, 120);
}

// ── Component ──────────────────────────────────
function TrackingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const busNumberParam =
    searchParams.get('bus') || searchParams.get('route') || '';
  const studentStop = searchParams.get('start') || '';
  const [viewMode, setViewMode] = useState<'polyline' | 'realtime'>('polyline');
  const [headerTitle, setHeaderTitle] = useState('PathPulse – Live Tracking');
  const [headerSub, setHeaderSub] = useState('Searching for bus…');
  const [busNumber, setBusNumber] = useState('');
  const [resolvingStations, setResolvingStations] = useState(false);
  const [matchingBuses, setMatchingBuses] = useState<
    { busNumber: string; routeName: string; status: string }[]
  >([]);
  const [busNotFound, setBusNotFound] = useState(false);
  const [connected, setConnected] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  const [currentStopName, setCurrentStopName] = useState('—');
  const [speed, setSpeed] = useState<number>(0);
  const [eta1Label, setEta1Label] = useState('—');
  const [eta1Time, setEta1Time] = useState('—');
  const [progress, setProgress] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('Connecting…');
  const [busStatus, setBusStatus] = useState('');
  const [roadDistance, setRoadDistance] = useState<number>(0);
  const [nextStopName, setNextStopName] = useState('—');
  const [nextStopDist, setNextStopDist] = useState(0);
  const [nextStopEta, setNextStopEta] = useState(0);
  const [upcomingStops, setUpcomingStops] = useState<UpcomingStopETA[]>([]);
  const notifiedStopsRef = useRef<Set<string>>(new Set());
  // Straight-line view state
  const [busLoc, setBusLoc] = useState<{
    top: number;
    index: number;
    ratio: number;
  } | null>(null);
  const [outsideRoute, setOutsideRoute] = useState(false);
  const studentEnd = searchParams.get('end') || '';
  // Leaflet refs
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const busMarker = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapLayers = useRef<any[]>([]);
  const routeRef = useRef<Stop[]>([]);
  const legDistancesRef = useRef<number[]>([]);
  const prevBusPos = useRef<{ lat: number; lng: number; time: number } | null>(
    null
  );
  const routeColorRef = useRef('#2F3E66');
  const [lastBusPos, setLastBusPos] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [lastBusName, setLastBusName] = useState('');
  const lastRKRef = useRef<string>('');
  // ── Init/destroy Leaflet map on viewMode change ──
  useEffect(() => {
    if (viewMode !== 'realtime') {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        busMarker.current = null;
        mapLayers.current = [];
      }
      return;
    }
    if (!mapRef.current || mapInstance.current) return;
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstance.current) return;
      const map = L.map(mapRef.current, {
        center: [17.385, 78.487],
        zoom: 12,
        zoomControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: 'topleft' }).addTo(map);
      mapInstance.current = map;
      if (routeRef.current.length > 0) {
        drawRouteOnMap(routeRef.current, routeColorRef.current);
      }
      if (lastBusPos && lastBusName) {
        updateBusOnMap(lastBusPos, lastBusName);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [viewMode, lastBusPos, lastBusName]);
  // ── Station Resolution ──
  useEffect(() => {
    if (busNumberParam) {
      setBusNumber(busNumberParam);
      return;
    }
    if (!studentStop || !studentEnd) return;
    async function resolveStations() {
      setResolvingStations(true);
      try {
        const routeSnap = await getDocs(collection(db, 'routes'));
        const matchingRouteIds: Record<string, string> = {};
        routeSnap.docs.forEach((doc) => {
          const r = doc.data() as RouteDoc;
          const stops = r.stops || [];
          const startIdx = stops.findIndex(
            (s) => s.name.toLowerCase() === studentStop.toLowerCase()
          );
          const endIdx = stops.findIndex(
            (s) => s.name.toLowerCase() === studentEnd.toLowerCase()
          );
          if (startIdx !== -1 && endIdx !== -1) {
            matchingRouteIds[doc.id] = r.routeName || `Route ${r.routeNumber}`;
          }
        });
        if (Object.keys(matchingRouteIds).length === 0) {
          setBusNotFound(true);
          setHeaderSub('No routes found for these stations');
          setResolvingStations(false);
          return;
        }
        const busSnap = await getDocs(collection(db, 'buses'));
        const matches: {
          busNumber: string;
          routeName: string;
          status: string;
        }[] = [];
        busSnap.docs.forEach((doc) => {
          const b = doc.data() as BusDoc;
          if (b.assignedRouteId && matchingRouteIds[b.assignedRouteId]) {
            matches.push({
              busNumber: b.busNumber,
              routeName: matchingRouteIds[b.assignedRouteId],
              status: b.status,
            });
          }
        });
        setMatchingBuses(matches);
        if (matches.length === 1) {
          setBusNumber(matches[0].busNumber);
        } else if (matches.length === 0) {
          setBusNotFound(true);
          setHeaderSub('No buses currently running on this route');
        }
      } catch (err) {
        console.error('Resolution failed:', err);
      } finally {
        setResolvingStations(false);
      }
    }
    resolveStations();
  }, [busNumberParam, studentStop, studentEnd]);
  // ── Subscribe to bus ──
  useEffect(() => {
    if (!busNumber) return;
    const busesRef = collection(db, 'buses');
    const busQuery = query(busesRef, where('busNumber', '==', busNumber));
    const unsubscribe = onSnapshot(busQuery, async (snapshot) => {
      if (snapshot.empty) {
        setBusNotFound(true);
        setHeaderSub(`Bus "${busNumber}" not found`);
        return;
      }
      setBusNotFound(false);
      const busDocSnap = snapshot.docs[0];
      const bus = { id: busDocSnap.id, ...busDocSnap.data() } as BusDoc;
      // Calculate dynamic status for Offline / At Rest
      let computedStatus = bus.status;
      const OFFLINE_THRESHOLD_SECONDS = 300;
      if (bus.lastUpdated) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lastUpdatedTs = bus.lastUpdated as any;
        const tsMs = lastUpdatedTs?.toDate
          ? lastUpdatedTs.toDate().getTime()
          : lastUpdatedTs?.seconds
          ? lastUpdatedTs.seconds * 1000
          : Date.now();
        const secondsAgo = (Date.now() - tsMs) / 1000;
        if (secondsAgo > OFFLINE_THRESHOLD_SECONDS) {
          computedStatus = 'Offline';
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lastMovedTs = bus.lastMovedTime as any;
          const movedTsMs = lastMovedTs?.toDate
            ? lastMovedTs.toDate().getTime()
            : lastMovedTs?.seconds
            ? lastMovedTs.seconds * 1000
            : 0;
          if (movedTsMs) {
            const movedAgo = (Date.now() - movedTsMs) / 1000;
            if (movedAgo > 600 && (bus.speed === 0 || !bus.speed))
              computedStatus = 'At Rest';
          } else if (
            (bus.speed === 0 || !bus.speed) &&
            secondsAgo < OFFLINE_THRESHOLD_SECONDS
          ) {
            if (bus.status === 'At Rest') computedStatus = 'At Rest';
          }
        }
      } else {
        computedStatus = 'Offline';
      }
      setConnected(computedStatus !== 'Offline');
      setBusStatus(computedStatus);
      setLastUpdate(
        'Updated ' +
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
      );
      // 1. Calculate direction
      const calculateDirection = () => {
        if (bus.manualDirection) return bus.manualDirection;
        const hour = new Date().getHours();
        if (hour >= 7 && hour < 10) return 'forward';
        if (hour >= 16 && hour < 19) return 'reverse';
        return 'reverse';
      };
      const direction = calculateDirection();
      // 2. Continuous Positioning (immediate update)
      const pos = bus.lastLocation
        ? { lat: bus.lastLocation.lat, lng: bus.lastLocation.lng }
        : null;
      if (pos) {
        // ── FIX: Derive speed from position delta BEFORE prevBusPos is overwritten ──
        // bus.speed may be 0 / missing even when the driver app is running.
        // We compute it ourselves from (Δdistance / Δtime) as a reliable fallback.
        const reportedSpeed =
          typeof bus.speed === 'number'
            ? bus.speed
            : typeof bus.speed === 'string'
            ? parseFloat(bus.speed as unknown as string) || 0
            : 0;

        const actualSpeed = deriveSpeedFromDelta(
          prevBusPos.current,
          pos,
          reportedSpeed
        );

        setLastBusPos(pos);
        setLastBusName(bus.busNumber);
        setSpeed(actualSpeed);

        // updateBusOnMap writes new value into prevBusPos — must come AFTER deriveSpeedFromDelta
        updateBusOnMap(pos, bus.busNumber);
        locateBusOnStraightLine(pos);
        computeTracking(pos, actualSpeed);
      } else {
        setOutsideRoute(true);
        setBusLoc(null);
      }
      // 3. Conditional Route Processing (Flipping)
      if (bus.assignedRouteId) {
        const routeId = bus.assignedRouteId;
        const rKey = `${routeId}_${direction}`;
        if (lastRKRef.current !== rKey) {
          lastRKRef.current = rKey;
          getDoc(doc(db, 'routes', routeId))
            .then(async (snap) => {
              if (!snap.exists()) return;
              const route = { id: snap.id, ...snap.data() } as RouteDoc;
              let stops = [...route.stops].sort((a, b) => a.order - b.order);
              if (direction === 'reverse') stops = stops.reverse();
              routeRef.current = stops;
              routeColorRef.current = route.routeColor || '#2F3E66';
              setRouteStops(stops);
              setHeaderTitle(route.routeName || `Route ${route.routeNumber}`);
              setHeaderSub(
                `${stops[0].name} → ${stops[stops.length - 1].name} ${
                  direction === 'reverse' ? '(Return Order)' : '(Pickup Order)'
                }`
              );
              const rd = await fetchRoadRoute(stops);
              setRoadDistance(rd.distance);
              legDistancesRef.current = rd.legDistances;
              if (mapInstance.current)
                drawRouteOnMap(stops, routeColorRef.current);
              if (pos) {
                locateBusOnStraightLine(pos);
                computeTracking(pos, bus.speed || 0);
              }
            })
            .catch((err) => console.error('RouteSyncError:', err));
        }
      }
    });
    return () => unsubscribe();
  }, [busNumber]);
  // ── Draw road-based route on Leaflet map ──
  async function drawRouteOnMap(stops: Stop[], color: string) {
    const map = mapInstance.current;
    if (!map) return;
    mapLayers.current.forEach((l) => map.removeLayer(l));
    mapLayers.current = [];
    const rd = await fetchRoadRoute(stops);
    if (rd.coords.length >= 2) {
      const line = L.polyline(rd.coords, {
        color,
        weight: 5,
        opacity: 0.85,
      }).addTo(map);
      mapLayers.current.push(line);
    }
    stops.forEach((s, i) => {
      const isFirst = i === 0,
        isLast = i === stops.length - 1;
      const isStudent = s.name.toLowerCase() === studentStop.toLowerCase();
      const dotColor = isFirst
        ? '#4CAF82'
        : isLast
        ? '#E05252'
        : isStudent
        ? '#FF6B00'
        : color;
      const radius = isFirst || isLast ? 10 : isStudent ? 8 : 6;
      const marker = L.circleMarker([s.lat, s.lng], {
        radius,
        fillColor: dotColor,
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);
      marker.bindTooltip(s.name, {
        permanent: false,
        direction: 'top',
        offset: [0, -8],
      });
      mapLayers.current.push(marker);
    });
    const pts: [number, number][] = stops.map((s) => [s.lat, s.lng]);
    if (pts.length > 0) map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 });
  }
  function updateBusOnMap(
    pos: { lat: number; lng: number },
    busNumber: string
  ) {
    const map = mapInstance.current;
    // ── Always update prevBusPos with a timestamp here ──
    prevBusPos.current = { ...pos, time: Date.now() };

    if (!map) return;
    if (busMarker.current) {
      busMarker.current.setLatLng([pos.lat, pos.lng]);
      if (!map.getBounds().contains([pos.lat, pos.lng])) {
        map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.8 });
      }
    } else {
      const busIcon = L.icon({
        iconUrl: busImage,
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48],
      });
      busMarker.current = L.marker([pos.lat, pos.lng], {
        icon: busIcon,
        zIndexOffset: 1000,
      }).addTo(map);
      busMarker.current.bindPopup(`<b>🚌 ${busNumber}</b><br/>Live Location`);
      map.setView([pos.lat, pos.lng], 14, { animate: true });
    }
  }
  function locateBusOnStraightLine(busPos: { lat: number; lng: number }) {
    const stops = routeRef.current;
    if (stops.length < 2) return;
    for (let i = 0; i < stops.length - 1; i++) {
      const A = stops[i],
        B = stops[i + 1];
      const dAB = calculateDistance(A, B);
      const dA = calculateDistance(A, busPos);
      const dB = calculateDistance(busPos, B);
      if (dA + dB <= dAB + ON_LEG_TOLERANCE_KM) {
        const ratio = dAB > 0 ? Math.min(1, Math.max(0, dA / dAB)) : 0;
        setBusLoc({ top: i * STOP_GAP + ratio * STOP_GAP, index: i, ratio });
        setOutsideRoute(false);
        return;
      }
    }
    let minDist = Infinity,
      nearIdx = 0;
    stops.forEach((s, i) => {
      const d = calculateDistance(busPos, s);
      if (d < minDist) {
        minDist = d;
        nearIdx = i;
      }
    });
    setBusLoc({ top: nearIdx * STOP_GAP, index: nearIdx, ratio: 0 });
    if (minDist < 1.0) setOutsideRoute(false);
    else setOutsideRoute(true);
  }
  function computeTracking(
    busPos: { lat: number; lng: number },
    currentBusSpeed: number
  ) {
    const stops = routeRef.current;
    if (stops.length < 2) return;
    let minDist = Infinity,
      nearIdx = 0;
    stops.forEach((s, i) => {
      const d = calculateDistance(busPos, { lat: s.lat, lng: s.lng });
      if (d < minDist) {
        minDist = d;
        nearIdx = i;
      }
    });
    setCurrentStopName(stops[nearIdx].name);
    let newProgress = Math.round((nearIdx / (stops.length - 1)) * 100);
    if (nearIdx === stops.length - 1 && minDist > 0.05) {
      newProgress = 99;
    }
    setProgress(Math.min(newProgress, 100));
    const legDists = legDistancesRef.current;
    const next = getNextStop(busPos, stops);
    const { currentLegIndex, distanceToNextStop } = next;
    if (next.nextStop) {
      setNextStopName(next.nextStop.name);
      setNextStopDist(parseFloat(distanceToNextStop.toFixed(2)));
      setNextStopEta(calculateETA(distanceToNextStop, currentBusSpeed));
    }
    const upcoming = getUpcomingStopsETA(
      busPos,
      stops,
      currentBusSpeed,
      legDists
    );
    setUpcomingStops(upcoming);
    // Browser notification when ETA < 5 min
    upcoming
      .filter((u) => !u.passed && u.etaMinutes > 0 && u.etaMinutes <= 5)
      .forEach((u) => {
        const key = u.stopName;
        if (!notifiedStopsRef.current.has(key)) {
          notifiedStopsRef.current.add(key);
          if (
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification('🚌 PathPulse ETA Alert', {
              body: `Bus arriving at ${u.stopName} in ${u.etaMinutes} minute${
                u.etaMinutes > 1 ? 's' : ''
              }!`,
              icon: '/bus.png',
            });
          }
        }
      });
    const studentStopIdx = stops.findIndex(
      (s) => s.name.toLowerCase() === studentStop.toLowerCase()
    );
    if (studentStopIdx >= 0) {
      if (studentStopIdx <= currentLegIndex) {
        setEta1Label(
          nearIdx === studentStopIdx ? 'Bus at your stop' : 'Bus has passed'
        );
        setEta1Time('—');
      } else {
        const match = upcoming.find(
          (u) => u.stopName.toLowerCase() === studentStop.toLowerCase()
        );
        if (match) {
          setEta1Label(
            `${match.etaMinutes} min (${match.distanceKm.toFixed(1)} km)`
          );
          setEta1Time(
            new Date(Date.now() + match.etaMinutes * 60000).toLocaleTimeString(
              [],
              { hour: '2-digit', minute: '2-digit' }
            )
          );
        }
      }
    } else {
      setEta1Label('Select your stop');
      setEta1Time('—');
    }
  }
  const stopCount = routeStops.length;
  const routeHeight = stopCount > 0 ? (stopCount - 1) * STOP_GAP : 0;
  const progressHeight = busLoc ? busLoc.top : 0;
  const controlPanel = (
    <div
      className="control-panel"
      style={{
        background: '#161f2e',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            background:
              busStatus === 'Active'
                ? 'rgba(76,175,130,0.2)'
                : 'rgba(153,153,153,0.15)',
            color: busStatus === 'Active' ? '#4CAF82' : '#999',
          }}
        >
          {busStatus || '—'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
          {lastUpdate}
        </span>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          📍 CURRENT LOCATION
        </div>
        <div
          style={{
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {currentStopName}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          🚀 SPEED
        </div>
        <div
          style={{
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {speed} km/h
        </div>
        {speed > 0 && speed < 20 && (
          <div style={{ color: '#f59e0b', fontSize: 10, marginTop: 4 }}>
            ⚠️ Slow traffic — ETA uses min 20 km/h
          </div>
        )}
        {speed === 0 && (
          <div style={{ color: '#ef4444', fontSize: 10, marginTop: 4 }}>
            🛑 Bus stopped — ETA uses min 20 km/h
          </div>
        )}
      </div>
      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(76,175,130,0.12), rgba(74,144,217,0.08))',
          borderRadius: 12,
          padding: 14,
          border: '1px solid rgba(76,175,130,0.2)',
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          🎯 NEXT STOP
        </div>
        <div
          style={{
            color: '#4CAF82',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {nextStopName}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <div>
            <div
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              DISTANCE
            </div>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {nextStopDist} km
            </div>
          </div>
          <div>
            <div
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              ARRIVAL
            </div>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {nextStopEta} min
            </div>
          </div>
        </div>
      </div>
      {studentStop && (
        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(74,144,217,0.12), rgba(76,175,130,0.08))',
            borderRadius: 12,
            padding: 14,
            border: '1px solid rgba(74,144,217,0.2)',
          }}
        >
          <div
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            ⏱️ ETA TO YOUR STOP
          </div>
          <div
            style={{
              color: '#4A90D9',
              fontSize: 10,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {studentStop}
          </div>
          <div
            style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {eta1Label}
          </div>
          {eta1Time !== '—' && (
            <div
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Arrives ≈ {eta1Time}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          📋 UPCOMING STOPS
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {upcomingStops.filter((u) => !u.passed).length === 0 && (
            <div
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 11,
                fontStyle: 'italic',
              }}
            >
              No upcoming stops
            </div>
          )}
          {upcomingStops
            .filter((u) => !u.passed)
            .map((u, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        u.etaMinutes <= 5
                          ? '#ef4444'
                          : u.etaMinutes <= 10
                          ? '#f59e0b'
                          : '#4CAF82',
                      animation:
                        u.etaMinutes <= 5 ? 'busPulse 1.5s infinite' : 'none',
                    }}
                  />
                  <span
                    style={{
                      color: '#fff',
                      fontSize: 12,
                      fontWeight:
                        u.stopName.toLowerCase() === studentStop.toLowerCase()
                          ? 800
                          : 500,
                      fontFamily: "'Sora', sans-serif",
                    }}
                  >
                    {u.stopName}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      color: u.etaMinutes <= 5 ? '#ef4444' : '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {u.etaMinutes} min
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
                    {u.distanceKm} km
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          📊 ROUTE PROGRESS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #4CAF82, #4A90D9)',
                borderRadius: 3,
                transition: 'width 0.5s',
              }}
            />
          </div>
          <span
            style={{
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              minWidth: 36,
              textAlign: 'right',
            }}
          >
            {progress}%
          </span>
        </div>
        {roadDistance > 0 && (
          <div
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: 10,
              marginTop: 6,
            }}
          >
            Total road distance: {roadDistance.toFixed(1)} km
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div
      className="tracking-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#0f1724',
      }}
    >
      <style>{`
        @keyframes busPulse {
          0% { filter: drop-shadow(0 0 0px rgba(74, 144, 217, 0)); }
          50% { filter: drop-shadow(0 0 15px rgba(74, 144, 217, 0.8)); }
          100% { filter: drop-shadow(0 0 0px rgba(74, 144, 217, 0)); }
        }
        @keyframes busFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        .bus-pin-img { 
          animation: busFloat 2.4s ease-in-out infinite, busPulse 2s ease-in-out infinite; 
          transition: top 0.8s cubic-bezier(0.4,0,0.2,1);
        }
        @media (min-width: 601px) {
          .control-panel { width: 280px; }
          .tracking-content { flex-direction: row !important; }
        }
        @media (max-width: 600px) {
          .control-panel { width: 100%; border-left: none !important; border-top: 1px solid rgba(255,255,255,0.06); }
          .tracking-content { flex-direction: column !important; }
          .map-container { min-height: 50vh; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#161f2e',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: 12,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 2500,
        }}
      >
        <button
          onClick={() => navigate('/home')}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            color: '#fff',
            borderRadius: 10,
            width: 36,
            height: 36,
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div
            style={{
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {headerTitle}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            {headerSub}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: connected
              ? 'rgba(76,175,130,0.15)'
              : 'rgba(255,165,0,0.15)',
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: connected ? '#4CAF82' : '#FFA500',
              boxShadow: `0 0 6px ${connected ? '#4CAF82' : '#FFA500'}`,
            }}
          />
          <span style={{ color: connected ? '#4CAF82' : '#FFA500' }}>
            {connected ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
      </div>
      {resolvingStations ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#fff',
          }}
        >
          <div
            className="bus-loader"
            style={{ fontSize: 40, animation: 'busPulse 1s infinite' }}
          >
            🚌
          </div>
          <div style={{ marginTop: 15, fontSize: 13, opacity: 0.6 }}>
            Finding buses for your stations...
          </div>
        </div>
      ) : matchingBuses.length > 1 && !busNumber ? (
        <div style={{ flex: 1, padding: 25, overflowY: 'auto' }}>
          <h3
            style={{
              color: '#fff',
              fontFamily: "'Sora', sans-serif",
              marginBottom: 20,
            }}
          >
            Select a Bus
          </h3>
          {matchingBuses.map((b, i) => (
            <div
              key={i}
              onClick={() => setBusNumber(b.busNumber)}
              style={{
                background: '#1c2636',
                padding: 18,
                borderRadius: 15,
                marginBottom: 12,
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ color: '#fff', fontWeight: 700 }}>
                    Bus {b.busNumber}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {b.routeName}
                  </div>
                </div>
                <div
                  style={{
                    background:
                      b.status === 'Active'
                        ? 'rgba(76,175,130,0.15)'
                        : 'rgba(255,255,255,0.05)',
                    color: b.status === 'Active' ? '#4CAF82' : '#999',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {b.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : busNotFound ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#fff',
            padding: 30,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: "'Sora', sans-serif" }}>
            Bus Not Found
          </h3>
          <p
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
              maxWidth: 300,
            }}
          >
            {busNumberParam
              ? `No bus "${busNumberParam}" registered.`
              : 'Search from the home page.'}
          </p>
          <button
            onClick={() => navigate('/home')}
            style={{
              marginTop: 16,
              padding: '10px 24px',
              background: '#4A90D9',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ← Go Back
          </button>
        </div>
      ) : (
        <div
          className="tracking-content"
          style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
        >
          <div
            className="map-container"
            style={{
              flex: 1,
              overflow: 'visible',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                zIndex: 2000,
                background: 'rgba(22, 31, 46, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '8px 16px',
                borderRadius: 20,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Sora', sans-serif",
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🚌</span> {busNumber || busNumberParam}
            </div>
            {/* View Toggles */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 2000,
                display: 'flex',
                background: 'rgba(22, 31, 46, 0.85)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: 3,
                gap: 3,
              }}
            >
              {(['polyline', 'realtime'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: "'Sora', sans-serif",
                    borderRadius: 8,
                    background:
                      viewMode === m
                        ? m === 'polyline'
                          ? '#4A90D9'
                          : '#4CAF82'
                        : 'transparent',
                    color: viewMode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.2s',
                  }}
                >
                  {m === 'polyline' ? '📐 Route' : 'Live Map'}
                </button>
              ))}
            </div>
            {viewMode === 'polyline' ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '80px 0 60px',
                  background: '#F4F6F8',
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                {routeStops.length === 0 ? (
                  <div
                    style={{
                      color: '#5C6F8C',
                      textAlign: 'center',
                      paddingTop: 60,
                      fontFamily: "'Sora', sans-serif",
                      fontSize: 14,
                    }}
                  >
                    Loading route…
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'relative',
                      width: 340,
                      flexShrink: 0,
                      height: routeHeight + 60,
                      zIndex: 15,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 58,
                        top: 0,
                        width: 12,
                        height: routeHeight,
                        background: 'linear-gradient(180deg, #2d2d2d, #3a3a3a)',
                        borderRadius: 6,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 5,
                          top: 0,
                          bottom: 0,
                          width: 2,
                          background:
                            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.13) 0px, rgba(255,255,255,0.13) 10px, transparent 10px, transparent 20px)',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        left: 58,
                        top: 0,
                        width: 12,
                        height: progressHeight,
                        background:
                          'linear-gradient(180deg, #4CAF82, rgba(76,175,130,0.5))',
                        borderRadius: 6,
                        transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
                        zIndex: 2,
                      }}
                    />
                    {routeStops.map((stop, i) => (
                      <div
                        key={stop.order}
                        style={{
                          position: 'absolute',
                          left: 58,
                          top: i * STOP_GAP - 10,
                          display: 'flex',
                          alignItems: 'center',
                          zIndex: 20,
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background:
                              i === 0
                                ? '#E05252'
                                : i === stopCount - 1
                                ? '#2F3E66'
                                : busLoc && i < busLoc.index
                                ? '#4CAF82'
                                : '#ffffff',
                            border:
                              i === 0
                                ? '3px solid #E05252'
                                : i === stopCount - 1
                                ? '3px solid #2F3E66'
                                : busLoc && i < busLoc.index
                                ? '3px solid #4CAF82'
                                : stop.name.toLowerCase() ===
                                  studentStop.toLowerCase()
                                ? '3px solid #F5A623'
                                : '3px solid #9ca3af',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transform: 'translateX(-5px)',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 30,
                          }}
                        />
                        <div
                          style={{
                            marginLeft: 16,
                            background: '#fff',
                            padding: '7px 12px',
                            borderRadius: 10,
                            fontSize: 13,
                            color: '#2F3E66',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            borderLeft:
                              stop.name.toLowerCase() ===
                              studentStop.toLowerCase()
                                ? '3px solid #F5A623'
                                : '3px solid #dce3ef',
                          }}
                        >
                          {stop.name}
                        </div>
                      </div>
                    ))}
                    <img
                      src={busImage}
                      alt="Bus"
                      className="bus-pin-img"
                      style={{
                        position: 'absolute',
                        left: 38,
                        top: busLoc ? busLoc.top - PIN_H : -PIN_H,
                        width: PIN_W,
                        height: PIN_H,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 50,
                      }}
                    />
                    {outsideRoute && connected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: routeHeight + 20,
                          left: 0,
                          right: 0,
                          color: '#F5A623',
                          textAlign: 'center',
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Bus is outside route area
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            )}
          </div>
          {controlPanel}
        </div>
      )}
    </div>
  );
}
export default TrackingPage;
