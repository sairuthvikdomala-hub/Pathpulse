import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bus, Route, DashboardData } from '../types';
import Toast from '../components/Toast';
import busIcon from '../assets/bus.png';
interface Props {
  buses: Bus[];
  routes: Route[];
  dashboardData: DashboardData | null;
  onUpdateBus: (busId: string, updates: Record<string, unknown>) => Promise<void>;
  onDeleteBus: (busId: string) => Promise<void>;
}
export default function FleetView({ buses, routes, dashboardData, onUpdateBus, onDeleteBus }: Props) {
  const navigate = useNavigate();
  const [toast, setToast] = useState({ msg: '', type: '' as '' | 'success' | 'err' });
  const [editing, setEditing] = useState<Bus | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const showToast = (msg: string, type: '' | 'success' | 'err' = '') =>
    setToast({ msg, type });
  function openEdit(id: string) {
    const b = buses.find((x) => x.id === id);
    if (b) setEditing({ ...b });
  }
  async function saveEdit() {
    if (!editing) return;
    if (!editing.busNumber.trim()) {
      showToast('Bus number is required', 'err');
      return;
    }
    try {
      await onUpdateBus(editing.id, {
        busNumber: editing.busNumber,
        assignedRouteId: editing.assignedRouteId,
        status: editing.status,
        manualDirection: editing.manualDirection,
      });
      setEditing(null);
      showToast('✅ Bus updated!', 'success');
    } catch {
      showToast('❌ Failed to update bus', 'err');
    }
  }
  async function handleDelete(id: string) {
    if (!confirm('Delete this bus and its driver?')) return;
    try {
      await onDeleteBus(id);
      showToast('🗑️ Bus deleted');
    } catch {
      showToast('❌ Failed to delete bus', 'err');
    }
  }
  // Get dashboard row data for displaying driver/route info
  function getRow(busId: string) {
    return dashboardData?.rows.find(r => r.busId === busId);
  }
  const filtered = filter === 'all'
    ? buses
    : buses.filter(b => b.status.toLowerCase() === filter);
  return (
    <div className="page-view">
      <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
      <div className="stats-grid mb24">
        <div className="stat-card sc-c1">
          <div className="sc-header"><span className="sc-label">Total Fleet</span><div className="sc-icon">🚌</div></div>
          <div className="sc-val">{buses.length}</div>
          <div className="sc-change neu">Registered buses</div>
        </div>
        <div className="stat-card sc-c2">
          <div className="sc-header"><span className="sc-label">Active Now</span><div className="sc-icon">✅</div></div>
          <div className="sc-val">{dashboardData?.activeBuses ?? 0}</div>
          <div className="sc-change neu">On the road</div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">🚌 All Buses</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="offline">Offline</option>
              <option value="delayed">Delayed</option>
            </select>
            <button
              className="btn btn-primary"
              style={{ padding: '7px 14px', fontSize: 12 }}
              onClick={() => navigate('/add-bus')}
            >
              + New Bus
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Bus No.</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Speed</th>
                <th>Status</th>
                <th>Direction</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No buses found. Click <b>+ New Bus</b> to register one.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const row = getRow(b.id);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, flexShrink: 0 }}>
                            <img src={busIcon} alt="Bus" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <b>{b.busNumber}</b>
                        </div>
                      </td>
                      <td>{row?.routeNumber || '—'}</td>
                      <td>{row?.driverName || '—'}</td>
                      <td><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{b.speed !== undefined ? `${b.speed} km/h` : '—'}</span></td>
                      <td>
                        <span className={`chip chip-${b.status.toLowerCase()}`}>
                          {b.status}
                        </span>
                      </td>
                      <td>
                        <span className="chip" style={{ background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
                          {row?.currentDirection === 'forward' ? '↗️ Forward' : '↙️ Reverse'}
                          {b.manualDirection && ' (Manual)'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => openEdit(b.id)}>✏️ Edit</button>
                          <button className="btn btn-danger-soft" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => handleDelete(b.id)}>🗑️ Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Edit Modal */}
      {
        editing && (
          <div className="modal-overlay" onClick={() => setEditing(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>✏️ Edit Bus</h3>
              <div className="mrow">
                <div className="mf">
                  <label>Bus Number *</label>
                  <input value={editing.busNumber} onChange={(e) => setEditing({ ...editing, busNumber: e.target.value })} />
                </div>
                <div className="mf">
                  <label>Status</label>
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Bus['status'] })}>
                    <option value="Active">Active</option>
                    <option value="Idle">Idle</option>
                    <option value="Delayed">Delayed</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
              </div>
              <div className="mf">
                <label>Assigned Route</label>
                <select
                  value={editing.assignedRouteId || ''}
                  onChange={(e) => setEditing({ ...editing, assignedRouteId: e.target.value || null })}
                >
                  <option value="">No route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.routeNumber} – {r.routeName || `${r.stops[0]?.name ?? ''} → ${r.stops[r.stops.length - 1]?.name ?? ''}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mf">
                <label>Manual Direction Override</label>
                <select
                  value={editing.manualDirection || ''}
                  onChange={(e) => setEditing({ ...editing, manualDirection: (e.target.value as any) || null })}
                >
                  <option value="">Auto (Time-based)</option>
                  <option value="forward">Force Forward (Home → School)</option>
                  <option value="reverse">Force Reverse (School → Home)</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}