import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerBus } from '../services/busService';
import { listenToAllRoutes } from '../services/routeService';
import Toast from '../components/Toast';

type StepId = 1 | 2 | 3;

interface BusForm {
  busNo: string;
  capacity: string;
  make: string;
  year: string;
  fuelType: string;
  driverName: string;
  driverPhone: string;
  driverPin: string;
  assignedRouteId: string;
  assignedRouteDisplay: string;
}

interface FirestoreRoute {
  id: string;
  routeNumber: string;
  stops: { name: string }[];
  [key: string]: unknown;
}

interface SavedBus {
  busNo: string;
  driver: string;
}

const EMPTY: BusForm = {
  busNo: '',
  capacity: '',
  make: '',
  year: '',
  fuelType: '',
  driverName: '',
  driverPhone: '',
  driverPin: '',
  assignedRouteId: '',
  assignedRouteDisplay: '',
};

export default function AddBusPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepId>(1);
  const [form, setForm] = useState<BusForm>(EMPTY);
  const [toast, setToast] = useState({
    msg: '',
    type: '' as '' | 'success' | 'err',
  });
  const [saved, setSaved] = useState<SavedBus | null>(null);
  const [saving, setSaving] = useState(false);
  const [routes, setRoutes] = useState<FirestoreRoute[]>([]);

  // Load routes from Firestore in real-time
  useEffect(() => {
    const unsub = listenToAllRoutes((data) => {
      setRoutes(data as FirestoreRoute[]);
    });
    return () => unsub();
  }, []);

  function showToast(msg: string, type: '' | 'success' | 'err' = '') {
    setToast({ msg, type });
  }

  function set(key: keyof BusForm, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function validate(s: StepId): boolean {
    if (s === 1) {
      if (!form.busNo.trim()) {
        showToast('Bus Number is required', 'err');
        return false;
      }
    }
    if (s === 2) {
      if (!form.driverName.trim()) {
        showToast('Driver name is required', 'err');
        return false;
      }
      if (!form.driverPhone.trim()) {
        showToast('Driver contact is required', 'err');
        return false;
      }
      if (!form.driverPin.trim() || form.driverPin.length < 4) {
        showToast('Driver PIN must be at least 4 characters', 'err');
        return false;
      }
    }
    return true;
  }

  function next() {
    if (!validate(step)) return;
    setStep((s) => (s < 3 ? ((s + 1) as StepId) : s));
  }

  function prev() {
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s));
  }

  async function handleSaveBus() {
    setSaving(true);
    try {
      await registerBus(
        {
          busNumber: form.busNo,
          seatingCapacity: form.capacity,
          vehicleMake: form.make,
          year: form.year,
          fuelType: form.fuelType,
        },
        {
          name: form.driverName,
          phone: form.driverPhone,
          pin: form.driverPin,
        },
        form.assignedRouteId
      );
      setSaved({ busNo: form.busNo, driver: form.driverName });
      showToast('✅ Bus registered! Driver login created.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('email-already-in-use')) {
        showToast(
          '❌ A driver for this bus already exists. Delete the old bus first.',
          'err'
        );
      } else {
        showToast(`❌ Failed to save: ${msg}`, 'err');
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const progress = (step / 3) * 100;

  if (saved) {
    return (
      <>
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast({ msg: '', type: '' })}
        />
        <nav className="topnav">
          <div className="topnav-brand">
            PATHPULSE <span>Add Bus</span>
          </div>
          <button className="back-link" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
        </nav>
        <div className="addpage-wrap">
          <div className="success-screen">
            <div className="big-icon">🚌</div>
            <h2>{saved.busNo} Registered!</h2>
            <p>
              {saved.busNo} driven by {saved.driver} has been saved to
              Firestore. The driver can now log in using the bus number and PIN
              you set.
            </p>
            <div className="success-btns">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSaved(null);
                  setForm(EMPTY);
                  setStep(1);
                }}
              >
                + Add Another Bus
              </button>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/add-route')}
              >
                🗺️ Add a Route
              </button>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/dashboard')}
              >
                ← Dashboard
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Toast
        message={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: '' })}
      />

      <nav className="topnav">
        <div className="topnav-brand">
          PATHPULSE <span>Add Bus</span>
        </div>
        <button className="back-link" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>
      </nav>

      <div className="addpage-wrap">
        <div className="page-header">
          <h1>🚌 Register a New Bus</h1>
          <p>Add a college bus to the PathPulse fleet in 3 simple steps.</p>
        </div>

        {/* Step bar */}
        <div className="steps-bar">
          {([1, 2, 3] as StepId[]).map((s) => (
            <div
              key={s}
              className={`step-dot${
                step === s ? ' active' : step > s ? ' done' : ''
              }`}
              onClick={() => {
                if (s <= step) setStep(s);
              }}
            >
              <div className="step-num">{step > s ? '✓' : s}</div>
              {s === 1 ? 'Bus Details' : s === 2 ? 'Driver & Route' : 'Review'}
            </div>
          ))}
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div className="bus-preview">
              <div className="bp-label">Bus Number</div>
              <div className="bp-id">{form.busNo || '—'}</div>
              <div className="bp-sub">College-assigned bus number</div>
            </div>
            <div className="addcard">
              <div className="addcard-top">
                <div className="addcard-icon">📋</div>
                <div>
                  <div className="addcard-title">Vehicle Details</div>
                  <div className="addcard-sub">
                    Enter the bus number — other fields are optional
                  </div>
                </div>
              </div>
              <div className="addcard-body">
                <div className="f-row full">
                  <div className="field">
                    <label>Internal Bus Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. Bus 07"
                      value={form.busNo}
                      onChange={(e) => set('busNo', e.target.value)}
                    />
                    <span className="fhint">
                      College-assigned identification number
                    </span>
                  </div>
                </div>
                <div className="f-row">
                  <div className="field">
                    <label>
                      Seating Capacity{' '}
                      <span className="opt-label">(optional)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 52"
                      value={form.capacity}
                      onChange={(e) => set('capacity', e.target.value)}
                      min="1"
                      max="100"
                    />
                  </div>
                  <div className="field">
                    <label>
                      Vehicle Make <span className="opt-label">(optional)</span>
                    </label>
                    <select
                      value={form.make}
                      onChange={(e) => set('make', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {[
                        'Tata Motors',
                        'Ashok Leyland',
                        'Volvo',
                        'Eicher',
                        'Force Motors',
                      ].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="f-row" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label>
                      Year <span className="opt-label">(optional)</span>
                    </label>
                    <select
                      value={form.year}
                      onChange={(e) => set('year', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {[
                        2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
                        2017,
                      ].map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>
                      Fuel Type <span className="opt-label">(optional)</span>
                    </label>
                    <select
                      value={form.fuelType}
                      onChange={(e) => set('fuelType', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {['Diesel', 'CNG', 'Electric'].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="nav-btns">
              <div />
              <button className="btn btn-primary" onClick={next}>
                Next: Driver & Route →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <div className="addcard">
              <div className="addcard-top">
                <div className="addcard-icon">👤</div>
                <div>
                  <div className="addcard-title">Driver Information</div>
                  <div className="addcard-sub">Assign a driver to this bus</div>
                </div>
              </div>
              <div className="addcard-body">
                <div className="f-row">
                  <div className="field">
                    <label>Driver Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Ravi Kumar"
                      value={form.driverName}
                      onChange={(e) => set('driverName', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Driver Contact *</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={form.driverPhone}
                      onChange={(e) => set('driverPhone', e.target.value)}
                    />
                  </div>
                </div>
                <div className="f-row full">
                  <div className="field">
                    <label>Driver Login PIN *</label>
                    <input
                      type="text"
                      placeholder="e.g. 1234 (min 4 chars)"
                      maxLength={8}
                      value={form.driverPin}
                      onChange={(e) => set('driverPin', e.target.value)}
                    />
                    <span className="fhint">
                      Driver will use this PIN + bus number to log in. Minimum 4
                      characters for Firebase Auth.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="addcard">
              <div className="addcard-top">
                <div className="addcard-icon">🗺️</div>
                <div>
                  <div className="addcard-title">Route Assignment</div>
                  <div className="addcard-sub">
                    Which route does this bus serve? (loaded from Firestore)
                  </div>
                </div>
              </div>
              <div className="addcard-body">
                <div className="f-row full" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label>Assigned Route</label>
                    <select
                      value={form.assignedRouteId}
                      onChange={(e) => {
                        const selected = routes.find(
                          (r) => r.id === e.target.value
                        );
                        set('assignedRouteId', e.target.value);
                        set(
                          'assignedRouteDisplay',
                          selected
                            ? `${selected.routeNumber} – ${
                                selected.stops?.[0]?.name ?? ''
                              } → ${
                                selected.stops?.[selected.stops.length - 1]
                                  ?.name ?? ''
                              }`
                            : ''
                        );
                      }}
                    >
                      <option value="">No route yet</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.routeNumber} – {r.stops?.[0]?.name ?? '?'} →{' '}
                          {r.stops?.[r.stops.length - 1]?.name ?? '?'}
                        </option>
                      ))}
                    </select>
                    <span className="fhint">
                      {routes.length === 0
                        ? 'No routes in Firestore yet. Add a route first.'
                        : 'Routes loaded live from Firestore.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn btn-outline" onClick={prev}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={next}>
                Next: Review →
              </button>
            </div>
          </>
        )}

        {/* STEP 3 – Review */}
        {step === 3 && (
          <>
            <div className="addcard">
              <div className="addcard-top">
                <div className="addcard-icon">✅</div>
                <div>
                  <div className="addcard-title">Review & Save</div>
                  <div className="addcard-sub">
                    Confirm before saving to Firestore (driver login account
                    will be created)
                  </div>
                </div>
              </div>
              <div className="addcard-body">
                <div className="bus-preview" style={{ marginBottom: 20 }}>
                  <div className="bp-label">Bus Number</div>
                  <div className="bp-id">{form.busNo}</div>
                  <div className="bp-sub">
                    {form.make} {form.year} · {form.fuelType || 'Fuel unset'}
                  </div>
                </div>

                <div className="review-block">
                  <h4>Vehicle Info</h4>
                  <div className="rv-grid">
                    {[
                      ['Bus No.', form.busNo],
                      [
                        'Capacity',
                        form.capacity ? `${form.capacity} seats` : '—',
                      ],
                      ['Make', form.make || '—'],
                      ['Year', form.year || '—'],
                      ['Fuel', form.fuelType || '—'],
                    ].map(([k, v]) => (
                      <div className="rv-item" key={k}>
                        <div className="rk">{k}</div>
                        <div className="rv">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="review-block">
                  <h4>Driver & Route</h4>
                  <div className="rv-grid">
                    {[
                      ['Driver', form.driverName],
                      ['Contact', form.driverPhone],
                      ['Login PIN', '•'.repeat(form.driverPin.length)],
                      [
                        'Route',
                        form.assignedRouteDisplay || 'No route assigned',
                      ],
                    ].map(([k, v]) => (
                      <div className="rv-item" key={k}>
                        <div className="rk">{k}</div>
                        <div className="rv">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn btn-outline" onClick={prev}>
                ← Back
              </button>
              <button
                className="btn btn-success"
                onClick={handleSaveBus}
                disabled={saving}
              >
                {saving
                  ? '⏳ Creating driver account…'
                  : '💾 Save Bus & Create Login'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
