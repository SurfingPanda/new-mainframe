import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Public/unauthenticated pages stay eager — they're on the cold-start critical
// path (and small), so we don't want a chunk round-trip before first paint.
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

// Everything behind auth is code-split: each page (and the libs only it uses,
// e.g. chart.js) becomes its own chunk loaded on navigation, so the initial
// bundle is just the shell + sign-in instead of all 40 pages.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ModulePlaceholder = lazy(() => import('./pages/ModulePlaceholder.jsx'));
const AllTickets = lazy(() => import('./pages/AllTickets.jsx'));
const MyQueue = lazy(() => import('./pages/MyQueue.jsx'));
const SubmittedTickets = lazy(() => import('./pages/SubmittedTickets.jsx'));
const CreateTicket = lazy(() => import('./pages/CreateTicket.jsx'));
const CreateIncident = lazy(() => import('./pages/CreateIncident.jsx'));
const TicketDetail = lazy(() => import('./pages/TicketDetail.jsx'));
const WorkOrderReports = lazy(() => import('./pages/WorkOrderReports.jsx'));
const MaintenanceSchedules = lazy(() => import('./pages/MaintenanceSchedules.jsx'));
const MaintenanceScheduleEditor = lazy(() => import('./pages/MaintenanceScheduleEditor.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const UserReports = lazy(() => import('./pages/UserReports.jsx'));
const SurveyReports = lazy(() => import('./pages/SurveyReports.jsx'));
const Departments = lazy(() => import('./pages/Departments.jsx'));
const SlaSettings = lazy(() => import('./pages/SlaSettings.jsx'));
const PasswordResetRequests = lazy(() => import('./pages/PasswordResetRequests.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Mailbox = lazy(() => import('./pages/Mailbox.jsx'));
const Survey = lazy(() => import('./pages/Survey.jsx'));
const AllAssets = lazy(() => import('./pages/AllAssets.jsx'));
const AssignedAssets = lazy(() => import('./pages/AssignedAssets.jsx'));
const AddAsset = lazy(() => import('./pages/AddAsset.jsx'));
const AllArticles = lazy(() => import('./pages/AllArticles.jsx'));
const KbArticle = lazy(() => import('./pages/KbArticle.jsx'));
const KbCategory = lazy(() => import('./pages/KbCategory.jsx'));
const ArticleEditor = lazy(() => import('./pages/ArticleEditor.jsx'));
const AssetRequest = lazy(() => import('./pages/AssetRequest.jsx'));
const NetworkMonitoring = lazy(() => import('./pages/NetworkMonitoring.jsx'));
const NetworkReports = lazy(() => import('./pages/NetworkReports.jsx'));
const NetworkReportEditor = lazy(() => import('./pages/NetworkReportEditor.jsx'));
const NetworkReportView = lazy(() => import('./pages/NetworkReportView.jsx'));
const ChatRoom = lazy(() => import('./pages/ChatRoom.jsx'));
const Spaces = lazy(() => import('./pages/Spaces.jsx'));
const SpaceDetail = lazy(() => import('./pages/SpaceDetail.jsx'));

// Shown while a route's chunk is fetched (usually a few hundred ms on first hit).
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-accent-600 dark:border-slate-700 dark:border-t-accent-500"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mailbox"
        element={
          <ProtectedRoute>
            <Mailbox />
          </ProtectedRoute>
        }
      />
      <Route
        path="/survey/:ticketId"
        element={
          <ProtectedRoute>
            <Survey />
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
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces"
        element={
          <ProtectedRoute permission={['spaces', 'view']}>
            <Spaces />
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces/:id"
        element={
          <ProtectedRoute permission={['spaces', 'view']}>
            <SpaceDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network"
        element={
          <ProtectedRoute permission={['network', 'view']}>
            <NetworkMonitoring />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network/reports"
        element={
          <ProtectedRoute permission={['network', 'view']}>
            <NetworkReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network/reports/new"
        element={
          <ProtectedRoute permission={['network', 'manage']}>
            <NetworkReportEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network/reports/edit/:date"
        element={
          <ProtectedRoute permission={['network', 'manage']}>
            <NetworkReportEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network/reports/view/:date"
        element={
          <ProtectedRoute permission={['network', 'view']}>
            <NetworkReportView />
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
        path="/tickets/reports"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <WorkOrderReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/maintenance"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <MaintenanceSchedules />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/maintenance/new"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <MaintenanceScheduleEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/maintenance/:id"
        element={
          <ProtectedRoute role={['admin', 'agent']}>
            <MaintenanceScheduleEditor />
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
        path="/users/reports"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <UserReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/surveys"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <SurveyReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/departments"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <Departments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/sla"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <SlaSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/password-resets"
        element={
          <ProtectedRoute permission={['users', 'manage']}>
            <PasswordResetRequests />
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
        path="/assets/assigned"
        element={
          <ProtectedRoute permission={['assets', 'view']}>
            <AssignedAssets />
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
    </Suspense>
  );
}
