import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModulePlaceholder from './pages/ModulePlaceholder.jsx';
import AllTickets from './pages/AllTickets.jsx';
import MyQueue from './pages/MyQueue.jsx';
import SubmittedTickets from './pages/SubmittedTickets.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import CreateIncident from './pages/CreateIncident.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import WorkOrderReports from './pages/WorkOrderReports.jsx';
import MaintenanceSchedules from './pages/MaintenanceSchedules.jsx';
import MaintenanceScheduleEditor from './pages/MaintenanceScheduleEditor.jsx';
import Users from './pages/Users.jsx';
import UserReports from './pages/UserReports.jsx';
import SurveyReports from './pages/SurveyReports.jsx';
import Departments from './pages/Departments.jsx';
import PasswordResetRequests from './pages/PasswordResetRequests.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import Mailbox from './pages/Mailbox.jsx';
import Survey from './pages/Survey.jsx';
import AllAssets from './pages/AllAssets.jsx';
import AssignedAssets from './pages/AssignedAssets.jsx';
import AddAsset from './pages/AddAsset.jsx';
import AllArticles from './pages/AllArticles.jsx';
import KbArticle from './pages/KbArticle.jsx';
import KbCategory from './pages/KbCategory.jsx';
import ArticleEditor from './pages/ArticleEditor.jsx';
import AssetRequest from './pages/AssetRequest.jsx';
import NetworkMonitoring from './pages/NetworkMonitoring.jsx';
import NetworkReports from './pages/NetworkReports.jsx';
import NetworkReportEditor from './pages/NetworkReportEditor.jsx';
import NetworkReportView from './pages/NetworkReportView.jsx';
import ChatRoom from './pages/ChatRoom.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
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
  );
}
