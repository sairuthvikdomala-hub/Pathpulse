import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Route, Bus } from '../types';
import Toast from '../components/Toast';
interface Props {
  routes: Route[];
  buses: Bus[];
  onUpdateRoute: (
    routeId: string,
    updates: Record<string, unknown>
  ) => Promise<void>;
  onDeleteRoute: (routeId: string) => Promise<void>;
}
export default function RoutesView({ routes, buses, onDeleteRoute }: Props) {
  const navigate = useNavigate();
  const [toast, setToast] = useState({
    msg: '',
    type: '' as '' | 'success' | 'err',
  });
  const showToast = (msg: string, type: '' | 'success' | 'err' = '') =>
    setToast({ msg, type });
  function openEdit(id: string) {
    navigate(`/edit-route/${id}`);
  }
  async function handleDelete(id: string) {
    if (!confirm('Delete this route?')) return;
    try {
      await onDeleteRoute(id);
      showToast('🗑️ Route deleted');
    } catch {
      showToast('❌ Failed to delete route', 'err');
    }
  }
  const origin = (r: Route) => (r.stops.length > 0 ? r.stops[0].name : '—');
  const dest = (r: Route) =>
    r.stops.length > 0 ? r.stops[r.stops.length - 1].name : '—';
  return (
    <div className="page-view">
      <Toast
        message={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: '' })}
      />
      <div className="stats-grid mb24">
        <div className="stat-card sc-c1">
          <div className="sc-header">
            <span className="sc-label">Total Routes</span>
            <div className="sc-icon">🗺️</div>
          </div>
          <div className="sc-val">{routes.length}</div>
          <div className="sc-change neu">All routes</div>
        </div>
        <div className="stat-card sc-c2">
          <div className="sc-header">
            <span className="sc-label">Active Routes</span>
            <div className="sc-icon">✅</div>
          </div>
          <div className="sc-val">
            {routes.filter((r) => r.isActive).length}
          </div>
          <div className="sc-change neu">Running</div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">🗺️ All Routes</span>
          <button
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: 12 }}
            onClick={() => navigate('/add-route')}
          >
            + New Route
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Route No</th>
                <th>Assigned Bus</th>
                <th>From → To</th>
                <th>Stops</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No routes yet. Click <b>+ New Route</b> to add one.
                  </td>
                </tr>
              ) : (
                routes.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b
                        style={{
                          fontFamily: "'Sora',sans-serif",
                          fontSize: 15,
                        }}
                      >
                        {r.routeNumber}
                      </b>
                    </td>
                    <td>
                      {buses.find((b) => b.assignedRouteId === r.id) ? (
                        <span
                          className="chip"
                          style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontWeight: 600,
                          }}
                        >
                          Bus{' '}
                          {
                            buses.find((b) => b.assignedRouteId === r.id)
                              ?.busNumber
                          }
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {origin(r)} → {dest(r)}
                    </td>
                    <td>
                      <b>{r.stops?.length ?? '—'}</b>
                    </td>
                    <td>
                      <span
                        className={`chip chip-${
                          r.isActive ? 'active' : 'offline'
                        }`}
                      >
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => openEdit(r.id)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-danger-soft"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => handleDelete(r.id)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
