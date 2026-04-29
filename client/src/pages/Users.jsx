import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api, getUser } from '../lib/auth.js';

const ROLES = ['admin', 'agent', 'user'];

export default function Users() {
  const me = getUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editTarget, setEditTarget] = useState(null);   // null | 'new' | user object
  const [resetTarget, setResetTarget] = useState(null); // user object
  const [confirm, setConfirm] = useState(null);         // { user, message, action, label }

  const load = async () => {
    setLoading(true);
    try {
      const list = await api('/api/users');
      setUsers(list);
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
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (!q) return true;
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      admins: users.filter((u) => u.role === 'admin').length,
      agents: users.filter((u) => u.role === 'agent').length
    };
  }, [users]);

  const handleSave = async (payload, isNew) => {
    if (isNew) {
      const created = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
      setUsers((prev) => [created, ...prev]);
      setBanner({ type: 'success', text: `User ${created.email} created.` });
    } else {
      const updated = await api(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setBanner({ type: 'success', text: `${updated.name} updated.` });
    }
    setEditTarget(null);
  };

  const handleResetPassword = async (newPassword) => {
    await api(`/api/users/${resetTarget.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPassword })
    });
    setBanner({ type: 'success', text: `Password reset for ${resetTarget.email}.` });
    setResetTarget(null);
  };

  const toggleActive = (user) => {
    const turningOff = user.is_active;
    setConfirm({
      user,
      message: turningOff
        ? `Deactivate ${user.name}? They will no longer be able to sign in.`
        : `Reactivate ${user.name}? They will be able to sign in again.`,
      label: turningOff ? 'Deactivate' : 'Reactivate',
      tone: turningOff ? 'rose' : 'accent',
      action: async () => {
        const updated = await api(`/api/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: !user.is_active })
        });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        setBanner({
          type: 'success',
          text: `${updated.name} ${updated.is_active ? 'reactivated' : 'deactivated'}.`
        });
        setConfirm(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Users</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Administration</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Users</h1>
            <p className="mt-1 text-slate-600">
              Manage Mainframe accounts, roles, and access for the Eljin Corp directory.
            </p>
          </div>
          <button onClick={() => setEditTarget('new')} className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto">
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add user
          </button>
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

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={counts.total} tone="brand" />
          <Stat label="Active" value={counts.active} tone="accent" />
          <Stat label="Admins" value={counts.admins} tone="amber" />
          <Stat label="Agents" value={counts.agents} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
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
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All roles</option>
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">Active &amp; inactive</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th>User</Th>
                  <Th className="w-28">Role</Th>
                  <Th className="w-40">Department</Th>
                  <Th className="w-28">Status</Th>
                  <Th className="w-36">Last login</Th>
                  <Th className="w-44 text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Loading users…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">No users match your filters.</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-white text-xs font-bold">
                            {initialsOf(u.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">
                              {u.name}
                              {u.id === me?.id && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">You</span>}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><RolePill role={u.role} /></td>
                      <td className="px-5 py-3 text-slate-700">{u.department || <span className="italic text-slate-400">—</span>}</td>
                      <td className="px-5 py-3"><StatusPill active={!!u.is_active} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500">{u.last_login_at ? relativeTime(u.last_login_at) : 'never'}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn label="Edit" onClick={() => setEditTarget(u)}>
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                          </IconBtn>
                          <IconBtn label="Reset password" onClick={() => setResetTarget(u)}>
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="10" rx="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </IconBtn>
                          <IconBtn
                            label={u.is_active ? 'Deactivate' : 'Reactivate'}
                            onClick={() => toggleActive(u)}
                            disabled={u.id === me?.id}
                            tone={u.is_active ? 'rose' : 'accent'}
                          >
                            {u.is_active ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M5 5l14 14" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M8 12l3 3 5-6" />
                              </svg>
                            )}
                          </IconBtn>
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

      {editTarget && (
        <UserFormModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSave}
          isSelf={editTarget !== 'new' && editTarget?.id === me?.id}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSubmit={handleResetPassword}
        />
      )}

      {confirm && (
        <ConfirmModal
          {...confirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function UserFormModal({ target, onClose, onSave, isSelf }) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name || '');
  const [email, setEmail] = useState(isNew ? '' : target.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(isNew ? 'user' : target.role || 'user');
  const [department, setDepartment] = useState(isNew ? '' : target.department || '');
  const [isActive, setIsActive] = useState(isNew ? true : !!target.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || (isNew && password.length < 8)) {
      setError(isNew ? 'Name, email, and an 8+ character password are required.' : 'Name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = isNew
        ? { name: name.trim(), email: email.trim(), password, role, department: department.trim() || null, is_active: isActive }
        : { name: name.trim(), role, department: department.trim() || null, is_active: isActive };
      await onSave(payload, isNew);
    } catch (err) {
      setError(err.message || 'Could not save the user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'Add user' : `Edit ${target.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Full name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls()} autoFocus />
        </FormField>

        <FormField label="Work email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@eljin.corp"
            readOnly={!isNew}
            className={inputCls()}
          />
          {!isNew && <p className="text-[11px] text-slate-500 mt-1">Email cannot be changed after the account is created.</p>}
        </FormField>

        {isNew && (
          <FormField label="Initial password" required hint="At least 8 characters. Share this with the user securely.">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls()}
              placeholder="e.g. Welcome2026!"
            />
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Role" required>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls()} disabled={isSelf}>
              {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
            {isSelf && <p className="text-[11px] text-slate-500 mt-1">You cannot change your own role.</p>}
          </FormField>
          <FormField label="Department">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls()} placeholder="e.g. IT" />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isSelf}
            className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
          />
          Account active
          {isSelf && <span className="text-[11px] text-slate-500">(you cannot deactivate yourself)</span>}
        </label>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {submitting ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Set a new password for <span className="font-mono text-slate-800">{user.email}</span>. Share it
          with the user through a secure channel.
        </p>
        <FormField label="New password" required hint="Minimum 8 characters.">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls()}
            autoFocus
            placeholder="Welcome2026!"
          />
        </FormField>
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {submitting ? 'Resetting…' : 'Reset password'}
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
  return 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-400 read-only:bg-slate-50';
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

function RolePill({ role }) {
  const map = {
    admin: 'bg-amber-50 text-amber-700 ring-amber-200',
    agent: 'bg-brand-50 text-brand-800 ring-brand-200',
    user: 'bg-slate-100 text-slate-700 ring-slate-200'
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[role] || map.user}`}>
      {role}
    </span>
  );
}

function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-200 px-2 py-0.5 text-[10px] font-semibold">
      <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 px-2 py-0.5 text-[10px] font-semibold">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
    </span>
  );
}

function IconBtn({ children, label, onClick, disabled, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 hover:text-brand-900 hover:bg-slate-100',
    rose: 'text-slate-500 hover:text-rose-700 hover:bg-rose-50',
    accent: 'text-slate-500 hover:text-accent-700 hover:bg-accent-50'
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function initialsOf(name) {
  return (name || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function relativeTime(ts) {
  const then = new Date(ts).getTime();
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
