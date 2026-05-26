import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';

const STATUS_META = {
  pending:  { label: 'Pending',  color: 'bg-amber-50 text-amber-700 ring-amber-200',  dot: 'bg-amber-500' },
  resolved: { label: 'Resolved', color: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-500' },
  denied:   { label: 'Denied',   color: 'bg-slate-100 text-slate-600 ring-slate-200',   dot: 'bg-slate-400' }
};

export default function PasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [resolveTarget, setResolveTarget] = useState(null);
  const [denyTarget, setDenyTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api('/api/password-resets');
      setRequests(list);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.email?.toLowerCase().includes(q) ||
        r.user_name?.toLowerCase().includes(q) ||
        r.user_department?.toLowerCase().includes(q)
      );
    });
  }, [requests, query, statusFilter]);

  const counts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    resolved: requests.filter((r) => r.status === 'resolved').length,
    denied: requests.filter((r) => r.status === 'denied').length
  }), [requests]);

  const applyUpdated = (updated) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleResolve = async ({ password, notes }) => {
    const updated = await api(`/api/password-resets/${resolveTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'resolved',
        new_password: password || undefined,
        admin_notes: notes || null
      })
    });
    applyUpdated(updated);
    setBanner({
      type: 'success',
      text: password
        ? `Password reset and request closed for ${updated.email}.`
        : `Request marked resolved for ${updated.email}.`
    });
    setResolveTarget(null);
  };

  const handleDeny = async ({ notes }) => {
    const updated = await api(`/api/password-resets/${denyTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'denied', admin_notes: notes || null })
    });
    applyUpdated(updated);
    setBanner({ type: 'success', text: `Request denied for ${updated.email}.` });
    setDenyTarget(null);
  };

  const handleDelete = async () => {
    await api(`/api/password-resets/${deleteTarget.id}`, { method: 'DELETE' });
    setRequests((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setBanner({ type: 'success', text: `Request for ${deleteTarget.email} deleted.` });
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Password Resets</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Administration</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Password Resets</h1>
            <p className="mt-1 text-slate-600">
              Requests submitted from the <span className="font-mono text-slate-700">Forgot password</span> page.
              Resolve a request by issuing a temporary password — the user will need to change it from Settings after signing in.
            </p>
          </div>
        </section>

        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={counts.total} tone="brand" />
          <Stat label="Pending" value={counts.pending} tone="amber" />
          <Stat label="Resolved" value={counts.resolved} tone="accent" />
          <Stat label="Denied" value={counts.denied} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or department…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="denied">Denied</option>
              </select>
            </div>
            <div className="text-xs text-slate-400 shrink-0">
              {filtered.length} of {requests.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th>User</Th>
                  <Th className="w-28">Status</Th>
                  <Th className="w-36">Requested</Th>
                  <Th className="w-44">Resolved by</Th>
                  <Th className="w-56 text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Loading requests…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    {requests.length === 0 ? 'No password reset requests yet.' : 'No requests match your filters.'}
                  </td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-50/60 ${r.status === 'pending' ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-white text-xs font-bold">
                            {initials(r.user_name || r.email)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                              {r.user_name || <span className="italic text-slate-400">Unknown</span>}
                              {r.user_is_active === 0 && (
                                <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 ring-1 ring-rose-200 uppercase tracking-wide">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {r.email}
                              {r.user_department && <> · {r.user_department}</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><StatusPill status={r.status} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500">{relativeTime(r.created_at)}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {r.resolved_by ? (
                          <>
                            <div>{r.resolved_by}</div>
                            <div className="text-[11px] text-slate-400">{r.resolved_at ? relativeTime(r.resolved_at) : ''}</div>
                          </>
                        ) : (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setResolveTarget(r)}
                                className="inline-flex items-center gap-1 rounded-md bg-accent-600 hover:bg-accent-700 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="10" rx="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Resolve
                              </button>
                              <button
                                onClick={() => setDenyTarget(r)}
                                className="inline-flex items-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                Deny
                              </button>
                            </>
                          )}
                          {r.admin_notes && (
                            <button
                              onClick={() => alert(r.admin_notes)}
                              title="View notes"
                              aria-label="View notes"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-brand-900 hover:bg-slate-100 transition-colors"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4h12l4 4v12H4z" />
                                <path d="M8 12h8M8 16h6" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(r)}
                            title="Delete"
                            aria-label="Delete"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {resolveTarget && (
        <ResolveModal target={resolveTarget} onClose={() => setResolveTarget(null)} onSubmit={handleResolve} />
      )}
      {denyTarget && (
        <DenyModal target={denyTarget} onClose={() => setDenyTarget(null)} onSubmit={handleDeny} />
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`Permanently delete the reset request for ${deleteTarget.email}? This cannot be undone.`}
          label="Delete"
          tone="rose"
          action={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ResolveModal({ target, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ password, notes });
    } catch (err) {
      setError(err.message || 'Could not resolve the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Resolve request — ${target.user_name || target.email}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Set a temporary password for <span className="font-mono text-slate-800">{target.email}</span>.
          Share it through a secure channel. Leave blank if you've already handled this out of band.
        </p>

        <FormField label="Temporary password" hint="Minimum 8 characters. Optional — leave blank to mark resolved without changing the password.">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls()}
            autoFocus
            placeholder="Welcome2026!"
          />
        </FormField>

        <FormField label="Internal notes" hint="Optional. Visible to other admins.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls()} min-h-[72px]`}
            placeholder="e.g. Verified identity via team lead."
          />
        </FormField>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white shadow-sm bg-accent-600 hover:bg-accent-700 disabled:opacity-60 transition-colors">
            {submitting ? 'Resolving…' : password ? 'Reset password & close' : 'Mark resolved'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function DenyModal({ target, onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ notes });
    } catch (err) {
      setError(err.message || 'Could not deny the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Deny request — ${target.user_name || target.email}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Mark this request as denied. The user will not be notified automatically — reach out separately if needed.
        </p>
        <FormField label="Reason / notes" hint="Optional. Visible to other admins.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls()} min-h-[72px]`}
            placeholder="e.g. Could not verify identity."
            autoFocus
          />
        </FormField>
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white shadow-sm bg-slate-600 hover:bg-slate-700 disabled:opacity-60 transition-colors">
            {submitting ? 'Denying…' : 'Deny request'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ConfirmModal({ message, label, tone = 'rose', action, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message || 'Action failed.'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onCancel} title="Confirm" size="sm">
      <p className="text-sm text-slate-700">{message}</p>
      {error && <div className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <footer className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className={`!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-60 ${
            tone === 'rose'
              ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500'
              : 'bg-accent-500 hover:bg-accent-600 focus:ring-accent-500'
          }`}
        >
          {busy ? 'Working…' : label}
        </button>
      </footer>
    </Modal>
  );
}

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-400';
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}

function Stat({ label, value, tone }) {
  const tones = {
    brand: 'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber: 'text-amber-700 ring-amber-200 bg-amber-50',
    slate: 'text-slate-700 ring-slate-200 bg-slate-100'
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ring-1 ring-inset ${tones[tone]}`}>
          {value}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function initials(name) {
  return (name || 'U').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function relativeTime(ts) {
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
