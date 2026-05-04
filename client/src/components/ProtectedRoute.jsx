import { Navigate, useLocation } from 'react-router-dom';
import { getUser, hasPermission, isAuthenticated } from '../lib/auth.js';

export default function ProtectedRoute({ children, role, permission }) {
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
  if (permission) {
    const [mod, action] = Array.isArray(permission) ? permission : [permission.module, permission.action];
    if (!hasPermission(mod, action)) {
      return <Navigate to="/dashboard" replace />;
    }
  }
  return children;
}
