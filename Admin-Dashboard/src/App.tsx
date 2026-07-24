import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SplashPage from './pages/SplashPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AddBusPage from './pages/AddBusPage';
import AddRoutePage from './pages/AddRoutePage';
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = sessionStorage.getItem('pp_admin') === 'true';
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/add-bus"
          element={
            <PrivateRoute>
              <AddBusPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/add-route"
          element={
            <PrivateRoute>
              <AddRoutePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/edit-route/:id"
          element={
            <PrivateRoute>
              <AddRoutePage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}