import { useEffect, useRef } from 'react';
import type { Bus, Route, DashboardData } from '../types';
import busIcon from '../assets/bus.png';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;
interface Props {
  buses: Bus[];
  routes: Route[];
  dashboardData: DashboardData | null;
  onNavigate: (page: string) => void;
}
export default function DashboardView({ buses, routes, dashboardData, onNavigate }: Props) {
  const active = dashboardData?.activeBuses ?? 0;
  const delayed = dashboardData?.delayedBuses ?? 0;
  const colors = ['#2F3E66', '#4CAF82', '#F5A623'];
  // Mini map
  const miniMapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const miniMapInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const miniLayers = useRef<any[]>([]);
  useEffect(() => {
    if (!miniMapRef.current || miniMapInstance.current) return;
    const timer = setTimeout(() => {
      if (!miniMapRef.current || miniMapInstance.current) return;
      const map = L.map(miniMapRef.current, {
        center: [17.385, 78.487], zoom: 11,
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 16 }).addTo(map);
      miniMapInstance.current = map;
    }, 200);
    return () => {
      clearTimeout(timer);
      if (miniMapInstance.current) { miniMapInstance.current.remove(); miniMapInstance.current = null; }
    };
  }, []);
  useEffect(() => {
    const map = miniMapInstance.current;
    if (!map) return;
    miniLayers.current.forEach((l) => map.removeLayer(l));
    miniLayers.current = [];
    const pts: [number, number][] = [];
    buses.forEach((b) => {
      if (!b.lastLocation) return;
      const icon = L.icon({
        iconUrl: busIcon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        tooltipAnchor: [0, -15],
      });
      const marker = L.marker([b.lastLocation.lat, b.lastLocation.lng], {
        icon,
        opacity: b.status === 'Offline' ? 0.6 : 1,
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindTooltip(b.busNumber, { direction: 'top' });
      miniLayers.current.push(marker);
      pts.push([b.lastLocation.lat, b.lastLocation.lng]);
    });
    if (pts.length > 0) map.fitBounds(pts, { padding: [20, 20], maxZoom: 13 });
  }, [buses]);
  return (
    <div className="page-view">
      {/* Stats */}
      <div className="stats-grid mb24">
        <div className="stat-card sc-c1" style={{ animationDelay: '.05s' }}>
          <div className="sc-header">
            <span className="sc-label">Active Buses</span>
            <div className="sc-icon">🚌</div>
          </div>
          <div className="sc-val">{active}</div>
          <div className="sc-change neu">In fleet</div>
        </div>
        <div className="stat-card sc-c3" style={{ animationDelay: '.10s' }}>
          <div className="sc-header">
            <span className="sc-label">Delayed Buses</span>
            <div className="sc-icon">⚠️</div>
          </div>
          <div className="sc-val">{delayed}</div>
          <div className="sc-change dn">Active delays</div>
        </div>
      </div>
      {/* Route Overview */}
      <div className="section-title mb16">Route Overview</div>
      <div className="mb24" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
        {routes.length === 0 ? (
          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)', color: 'var(--secondary)', fontSize: 13 }}>
            No routes yet. <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onNavigate('routes')}>Add one →</span>
          </div>
        ) : (
          routes.map((r, i) => {
            const busCount = buses.filter((b) => b.assignedRouteId === r.id).length;
            return (
              <div className="route-mini-card" key={r.id} style={{ minWidth: '300px', borderLeftColor: r.routeColor || colors[i % colors.length] }}>
                <div className="rmc-num">Route {r.routeNumber}</div>
                <div className="rmc-name">
                  {r.stops.length > 0 ? `${r.stops[0].name} → ${r.stops[r.stops.length - 1].name}` : r.routeName || '—'}
                </div>
                <div className="rmc-meta">
                  <div><div className="k">Buses</div><div className="v">{busCount}</div></div>
                  <div><div className="k">Stops</div><div className="v">{r.stops?.length ?? '—'}</div></div>
                  <div><div className="k">Status</div><div className="v" style={{ color: r.isActive ? 'var(--success)' : 'var(--secondary)' }}>{r.isActive ? 'active' : 'inactive'}</div></div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="g12">
        {/* Bus Table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🚌 Live Bus Status</span>
            <span className="card-action" onClick={() => onNavigate('fleet')}>View All →</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Bus</th><th>Route</th><th>Speed</th><th>Status</th></tr></thead>
              <tbody>
                {buses.length === 0 ? (
                  <tr><td colSpan={3} className="empty">No buses registered yet. <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onNavigate('fleet')}>Add one →</span></td></tr>
                ) : (
                  buses.slice(0, 6).map((b) => (
                    <tr key={b.id}>
                      <td><b>{b.busNumber}</b></td>
                      <td>{dashboardData?.rows.find((r) => r.busId === b.id)?.routeNumber || '—'}</td>
                      <td>
                        <span className={`chip chip-${b.status.toLowerCase()}`}>{b.status}</span>
                        <span style={{ fontSize: 10, marginLeft: 8, color: 'var(--secondary)' }}>
                          {dashboardData?.rows.find((r) => r.busId === b.id)?.currentDirection === 'reverse' ? '↙️ Rev' : '↗️ Fwd'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Right column */}
        <div>
          <div className="card mb16">
            <div className="card-header">
              <span className="card-title">🔔 Delay Alerts</span>
              <span className="card-action" onClick={() => onNavigate('alerts')}>View All →</span>
            </div>
            {buses.filter((b) => b.status === 'Delayed').length === 0 ? (
              <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--secondary)' }}>✅ No delays currently.</div>
            ) : (
              buses.filter((b) => b.status === 'Delayed').map((b) => (
                <div className="alert-item" key={b.id}>
                  <div className="a-dot" />
                  <div>
                    <div className="a-text"><b>{b.busNumber}</b> delayed</div>
                    <div className="a-time">📍 {b.lastLocation ? `${b.lastLocation.lat.toFixed(4)}, ${b.lastLocation.lng.toFixed(4)}` : 'Unknown'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">📍 Fleet Map</span>
              <span className="card-action" onClick={() => onNavigate('tracking')}>Open Full</span>
            </div>
            <div ref={miniMapRef} style={{ height: 200, borderRadius: '0 0 12px 12px' }} />
          </div>
        </div>
      </div>
    </div>
  );
}