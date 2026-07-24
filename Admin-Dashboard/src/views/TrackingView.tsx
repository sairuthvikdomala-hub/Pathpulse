import { useState, useEffect, useRef } from 'react';
import type { Bus, Route, DashboardData } from '../types';
import busIcon from '../assets/bus.png';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;
interface Props {
  buses: Bus[];
  routes: Route[];
  dashboardData: DashboardData | null;
}
async function fetchRoadRoute(stops: any[]) {
  if (stops.length < 2) return { coords: [], distance: 0 };
  const coordStr = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const coords = data.routes[0].geometry.coordinates.map((c: any) => [
        c[1],
        c[0],
      ]);
      return { coords, distance: data.routes[0].distance / 1000 };
    }
  } catch (err) {
    console.error('OSRMFail:', err);
  }
  return { coords: stops.map((s) => [s.lat, s.lng]), distance: 0 };
}
export default function TrackingView({ buses, routes, dashboardData }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const initialFitDone = useRef(false);
  // Visibility toggles for routes
  const [vRoutes, setVRoutes] = useState<string[]>([]);
  const [mapReady, setMapReady] = useState(false);
  // Initialize all routes as visible on first load
  useEffect(() => {
    if (routes.length > 0 && vRoutes.length === 0) {
      setVRoutes(routes.map((r) => r.id));
    }
  }, [routes]);
  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = L.map(mapRef.current, {
        center: [17.385, 78.487],
        zoom: 13,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      // CARTODB POSITRON (PREMIUM MUTED STYLE - NO YELLOW ROADS CLASHING)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
          attribution: '© CartoDB',
          maxZoom: 20,
        }
      ).addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
    }, 100);
    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapReady(false);
      }
    };
  }, []);
  // Main Render Loop (Persistence & Live Updates)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;
    // Clear old layers
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];
    const allPts: [number, number][] = [];
    let isCancelled = false;
    // 1. Draw Selected Routes
    routes
      .filter((r) => vRoutes.includes(r.id))
      .forEach((route) => {
        const assignedBuses = buses.filter(
          (b) => b.assignedRouteId === route.id
        );
        const isReversed = assignedBuses.some(
          (b) =>
            dashboardData?.rows.find((r) => r.busId === b.id)
              ?.currentDirection === 'reverse'
        );
        const processedStops = isReversed
          ? [...route.stops].reverse()
          : route.stops;
        if (!processedStops || processedStops.length < 2) return;
        fetchRoadRoute(processedStops).then((rd) => {
          if (isCancelled || !mapInstanceRef.current) return;
          const polyline = L.polyline(rd.coords, {
            color: route.routeColor || '#4A90D9',
            weight: 6,
            opacity: 0.5,
            lineJoin: 'round',
          }).addTo(mapInstanceRef.current);
          polyline.bindTooltip(
            `Route ${route.routeNumber} (${
              isReversed ? 'Reverse' : 'Forward'
            })`,
            { sticky: true }
          );
          layersRef.current.push(polyline);
        });
        // Stop markers
        processedStops.forEach((stop, idx) => {
          if (!stop.lat || !stop.lng) return;

          const isFirst = idx === 0;
          const isLast = idx === processedStops.length - 1;

          if (isFirst || isLast) {
            const label = isFirst ? 'START' : 'END';
            const bg = isFirst ? '#4CAF82' : '#E05252';

            const icon = L.divIcon({
              html: `
              <div style="
                background:${bg};
                padding:3px 6px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:5px;
                border:2px solid #fff;
                box-shadow:0 2px 4px rgba(0,0,0,0.25);
                color:#fff;
                font-family:Sora, sans-serif;
                font-size:10px;
                font-weight:600;
                white-space:nowrap;
              ">
                ${label}
              </div>
            `,
              className: '',
              iconSize: [40, 18],
              iconAnchor: [20, 9],
            });

            const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);

            marker.bindTooltip(stop.name, {
              direction: 'top',
              offset: [0, -15],
            });

            layersRef.current.push(marker);
          } else {
            const fillColor = route.routeColor || '#4A90D9';

            const circle = L.circleMarker([stop.lat, stop.lng], {
              radius: 5,
              fillColor,
              color: '#fff',
              weight: 2,
              fillOpacity: 1,
            }).addTo(map);

            circle.bindTooltip(stop.name, { direction: 'top' });

            layersRef.current.push(circle);
          }

          allPts.push([stop.lat, stop.lng]);
        });
      });
    // 2. Render ALL buses (Online or last known)
    buses.forEach((bus) => {
      if (!bus.lastLocation) return;
      const { lat, lng } = bus.lastLocation;
      const row = dashboardData?.rows.find((r) => r.busId === bus.id);
      const opacity = bus.status === 'Offline' ? 0.6 : 1;
      const icon = L.icon({
        iconUrl: busIcon,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });
      const marker = L.marker([lat, lng], {
        icon,
        opacity,
        zIndexOffset: 2000,
      }).addTo(map);
      marker.bindPopup(
        `
        <div class="premium-popup">
          <div class="pp-header">
            <span class="pp-bus">🚌 ${bus.busNumber}</span>
            <span class="pp-status status-${bus.status.toLowerCase()}">${
          bus.status
        }</span>
          </div>
          <div class="pp-body">
            <div class="pp-row"><span>Driver</span><b>${
              row?.driverName || '—'
            }</b></div>
            <div class="pp-row"><span>Route</span><b>${
              row?.routeNumber || '—'
            }</b></div>
            <div class="pp-row"><span>Speed</span><b class="speed-val">${
              bus.speed || 0
            } km/h</b></div>
          </div>
          <div class="pp-footer">
            Updated: ${
              bus.lastUpdated && 'toDate' in (bus.lastUpdated as any)
                ? new Date(
                    (bus.lastUpdated as any).toDate()
                  ).toLocaleTimeString()
                : '—'
            }
          </div>
        </div>
      `,
        { className: 'custom-leaflet-popup' }
      );
      layersRef.current.push(marker);
      allPts.push([lat, lng]);
    });
    // Fit bounds on first valid load
    if (allPts.length > 0 && !initialFitDone.current) {
      map.fitBounds(allPts, { padding: [80, 80], maxZoom: 15 });
      initialFitDone.current = true;
    }
    return () => {
      isCancelled = true;
    };
  }, [buses, routes, vRoutes, dashboardData, mapReady]);
  const toggleRoute = (rid: string) => {
    setVRoutes((prev) =>
      prev.includes(rid) ? prev.filter((x) => x !== rid) : [...prev, rid]
    );
  };
  return (
    <div className="tracking-ecosystem">
      {/* Sidebar for filtering and clarity */}
      <div className="tracking-sidebar-lite">
        <div className="sl-header">
          <h3>Fleet Overview</h3>
          <p>Toggle routes to clear overlaps</p>
        </div>
        <div className="sl-filter-section">
          <h4>Filter Tracks</h4>
          <div className="route-grid">
            {routes.map((r) => (
              <div
                key={r.id}
                className={`route-card ${
                  vRoutes.includes(r.id) ? 'active' : ''
                }`}
                onClick={() => toggleRoute(r.id)}
              >
                <div
                  className="rc-color"
                  style={{ background: r.routeColor }}
                />
                <div className="rc-info">
                  <div className="rc-no">Route {r.routeNumber}</div>
                  <div className="rc-name">{r.routeName || 'Custom Route'}</div>
                </div>
                <div className="rc-check">
                  {vRoutes.includes(r.id) ? '✓' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="sl-stats">
          <div className="ss-item">
            <span className="ss-label">Live Units</span>
            <span className="ss-val">
              {buses.filter((b) => b.status === 'Active').length}
            </span>
          </div>
          <div className="ss-item">
            <span className="ss-label">Total Fleet</span>
            <span className="ss-val">{buses.length}</span>
          </div>
        </div>
      </div>
      <div className="tracking-map-area">
        <div
          ref={mapRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <div className="map-overlay-top">
          <div className="mo-pill">
            <div className="s-dot active" />
            Real-time Sync Active
          </div>
        </div>
      </div>
    </div>
  );
}
