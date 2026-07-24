import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import { listenToDashboard, type DashboardData } from '../services/dashboardService';
import { listenToAllRoutes } from '../services/routeService';
import { updateBus, deleteBus } from '../services/busService';
import { updateRoute, deleteRoute as deleteRouteService } from '../services/routeService';
import DashboardView from '../views/DashboardView';
import FleetView from '../views/FleetView';
import RoutesView from '../views/RoutesView';
import TrackingView from '../views/TrackingView';
import AlertsView from '../views/AlertsView';
import SettingsView from '../views/SettingsView';
import type { Bus, Route } from '../types';
import type { DashboardRow } from '../services/dashboardService';
type Page = 'dashboard' | 'fleet' | 'routes' | 'tracking' | 'alerts' | 'settings';
const PAGE_TITLES: Record<Page, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Overview of the fleet' },
  fleet: { title: 'Bus Management', sub: 'Manage all registered buses' },
  routes: { title: 'Route Management', sub: 'Manage all running routes' },
  tracking: { title: 'Live Tracking', sub: 'Real-time bus positions' },
  alerts: { title: 'Alerts', sub: 'Delay & incident alerts' },
  settings: { title: 'Settings', sub: 'System configuration' },
};
const NAV_ITEMS: { page: Page; icon: string; label: string; section?: string }[] = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard', section: 'Main' },
  { page: 'fleet', icon: '🚌', label: 'Bus Management' },
  { page: 'routes', icon: '🗺️', label: 'Route Management' },
  { page: 'tracking', icon: '📍', label: 'Live Tracking' },
  { page: 'alerts', icon: '🔔', label: 'Alerts', section: 'Reports' },
  { page: 'settings', icon: '⚙️', label: 'Settings' },
];
// Convert Firestore dashboard row → Bus shape for views
function rowToBus(row: DashboardRow): Bus {
  return {
    id: row.busId,
    busNumber: row.busNumber,
    assignedRouteId: row.assignedRouteId,
    driverId: null,
    lastLocation: row.lastLocation,
    lastUpdated: row.lastUpdated,
    speed: row.speed,
    status: row.status,
    institutionId: '',
    manualDirection: row.manualDirection,
  };
}
// Convert Firestore route doc → Route shape for views
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fsRouteToLocal(r: any): Route {
  return {
    id: r.id,
    routeNumber: r.routeNumber || '',
    routeName: r.routeName || '',
    routeColor: r.routeColor || r.color || '#2F3E66',
    stops: r.stops || [],
    totalDistance: Number(r.totalDistance || r.distance || 0),
    totalDuration: Number(r.totalDuration || r.duration || 0),
    isActive: r.isActive !== false,
    institutionId: r.institutionId || '',
    createdAt: r.createdAt,
  };
}
export default function DashboardPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>('dashboard');
  const [time, setTime] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  // Clock
  useEffect(() => {
    function updateTime() {
      const now = new Date();
      setTime(
        now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
        ' · ' +
        now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      );
    }
    updateTime();
    const id = setInterval(updateTime, 20000);
    return () => clearInterval(id);
  }, []);
  // Live dashboard data from Firestore
  useEffect(() => {
    const unsub = listenToDashboard((data) => {
      setDashboardData(data);
      setBuses(data.rows.map(rowToBus));
    });
    return () => unsub();
  }, []);
  // Live routes from Firestore
  useEffect(() => {
    const unsub = listenToAllRoutes((data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRoutes((data as any[]).map(fsRouteToLocal));
    });
    return () => unsub();
  }, []);
  async function doLogout() {
    if (!confirm('Logout of PathPulse Admin?')) return;
    try { await logout(); } catch { /* ignore */ }
    sessionStorage.removeItem('pp_admin');
    navigate('/');
  }
  // Firestore update handlers for views
  async function handleUpdateBus(busId: string, updates: Record<string, unknown>) {
    await updateBus(busId, updates);
  }
  async function handleDeleteBus(busId: string) {
    await deleteBus(busId);
  }
  async function handleUpdateRoute(routeId: string, updates: Record<string, unknown>) {
    await updateRoute(routeId, updates);
  }
  async function handleDeleteRoute(routeId: string) {
    await deleteRouteService(routeId);
  }
  const delayed = buses.filter((b) => b.status === 'Delayed').length;
  const { title, sub } = PAGE_TITLES[page];
  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sb-brand">
          <h2>PATHPULSE</h2>
          <span>Admin Control Center</span>
        </div>
        <nav className="sb-nav">
          {NAV_ITEMS.map((item) => (
            <div key={item.page}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <div
                className={`nav-item${page === item.page ? ' active' : ''}`}
                onClick={() => setPage(item.page)}
              >
                <span className="ni">{item.icon}</span>
                {item.label}
                {item.page === 'alerts' && delayed > 0 && (
                  <span className="nav-badge">{delayed}</span>
                )}
              </div>
            </div>
          ))}
        </nav>
        <div className="sb-footer">
          <div className="sb-avatar">👤</div>
          <div className="sb-info">
            <div className="sbi-name">Admin</div>
            <div className="sbi-role">Super Admin</div>
          </div>
          <div className="sb-logout" onClick={doLogout} title="Logout">
            ⏻
          </div>
        </div>
      </aside>
      {/* MAIN */}
      <div className="app-main">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="tb-page-info">
            <h3>{title}</h3>
            <p>{time || sub}</p>
          </div>
          <div className="tb-right">
            <div className="tb-search">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search buses, routes…"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
              />
            </div>
            <div className="icon-btn" onClick={() => setPage('alerts')}>
              🔔
              {delayed > 0 && <span className="notif-dot" />}
            </div>
            <div className="status-pill">
              <div className="s-dot" />
              System Online
            </div>
          </div>
        </header>
        {/* PAGE CONTENT */}
        <div className="page-wrap">
          {page === 'dashboard' && (
            <DashboardView
              buses={buses}
              routes={routes}
              dashboardData={dashboardData}
              onNavigate={(p: string) => setPage(p as Page)}
            />
          )}
          {page === 'fleet' && (
            <FleetView
              buses={buses}
              routes={routes}
              dashboardData={dashboardData}
              onUpdateBus={handleUpdateBus}
              onDeleteBus={handleDeleteBus}
            />
          )}
          {page === 'routes' && (
            <RoutesView
              routes={routes}
              buses={buses}
              onUpdateRoute={handleUpdateRoute}
              onDeleteRoute={handleDeleteRoute}
            />
          )}
          {page === 'tracking' && (
            <TrackingView buses={buses} routes={routes} dashboardData={dashboardData} />
          )}
          {page === 'alerts' && <AlertsView buses={buses} />}
          {page === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  );
}
