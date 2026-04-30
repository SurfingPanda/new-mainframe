import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModulePlaceholder from './pages/ModulePlaceholder.jsx';
import AllTickets from './pages/AllTickets.jsx';
import MyQueue from './pages/MyQueue.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import CreateIncident from './pages/CreateIncident.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import Users from './pages/Users.jsx';
import AllAssets from './pages/AllAssets.jsx';
import AddAsset from './pages/AddAsset.jsx';
import AllArticles from './pages/AllArticles.jsx';
import KbArticle from './pages/KbArticle.jsx';
import ArticleEditor from './pages/ArticleEditor.jsx';
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
        path="/tickets/my-queue"
        element={
          <ProtectedRoute>
            <MyQueue />
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
        path="/tickets/create-incident"
        element={
          <ProtectedRoute>
            <CreateIncident />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute role="admin">
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <ProtectedRoute>
            <TicketDetail />
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
        path="/assets/all"
        element={
          <ProtectedRoute>
            <AllAssets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/new"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <AddAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/edit/:id"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <AddAsset />
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
        path="/kb/all"
        element={
          <ProtectedRoute>
            <AllArticles />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/new"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <ArticleEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/edit/:slug"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <ArticleEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/:slug"
        element={
          <ProtectedRoute>
            <KbArticle />
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
