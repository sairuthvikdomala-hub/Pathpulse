import type { Bus } from '../types';

interface Props {
  buses: Bus[];
}

export default function AlertsView({ buses }: Props) {
  const delayed = buses.filter((b) => b.status === 'Delayed');
  const offline = buses.filter((b) => b.status === 'Offline');

  return (
    <div className="page-view">
      <div className="stats-grid mb24">
        <div className="stat-card sc-c3">
          <div className="sc-header">
            <span className="sc-label">Delayed</span>
            <div className="sc-icon">⚠️</div>
          </div>
          <div className="sc-val">{delayed.length}</div>
          <div className="sc-change dn">Active delays</div>
        </div>
        <div className="stat-card sc-c1">
          <div className="sc-header">
            <span className="sc-label">Offline</span>
            <div className="sc-icon">📡</div>
          </div>
          <div className="sc-val">{offline.length}</div>
          <div className="sc-change neu">No GPS signal</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">⚠️ Delay Alerts</span>
        </div>
        {delayed.length === 0 ? (
          <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--secondary)', textAlign: 'center' }}>
            ✅ No delayed buses right now. All good!
          </div>
        ) : (
          delayed.map((b) => (
            <div className="alert-item" key={b.id}>
              <div className="a-dot" />
              <div>
                <div className="a-text"><b>{b.busNumber}</b> is delayed</div>
                <div className="a-time">
                  📍 {b.lastLocation
                    ? `${b.lastLocation.lat.toFixed(4)}, ${b.lastLocation.lng.toFixed(4)}`
                    : 'Location unknown'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">📡 Offline Buses</span>
        </div>
        {offline.length === 0 ? (
          <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--secondary)', textAlign: 'center' }}>
            ✅ All buses have GPS signal.
          </div>
        ) : (
          offline.map((b) => (
            <div className="alert-item" key={b.id}>
              <div className="a-dot" style={{ background: 'var(--secondary)' }} />
              <div>
                <div className="a-text"><b>{b.busNumber}</b> is offline</div>
                <div className="a-time">No GPS signal detected</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}