import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { saveRoute, getRoute, updateRoute } from '../services/routeService';
import Toast from '../components/Toast';
/* ─── Leaflet is loaded from CDN in index.html, available as window.L ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;
interface Stop {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
}
interface SavedRoute {
  routeNo: string;
  from: string;
  to: string;
}
const COLORS = ['#2F3E66', '#4A90D9', '#00B894', '#6C5CE7', '#E05252', '#9B59B6'];
const AVG_SPEED = 30; // km/h
// Haversine distance in km
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export default function AddRoutePage() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const distAbortControllerRef = useRef<AbortController | null>(null);
  const { id } = useParams();
  const [isEditMode, setIsEditMode] = useState(false);
  const [step, setStep] = useState(1);
  const [routeNo, setRouteNo] = useState('');
  const [routeName, setRouteName] = useState('');
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [stops, setStops] = useState<Stop[]>([
    { id: 1, name: '', lat: null, lng: null },
    { id: 2, name: '', lat: null, lng: null },
    { id: 3, name: '', lat: null, lng: null },
  ]);
  const [stopCounter, setStopCounter] = useState(3);
  const [toast, setToast] = useState({ msg: '', type: '' as '' | 'success' | 'err' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedRoute | null>(null);
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      getRoute(id).then((route: any) => {
        setRouteNo(route.routeNumber || '');
        setRouteName(route.routeName || '');
        setColor(route.routeColor || COLORS[0]);
        setDistance(String(route.totalDistance || ''));
        setDuration(String(route.totalDuration || ''));
        if (route.stops && route.stops.length > 0) {
          const loadedStops = route.stops.map((s: any, idx: number) => ({
            id: idx + 1,
            name: s.name || '',
            lat: s.lat || null,
            lng: s.lng || null
          }));
          setStops(loadedStops);
          setStopCounter(loadedStops.length);
          if (loadedStops.length > 0) {
            setRouteFrom(loadedStops[0].name);
            setRouteTo(loadedStops[loadedStops.length - 1].name);
          }
        }
      }).catch((err) => {
        showToast('Failed to load route data: ' + err.message, 'err');
      });
    }
  }, [id]);
  function showToast(msg: string, type: '' | 'success' | 'err' = '') {
    setToast({ msg, type });
  }
  /* ─── Leaflet init ─── */
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = L.map(mapRef.current, { center: [17.385, 78.487], zoom: 12 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        setStops((prev) => {
          const unplaced = prev.find((s) => s.lat === null);
          if (!unplaced) return prev;
          return prev.map((s) =>
            s.id === unplaced.id
              ? { ...s, lat: e.latlng.lat, lng: e.latlng.lng, name: s.name || `Stop (${e.latlng.lat.toFixed(3)},${e.latlng.lng.toFixed(3)})` }
              : s
          );
        });
      });
      mapInstanceRef.current = map;
    }, 100);
    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);
  /* ─── Redraw map markers + road-based polyline ─── */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    const pts: [number, number][] = [];
    stops.forEach((s, i) => {
      if (s.lat === null || s.lng === null) return;
      const isFirst = i === 0, isLast = i === stops.length - 1;
      const dotColor = isFirst ? '#4CAF82' : isLast ? '#E05252' : color;
      let html = '';
      let iSize: [number, number] = [24, 24];
      let iAnch: [number, number] = [12, 12];
      if (isFirst || isLast) {
        const flagLabel = isFirst ? 'START' : 'END';
        html = `<div style="background:${dotColor};padding:4px 8px;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:#fff;font-family:'Sora',sans-serif;font-size:11px;font-weight:bold;white-space:nowrap;cursor:grab;">${flagLabel}</div>`;
        iSize = [50, 24]; // Approx width
        iAnch = [25, 24];
      } else {
        const label = String(i + 1);
        html = `<div style="background:${dotColor};width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;font-family:'Sora',sans-serif;font-size:10px;font-weight:700;color:#fff;cursor:grab;">${label}</div>`;
      }
      const icon = L.divIcon({ html, iconSize: iSize, iconAnchor: iAnch, className: '' });
      const marker = L.marker([s.lat, s.lng], { icon, draggable: true }).addTo(map);
      marker.bindTooltip(s.name || `Stop ${i + 1}`, { permanent: false, direction: 'top', offset: [0, -14] });
      marker.on('dragend', (ev: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
        const ll = ev.target.getLatLng();
        setStops((prev) => prev.map((st) => st.id === s.id ? { ...st, lat: ll.lat, lng: ll.lng } : st));
      });
      markersRef.current.push(marker);
      pts.push([s.lat, s.lng]);
    });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Fetch OSRM road route for polyline
    if (pts.length >= 2) {
      abortControllerRef.current = new AbortController();
      const coordStr = pts.map(([lat, lng]) => `${lng},${lat}`).join(';');
      fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`, {
        signal: abortControllerRef.current.signal
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.code === 'Ok' && data.routes.length > 0) {
            const roadCoords: [number, number][] = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            if (polylineRef.current) map.removeLayer(polylineRef.current);
            polylineRef.current = L.polyline(roadCoords, { color, weight: 4, opacity: 0.85 }).addTo(map);
          } else {
            // Fallback straight
            if (polylineRef.current) map.removeLayer(polylineRef.current);
            polylineRef.current = L.polyline(pts, { color, weight: 4, dashArray: '8 4' }).addTo(map);
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          if (polylineRef.current) map.removeLayer(polylineRef.current);
          polylineRef.current = L.polyline(pts, { color, weight: 4, dashArray: '8 4' }).addTo(map);
        });
    } else {
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
    }
  }, [stops, color]);
  /* ─── Auto-calculate distance & duration via OSRM ─── */
  useEffect(() => {
    const placed = stops.filter((s) => s.lat !== null && s.lng !== null);
    if (placed.length < 2) {
      setDistance('');
      setDuration('');
      return;
    }
    if (distAbortControllerRef.current) {
      distAbortControllerRef.current.abort();
    }
    distAbortControllerRef.current = new AbortController();
    const coordStr = placed.map((s) => `${s.lng!},${s.lat!}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`, {
      signal: distAbortControllerRef.current.signal
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.code === 'Ok' && data.routes.length > 0) {
          const roadKm = data.routes[0].distance / 1000;
          setDistance(roadKm.toFixed(1));
          setDuration(String(Math.round((roadKm / AVG_SPEED) * 60)));
        } else {
          // Fallback haversine
          let totalKm = 0;
          for (let i = 0; i < placed.length - 1; i++) {
            totalKm += haversineKm(
              { lat: placed[i].lat!, lng: placed[i].lng! },
              { lat: placed[i + 1].lat!, lng: placed[i + 1].lng! }
            );
          }
          setDistance(totalKm.toFixed(1));
          setDuration(String(Math.round((totalKm / AVG_SPEED) * 60)));
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        let totalKm = 0;
        for (let i = 0; i < placed.length - 1; i++) {
          totalKm += haversineKm(
            { lat: placed[i].lat!, lng: placed[i].lng! },
            { lat: placed[i + 1].lat!, lng: placed[i + 1].lng! }
          );
        }
        setDistance(totalKm.toFixed(1));
        setDuration(String(Math.round((totalKm / AVG_SPEED) * 60)));
      });
  }, [stops]);
  function addStop() {
    const id = stopCounter + 1;
    setStopCounter(id);
    setStops((prev) => [...prev, { id, name: '', lat: null, lng: null }]);
  }
  function removeStop(id: number) {
    if (stops.length <= 2) { showToast('Minimum 2 stops required', 'err'); return; }
    setStops((prev) => prev.filter((s) => s.id !== id));
  }
  function moveStop(id: number, dir: -1 | 1) {
    setStops((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }
  function updateStopName(id: number, name: string) {
    setStops((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
  }
  // Geocode stop name → auto-zoom map to that location (Hyderabad bias)
  // Only zooms — user must click on map to place the pin
  async function geocodeStop(id: number) {
    const stop = stops.find((s) => s.id === id);
    if (!stop || !stop.name.trim() || stop.lat !== null) return; // skip if already placed
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const q = encodeURIComponent(stop.name.trim() + ', Hyderabad, India');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        map.setView([lat, lng], 16, { animate: true });
        showToast(`📍 Found "${stop.name}" — click on the map to place the pin`, 'success');
      } else {
        showToast(`⚠️ Could not find "${stop.name}" — place manually on map`, 'err');
      }
    } catch {
      // Geocoding failed silently — user can still place manually
    }
  }
  function fitBounds() {
    const map = mapInstanceRef.current; if (!map) return;
    const pts = stops.filter((s) => s.lat !== null).map((s) => [s.lat!, s.lng!] as [number, number]);
    if (pts.length > 0) map.fitBounds(pts, { padding: [30, 30] });
  }
  function clearPins() { setStops((prev) => prev.map((s) => ({ ...s, lat: null, lng: null }))); }
  function validate(s: number): boolean {
    if (s === 1) {
      if (!routeNo.trim()) { showToast('Route number is required', 'err'); return false; }
      if (!routeFrom.trim()) { showToast('Origin is required', 'err'); return false; }
      if (!routeTo.trim()) { showToast('Destination is required', 'err'); return false; }
    }
    if (s === 2) {
      const namedStops = stops.filter((st) => st.name.trim());
      if (namedStops.length < 2) {
        showToast('Please name at least 2 stops', 'err');
        return false;
      }
      // NEW: Ensure all named stops have coordinates
      const unpinned = namedStops.find((st) => st.lat === null || st.lng === null);
      if (unpinned) {
        showToast(`📍 Please pin "${unpinned.name}" on the map`, 'err');
        return false;
      }
    }
    return true;
  }
  function next() { if (!validate(step)) return; setStep((s) => Math.min(s + 1, 3)); }
  function prev() { setStep((s) => Math.max(s - 1, 1)); }
  async function handleSaveRoute() {
    const namedStops = stops.filter((s) => s.name.trim());
    setSaving(true);
    try {
      if (isEditMode && id) {
        const typedStops = namedStops.map((s, i) => ({
          order: i + 1,
          name: s.name,
          lat: s.lat!,
          lng: s.lng!,
          type: i === 0 ? 'origin' : i === namedStops.length - 1 ? 'destination' : 'stop',
        }));
        await updateRoute(id, {
          routeNumber: routeNo,
          routeName,
          routeColor: color,
          stops: typedStops,
          totalDistance: Number(distance) || 0,
          totalDuration: Number(duration) || 0,
        });
      } else {
        await saveRoute(
          {
            routeNumber: routeNo,
            routeName,
            origin: routeFrom,
            destination: routeTo,
            duration: Number(duration) || 0,
            distance: Number(distance) || 0,
            color,
          },
          namedStops.map((s, i) => ({ order: i + 1, name: s.name, lat: s.lat!, lng: s.lng! }))
        );
      }
      setSaved({ routeNo, from: routeFrom, to: routeTo });
      showToast('✅ Route saved to Firestore!', 'success');
    } catch (err) {
      showToast('❌ Failed to save route. Check Firestore rules.', 'err');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }
  function resetForm() {
    setSaved(null); setStep(1); setRouteNo(''); setRouteName(''); setRouteFrom(''); setRouteTo('');
    setDuration(''); setDistance(''); setColor(COLORS[0]);
    setStops([{ id: 1, name: '', lat: null, lng: null }, { id: 2, name: '', lat: null, lng: null }, { id: 3, name: '', lat: null, lng: null }]);
    setStopCounter(3);
  }
  const progress = (step / 3) * 100;
  const namedStops = stops.filter((s) => s.name.trim());
  if (saved) {
    return (
      <>
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
        <nav className="topnav">
          <div className="topnav-brand">PATHPULSE <span>Add Route</span></div>
          <button className="back-link" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        </nav>
        <div className="addpage-wrap">
          <div className="success-screen">
            <div className="big-icon">🗺️</div>
            <h2>Route {saved.routeNo} Created!</h2>
            <p>{saved.from} → {saved.to} has been saved to Firestore and is now visible in Route Management and the Dashboard.</p>
            <div className="success-btns">
              <button className="btn btn-primary" onClick={resetForm}>+ Add Another Route</button>
              <button className="btn btn-outline" onClick={() => navigate('/add-bus')}>🚌 Add a Bus</button>
              <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>← Dashboard</button>
            </div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
      <nav className="topnav">
        <div className="topnav-brand">PATHPULSE <span>Add Route</span></div>
        <button className="back-link" onClick={() => navigate('/dashboard')}>← Dashboard</button>
      </nav>
      <div className="addroute-layout">
        <div className="form-col">
          <div className="page-header">
            <h1>🗺️ Add New Route</h1>
            <p>Create a college bus route in 3 steps.</p>
          </div>
          <div className="steps-bar">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`step-dot${step === s ? ' active' : step > s ? ' done' : ''}`} onClick={() => { if (s <= step) setStep(s); }}>
                <div className="step-num">{step > s ? '✓' : s}</div>
                {s === 1 ? 'Route Info' : s === 2 ? 'Stops' : 'Review'}
              </div>
            ))}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          {step === 1 && (
            <>
              <div className="route-preview">
                <div className="rp-num">{routeNo || '—'}</div>
                <div className="rp-name">{routeName || 'Route name'}</div>
                <div className="rp-path">
                  <div className="rp-dot s" /><span>{routeFrom || 'Origin'}</span>
                  <span style={{ opacity: 0.5 }}>→</span>
                  <div className="rp-dot e" /><span>{routeTo || 'Destination'}</span>
                </div>
              </div>
              <div className="addcard">
                <div className="addcard-top">
                  <div className="addcard-icon">📋</div>
                  <div><div className="addcard-title">Route Details</div><div className="addcard-sub">Basic info about this route</div></div>
                </div>
                <div className="addcard-body">
                  <div className="f-row">
                    <div className="field"><label>Route Number *</label><input type="text" placeholder="e.g. 218, 47C" maxLength={8} value={routeNo} onChange={(e) => setRouteNo(e.target.value)} /></div>
                    <div className="field"><label>Route Name</label><input type="text" placeholder="e.g. Airport Express" value={routeName} onChange={(e) => setRouteName(e.target.value)} /></div>
                  </div>
                  <div className="f-row">
                    <div className="field"><label>From (Origin) *</label><input type="text" placeholder="Starting point" value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} /></div>
                    <div className="field"><label>To (Destination) *</label><input type="text" placeholder="Ending point" value={routeTo} onChange={(e) => setRouteTo(e.target.value)} /></div>
                  </div>
                  <div className="f-row">
                    <div className="field"><label>Duration (mins) <span className="opt-label">(auto)</span></label><input type="text" readOnly value={duration ? `${duration} min` : 'Place stops on map'} style={{ background: 'rgba(255,255,255,0.03)', cursor: 'default' }} /><span className="fhint">Calculated at avg {AVG_SPEED} km/h</span></div>
                    <div className="field"><label>Distance (km) <span className="opt-label">(auto)</span></label><input type="text" readOnly value={distance ? `${distance} km` : 'Place stops on map'} style={{ background: 'rgba(255,255,255,0.03)', cursor: 'default' }} /><span className="fhint">Sum of stop-to-stop distances</span></div>
                  </div>
                  <div className="f-row full" style={{ marginBottom: 0 }}>
                    <div className="field">
                      <label>Route Colour</label>
                      <div className="color-row">
                        {COLORS.map((c) => (
                          <div key={c} className={`c-dot${color === c ? ' sel' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="nav-btns"><div /><button className="btn btn-primary" onClick={next}>Next: Stops →</button></div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="addcard">
                <div className="addcard-top">
                  <div className="addcard-icon">📍</div>
                  <div><div className="addcard-title">Route Stops</div><div className="addcard-sub">Add stops in order. First = origin, last = destination.</div></div>
                </div>
                <div className="addcard-body">
                  <div className="stop-wrap">
                    {stops.map((s, i) => {
                      const isFirst = i === 0, isLast = i === stops.length - 1;
                      return (
                        <div key={s.id} className="stop-row" style={{ borderLeft: isFirst ? '3px solid var(--danger)' : isLast ? '3px solid var(--success)' : undefined }}>
                          <div className={`stop-num${isFirst ? ' origin' : isLast ? ' dest' : ''}`}>{i + 1}</div>
                          <input className="stop-input" placeholder="Stop name (press Enter to locate)" value={s.name} onChange={(e) => updateStopName(s.id, e.target.value)} onBlur={() => geocodeStop(s.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); geocodeStop(s.id); } }} />
                          {isFirst && <span className="stop-tag tag-origin">ORIGIN</span>}
                          {isLast && <span className="stop-tag tag-dest">DEST</span>}
                          <div className="stop-actions">
                            {i > 0 && <div className="stop-act-btn up-btn" onClick={() => moveStop(s.id, -1)}>↑</div>}
                            {i < stops.length - 1 && <div className="stop-act-btn up-btn" onClick={() => moveStop(s.id, 1)}>↓</div>}
                            {stops.length > 2 && <div className="stop-act-btn" onClick={() => removeStop(s.id)}>×</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="add-stop-btn" onClick={addStop}>+ Add Stop</button>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--secondary)' }}>💡 Click on the map to place stops with exact coordinates</div>
                </div>
              </div>
              <div className="nav-btns">
                <button className="btn btn-outline" onClick={prev}>← Back</button>
                <button className="btn btn-primary" onClick={next}>Next: Review →</button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="addcard">
                <div className="addcard-top">
                  <div className="addcard-icon">✅</div>
                  <div><div className="addcard-title">Review & Save</div><div className="addcard-sub">Confirm before saving route to Firestore</div></div>
                </div>
                <div className="addcard-body">
                  <div style={{ background: 'var(--primary)', borderRadius: 13, padding: '18px 20px', color: '#fff', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', right: 10, bottom: -8, fontSize: 60, opacity: 0.09 }}>🗺️</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 28, fontWeight: 800 }}>{routeNo}</div>
                    <div style={{ fontSize: 12, opacity: 0.65, margin: '3px 0 10px' }}>{routeName || '—'}</div>
                    <div style={{ fontSize: 13, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF8A80', flexShrink: 0 }} />
                      <span>{routeFrom}</span><span style={{ opacity: 0.5 }}>→</span>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A5D6A7', flexShrink: 0 }} />
                      <span>{routeTo}</span>
                    </div>
                  </div>
                  <div className="review-block">
                    <h4>Route Info</h4>
                    <div className="rv-grid">
                      {[['Route No.', routeNo], ['Name', routeName || '—'], ['Duration', duration ? `${duration} min` : '—'], ['Distance', distance ? `${distance} km` : '—']].map(([k, v]) => (
                        <div className="rv-item" key={k}><div className="rk">{k}</div><div className="rv">{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div className="review-block" style={{ marginBottom: 0 }}>
                    <h4>Stops ({namedStops.length})</h4>
                    <div className="stop-review-list">
                      {namedStops.map((s, i) => {
                        const isFirst = i === 0, isLast = i === namedStops.length - 1;
                        return (
                          <div className="sr-item" key={s.id}>
                            <div className={`sr-num${isFirst ? ' origin' : isLast ? ' dest' : ''}`}>{i + 1}</div>
                            <span>{s.name}</span>
                            {isFirst && <span className="stop-tag tag-origin" style={{ marginLeft: 'auto' }}>ORIGIN</span>}
                            {isLast && <span className="stop-tag tag-dest" style={{ marginLeft: 'auto' }}>DEST</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="nav-btns">
                <button className="btn btn-outline" onClick={prev}>← Back</button>
                <button className="btn btn-success" onClick={handleSaveRoute} disabled={saving}>
                  {saving ? '⏳ Saving…' : '💾 Save Route'}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="map-col">
          <div className="map-header">
            <div><h3>📍 Route Map Preview</h3><p>Click map to pin stops · Drag to adjust</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', fontSize: 11, cursor: 'pointer', color: 'var(--secondary)' }} onClick={fitBounds}>Fit View</button>
              <button style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', fontSize: 11, cursor: 'pointer', color: 'var(--danger)' }} onClick={clearPins}>Clear</button>
            </div>
          </div>
          <div id="leaflet-map" ref={mapRef} style={{ flex: 1 }} />
          <div className="map-tip">🟢 Green = Origin &nbsp;|&nbsp; 🔴 Red = Destination &nbsp;|&nbsp; 🔵 Blue = Stop</div>
        </div>
      </div>
    </>
  );
}