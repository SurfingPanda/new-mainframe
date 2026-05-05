import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const PERMISSION_MODULES = [
  { key: 'tickets', label: 'Tickets', actions: ['view', 'create'] },
  { key: 'assets',  label: 'Assets',  actions: ['view', 'manage'] },
  { key: 'kb',      label: 'Knowledge base', actions: ['view', 'manage'] },
  { key: 'users',   label: 'User management', actions: ['manage'] }
];

const ACTION_LABELS = {
  view: 'View',
  create: 'Create / edit',
  manage: 'Manage'
};

export default function Settings() {
  const stored = getUser();
  const [me, setMe] = useState(stored);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((data) => active && setMe(data))
      .catch(() => {})
      .finally(() => active && setMeLoading(false));
    return () => { active = false; };
  }, []);

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
          <p className="mt-1 text-slate-600">Manage your Mainframe account, security, and access.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <ProfileCard me={me} />
            <PasswordCard />
          </div>
          <div className="space-y-6">
            <ActivityCard me={me} loading={meLoading} />
            <PermissionsCard me={me} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* -------- Profile (read-only) -------- */

function ProfileCard({ me }) {
  return (
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
  );
}

/* -------- Change password -------- */

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!current || !next || !confirm) {
      setError('All fields are required.');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (next === current) {
      setError('New password must be different from your current password.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next })
      });
      setSuccess('Password updated.');
      reset();
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
        <p className="text-xs text-slate-500 mt-0.5">Use at least 8 characters. You'll stay signed in on this device.</p>
      </header>
      <form onSubmit={submit} className="px-5 py-4 space-y-3">
        <PwField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PwField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PwField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

        {error && (
          <p className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
        {success && (
          <p className="rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-xs text-accent-800">{success}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { reset(); setError(''); setSuccess(''); }}
            disabled={submitting}
            className="btn-ghost !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PwField({ label, value, onChange, autoComplete }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      />
    </label>
  );
}

/* -------- Account activity -------- */

function ActivityCard({ me, loading }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Account activity</h2>
        <p className="text-xs text-slate-500 mt-0.5">Recent activity and milestones.</p>
      </header>
      <dl className="divide-y divide-slate-100">
        <Row label="Last sign-in" value={loading ? 'Loading…' : formatDateTime(me?.last_login_at)} />
        <Row label="Member since" value={loading ? 'Loading…' : formatDateTime(me?.created_at)} />
        <Row label="Status" value={<StatusDot active />} />
      </dl>
    </section>
  );
}

function StatusDot({ active }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent-500' : 'bg-slate-300'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/* -------- Access overview -------- */

function PermissionsCard({ me }) {
  const perms = me?.permissions || {};
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Access</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          What you can do, based on your <span className="capitalize font-medium text-slate-700">{me?.role || 'user'}</span> role.
        </p>
      </header>
      <ul className="divide-y divide-slate-100">
        {PERMISSION_MODULES.map((mod) => (
          <li key={mod.key} className="px-5 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{mod.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {mod.actions.map((act) => {
                const allowed = perms[mod.key]?.[act] === true;
                return (
                  <span
                    key={act}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                      allowed
                        ? 'bg-accent-50 text-accent-800 ring-accent-200'
                        : 'bg-slate-50 text-slate-500 ring-slate-200'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${allowed ? 'bg-accent-500' : 'bg-slate-300'}`} />
                    {ACTION_LABELS[act] || act}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------- Helpers -------- */

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <dt className="w-40 flex-none text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
