import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModulePlaceholder from './pages/ModulePlaceholder.jsx';
import AllTickets from './pages/AllTickets.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignIn />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/all"
        element={
          <ProtectedRoute>
            <AllTickets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/create"
        element={
          <ProtectedRoute>
            <CreateTicket />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/*"
        element={
          <ProtectedRoute>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/*"
        element={
          <ProtectedRoute>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/*"
        element={
          <ProtectedRoute>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
