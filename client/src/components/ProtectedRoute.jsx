import { Navigate, useLocation } from 'react-router-dom';
import { getUser, isAuthenticated } from '../lib/auth.js';

export default function ProtectedRoute({ children, role }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }
  if (role) {
    const user = getUser();
    const allowed = Array.isArray(role) ? role.includes(user?.role) : user?.role === role;
    if (!allowed) {
      return <Navigate to="/dashboard" replace />;
    }
  }
  return children;
}
