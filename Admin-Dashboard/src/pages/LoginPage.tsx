import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/authService';
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function doLogin() {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('❌ Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const { role } = await login(email.trim(), password.trim());
      if (role !== 'admin') {
        setError('❌ Access denied. Admin account required.');
        setLoading(false);
        return;
      }
      sessionStorage.setItem('pp_admin', 'true');
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Login Error]', msg);
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('❌ Invalid email or password. Please try again.');
      } else if (msg.includes('too-many-requests')) {
        setError('❌ Too many attempts. Please wait a moment and retry.');
      } else if (msg.includes('network-request-failed')) {
        setError('❌ Network error. Check your internet connection.');
      } else {
        // SECURITY: Do not expose internal error details to the user
        setError('❌ Login failed. Please try again later.');
      }
      setLoading(false);
    }
  }
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doLogin();
  }
  return (
    <div className="login-page-bg">
      <div className="login-wrapper">
        {/* Left Panel */}
        <div className="left-panel">
          <div className="brand">
            <h1>PATHPULSE</h1>
            <p>Admin Control Center</p>
          </div>
          <div className="left-stats">
            {[
              { icon: '🚌', val: '30', lbl: 'Active Buses' },
              { icon: '🗺️', val: '30', lbl: 'Routes Running' },
              { icon: '👤', val: '1500', lbl: 'Active Passengers' },
            ].map((s) => (
              <div className="stat-chip" key={s.lbl}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-info">
                  <div className="val">{s.val}</div>
                  <div className="lbl">{s.lbl}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="left-footer">© 2025 PathPulse. All rights reserved.</div>
        </div>
        {/* Right Panel */}
        <div className="right-panel">
          <div className="login-title">Welcome back, Admin</div>
          <div className="login-sub">Sign in to access the dashboard</div>
          <div className="form-group">
            <label>Email</label>
            <div className="input-wrap">
              <span className="icon">👤</span>
              <input
                type="email"
                placeholder="admin@pathpulse.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKey}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            <div className="input-wrap">
              <span className="icon">🔒</span>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKey}
              />
              <span className="toggle-pw" onClick={() => setShowPw(!showPw)}>
                👁️
              </span>
            </div>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-login" onClick={doLogin} disabled={loading}>
            {loading ? (
              <div className="spinner" />
            ) : (
              <span>Sign In →</span>
            )}
          </button>
          <div className="login-hint">
            Use your Firebase admin account credentials
          </div>
        </div>
      </div>
    </div>
  );
}
