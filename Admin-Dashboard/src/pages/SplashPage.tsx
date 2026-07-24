import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
export default function SplashPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate('/login'), 4400);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <div className="splash-body">
      <div className="bg-circle" />
      <div className="bg-circle" />
      <div className="bg-circle" />
      <div className="bg-circle" />
      <div className="road-lines" />
      <div className="bus-runner">🚌</div>
      <div className="logo-wrap">
        <div className="college-logo">
          <img src="/logo-professional.png" alt="Logo" style={{ width: '275%', height: '275%', objectFit: 'contain' }} />
          <div className="logo-ring" />
        </div>
      </div>
      <div className="college-name">Vardhaman College of Engineering</div>
      <div className="brand-text">
        {'PATH PULSE'.split('').map((letter, i) => (
          <span key={i} className="brand-letter">
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        ))}
      </div>
      <div className="tagline">Your bus. Your route. Live.</div>
      <div className="progress-wrap">
        <div className="progress-bar" />
      </div>
      <div className="loading-text">LOADING…</div>
    </div>
  );
}