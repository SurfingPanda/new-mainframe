import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { getUser } from '../lib/auth.js';

export default function Settings() {
  const me = getUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Settings</span>
        </nav>

        <section className="flex flex-col gap-1">
          <span className="eyebrow">Account</span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Settings</h1>
          <p className="mt-1 text-slate-600">Your Mainframe account details.</p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ask an admin to update name, email, or department.</p>
          </header>
          <dl className="divide-y divide-slate-100">
            <Row label="Full name" value={me?.name || '—'} />
            <Row label="Email" value={me?.email || '—'} mono />
            <Row label="Role" value={<span className="capitalize">{me?.role || 'user'}</span>} />
            <Row label="Department" value={me?.department || '—'} />
          </dl>
        </section>
      </main>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <dt className="w-40 flex-none text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
