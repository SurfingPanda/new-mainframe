import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModulePlaceholder from './pages/ModulePlaceholder.jsx';
import AllTickets from './pages/AllTickets.jsx';
import MyQueue from './pages/MyQueue.jsx';
import SubmittedTickets from './pages/SubmittedTickets.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import CreateIncident from './pages/CreateIncident.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import AllAssets from './pages/AllAssets.jsx';
import AddAsset from './pages/AddAsset.jsx';
import AllArticles from './pages/AllArticles.jsx';
import KbArticle from './pages/KbArticle.jsx';
import KbCategory from './pages/KbCategory.jsx';
import ArticleEditor from './pages/ArticleEditor.jsx';
import AssetRequest from './pages/AssetRequest.jsx';
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
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/all"
        element={
          <ProtectedRoute permission={['tickets', 'view']}>
            <AllTickets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/my-queue"
        element={
          <ProtectedRoute permission={['tickets', 'view']}>
            <MyQueue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/submitted"
        element={
          <ProtectedRoute permission={['tickets', 'view']}>
            <SubmittedTickets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/create"
        element={
          <ProtectedRoute permission={['tickets', 'create']}>
            <CreateTicket />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/create-incident"
        element={
          <ProtectedRoute permission={['tickets', 'create']}>
            <CreateIncident />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <ProtectedRoute permission={['tickets', 'view']}>
            <TicketDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/*"
        element={
          <ProtectedRoute permission={['tickets', 'view']}>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/all"
        element={
          <ProtectedRoute permission={['assets', 'view']}>
            <AllAssets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/new"
        element={
          <ProtectedRoute permission={['assets', 'manage']}>
            <AddAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/edit/:id"
        element={
          <ProtectedRoute permission={['assets', 'manage']}>
            <AddAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/request"
        element={
          <ProtectedRoute permission={['assets', 'view']}>
            <AssetRequest />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/*"
        element={
          <ProtectedRoute permission={['assets', 'view']}>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/all"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <AllArticles />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/new"
        element={
          <ProtectedRoute permission={['kb', 'manage']}>
            <ArticleEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/edit/:slug"
        element={
          <ProtectedRoute permission={['kb', 'manage']}>
            <ArticleEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/troubleshooting"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <KbCategory
              category="Troubleshooting"
              title="Troubleshooting Guides"
              breadcrumb="Troubleshooting"
              description="Step-by-step fixes for the issues that come up most often."
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/faq"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <KbCategory
              category="FAQ"
              title="Frequently Asked Questions"
              breadcrumb="FAQ"
              description="Quick answers to the questions the IT team gets asked most."
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/policies"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <KbCategory
              category="Policies"
              title="Policies & Procedures"
              breadcrumb="Policies"
              description="Internal policies, procedures, and standard operating documents."
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/:slug"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <KbArticle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kb/*"
        element={
          <ProtectedRoute permission={['kb', 'view']}>
            <ModulePlaceholder />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
