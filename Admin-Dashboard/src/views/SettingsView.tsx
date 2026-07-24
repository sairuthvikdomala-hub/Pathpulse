import { useState } from 'react';
import Toast from '../components/Toast';

export default function SettingsView() {
  const [toggles, setToggles] = useState({
    liveTracking: true,
    delayAlerts: true,
    emailNotifs: false,
    smsAlerts: false,
    autoRefresh: true,
    darkMode: false,
  });
  const [toast, setToast] = useState({ msg: '', type: '' as '' | 'success' | 'err' });

  function flip(key: keyof typeof toggles) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    setToast({ msg: '✅ Setting updated', type: 'success' });
  }

  const rows: { key: keyof typeof toggles; label: string; desc: string }[] = [
    { key: 'liveTracking',  label: 'Live Bus Tracking',    desc: 'Enable real-time GPS tracking on the map' },
    { key: 'delayAlerts',   label: 'Delay Alerts',          desc: 'Show alerts when a bus is delayed' },
    { key: 'emailNotifs',   label: 'Email Notifications',   desc: 'Receive alerts via email' },
    { key: 'smsAlerts',     label: 'SMS Alerts',            desc: 'Send SMS when a bus is delayed' },
    { key: 'autoRefresh',   label: 'Auto Refresh',          desc: 'Auto-refresh dashboard every 30 seconds' },
    { key: 'darkMode',      label: 'Dark Mode',             desc: 'Switch to dark interface (coming soon)' },
  ];

  return (
    <div className="page-view">
      <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />

      <div className="card mb24">
        <div className="card-header">
          <span className="card-title">⚙️ System Settings</span>
        </div>
        {rows.map((r) => (
          <div className="settings-row" key={r.key}>
            <div>
              <div className="sr-label">{r.label}</div>
              <div className="sr-desc">{r.desc}</div>
            </div>
            <div
              className={`toggle${toggles[r.key] ? ' on' : ''}`}
              onClick={() => flip(r.key)}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">ℹ️ About PathPulse</span>
        </div>
        <div style={{ padding: '20px 22px', fontSize: 13, color: 'var(--secondary)', lineHeight: 1.7 }}>
          <p><b style={{ color: 'var(--primary)' }}>PathPulse Admin v1.0</b></p>
          <p>College Bus Management System — Vardhaman College of Engineering</p>
          <p style={{ marginTop: 8 }}>© 2025 PathPulse. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}