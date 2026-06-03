import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { PasswordCard } from '../components/AccountCards.jsx';

// Settings = account security & preferences (currently: change password). Your
// profile information (name, photo, role, access) lives on the Profile page.
export default function Settings() {
  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Settings</span>
        </nav>

        <section className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Account</span>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Settings</h1>
            <p className="mt-1 text-slate-600">Manage your account security and preferences.</p>
          </div>
          <Link to="/profile" className="text-xs font-semibold text-accent-700 hover:text-accent-900">
            View profile →
          </Link>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <PasswordCard />
          </div>
        </div>
      </main>
    </div>
  );
}
