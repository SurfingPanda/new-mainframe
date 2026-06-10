import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import Avatar from '../components/Avatar.jsx';
import { api, getUser, updateStoredUser } from '../lib/auth.js';

const ROLES = ['admin', 'agent', 'user'];

const PERMISSION_MODULES = [
  {
    key: 'tickets',
    label: 'Work Orders',
    actions: [
      { key: 'view', label: 'View work orders' },
      { key: 'create', label: 'Create / edit work orders' }
    ]
  },
  {
    key: 'assets',
    label: 'Assets',
    actions: [
      { key: 'view', label: 'View asset inventory' },
      { key: 'manage', label: 'Add / edit assets' }
    ]
  },
  {
    key: 'kb',
    label: 'Knowledge Base',
    actions: [
      { key: 'view', label: 'View articles' },
      { key: 'manage', label: 'Author / edit articles' }
    ]
  },
  {
    key: 'users',
    label: 'Users',
    actions: [
      { key: 'manage', label: 'Manage users' }
    ]
  },
  {
    key: 'spaces',
    label: 'Spaces',
    actions: [
      { key: 'view', label: 'Use spaces' },
      { key: 'manage', label: 'Administer all spaces' }
    ]
  }
];

const ROLE_DEFAULTS = {
  admin: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: true  },
    kb:       { view: true,  manage: true  },
    users:    { manage: true },
    network:  { view: true,  manage: true  },
    spaces:   { view: true,  manage: true  }
  },
  agent: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: true  },
    kb:       { view: true,  manage: true  },
    users:    { manage: false },
    network:  { view: true,  manage: true  },
    spaces:   { view: true,  manage: false }
  },
  user: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: false },
    kb:       { view: true,  manage: false },
    users:    { manage: false },
    network:  { view: false, manage: false },
    spaces:   { view: true,  manage: false }
  }
};

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
  const [showImport, setShowImport] = useState(false);

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

  // Refresh a single row in place (used after a profile-picture upload, which
  // doesn't close the edit modal).
  const applyUserUpdate = (updated) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (updated.id === me?.id) updateStoredUser({ name: updated.name, avatar_url: updated.avatar_url ?? null });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-10 space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700">Users</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Administration</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 dark:text-white">Users</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Manage Hubly accounts, roles, and access for the Eljin Corp directory.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button onClick={() => setShowImport(true)} className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Import CSV/XLSX
            </button>
            <button onClick={() => setEditTarget('new')} className="btn-primary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add user
            </button>
          </div>
        </section>

        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800 dark:bg-accent-500/10 dark:ring-accent-500/30 dark:text-accent-200">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs dark:text-accent-300 dark:hover:text-accent-100">Dismiss</button>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={counts.total} tone="brand" icon="users" />
          <Stat label="Active" value={counts.active} tone="accent" icon="active" />
          <Stat label="Admins" value={counts.admins} tone="amber" icon="admins" />
          <Stat label="Agents" value={counts.agents} tone="sky" icon="agents" />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center dark:border-slate-800">
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
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <option value="all">All roles</option>
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <option value="all">Active &amp; inactive</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/60">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Th>User</Th>
                  <Th className="w-28">Role</Th>
                  <Th className="w-40">Department</Th>
                  <Th className="w-28">Status</Th>
                  <Th className="w-36">Last login</Th>
                  <Th className="w-44 text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading users…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No users match your filters.</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar_url} size="h-9 w-9" textClass="text-xs" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate dark:text-white">
                              {u.name}
                              {u.id === me?.id && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">You</span>}
                            </div>
                            <div className="text-xs text-slate-500 truncate dark:text-slate-400">
                              {u.job_title ? <>{u.job_title} · {u.email}</> : u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><RolePill role={u.role} /></td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{u.department || <span className="italic text-slate-400 dark:text-slate-500">—</span>}</td>
                      <td className="px-5 py-3"><StatusPill active={!!u.is_active} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{u.last_login_at ? relativeTime(u.last_login_at) : 'never'}</td>
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
          onUserUpdate={applyUserUpdate}
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

      {showImport && (
        <ImportUsersModal
          onClose={() => setShowImport(false)}
          onImported={(summary) => {
            load();
            setBanner({ type: 'success', text: `Import complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed.` });
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({ target, onClose, onSave, onUserUpdate, isSelf }) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name || '');
  const [email, setEmail] = useState(isNew ? '' : target.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(isNew ? 'user' : target.role || 'user');
  const [department, setDepartment] = useState(isNew ? '' : target.department || '');
  const [jobTitle, setJobTitle] = useState(isNew ? '' : target.job_title || '');
  const [avatarUrl, setAvatarUrl] = useState(isNew ? null : target.avatar_url || null);
  const [departments, setDepartments] = useState([]);
  const [isActive, setIsActive] = useState(isNew ? true : !!target.is_active);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api('/api/departments')
      .then((list) => setDepartments(Array.isArray(list) ? list.map((d) => d.name) : []))
      .catch(() => {});
  }, []);
  // null = inherit from role; an object = explicit overrides per module/action
  const [permissions, setPermissions] = useState(isNew ? null : target.permissions || null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const setPermissionFor = (mod, action, value) => {
    setPermissions((prev) => {
      const next = prev ? { ...prev, [mod]: { ...(prev[mod] || {}) } } : { [mod]: {} };
      if (value === 'inherit') {
        if (next[mod]) {
          delete next[mod][action];
          if (Object.keys(next[mod]).length === 0) delete next[mod];
        }
      } else {
        next[mod] = { ...(next[mod] || {}), [action]: value };
      }
      return Object.keys(next).length ? next : null;
    });
  };

  const resetPermissions = () => setPermissions(null);

  // Avatar upload is only available for an existing user (needs an id). New
  // users can add a photo after they're created.
  const uploadPhoto = async (file) => {
    if (!file || isNew) return;
    setError(''); setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const updated = await api(`/api/users/${target.id}/avatar`, { method: 'POST', body: fd });
      setAvatarUrl(updated.avatar_url);
      onUserUpdate?.(updated);
    } catch (err) {
      setError(err.message || 'Could not upload the picture.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    if (isNew) return;
    setError(''); setPhotoBusy(true);
    try {
      const updated = await api(`/api/users/${target.id}/avatar`, { method: 'DELETE' });
      setAvatarUrl(null);
      onUserUpdate?.(updated);
    } catch (err) {
      setError(err.message || 'Could not remove the picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || (isNew && password.length < 8)) {
      setError(isNew ? 'Name, email, and an 8+ character password are required.' : 'Name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      const basePayload = isNew
        ? { name: name.trim(), email: email.trim(), password, role, department: department.trim() || null, job_title: jobTitle.trim() || null, is_active: isActive }
        : { name: name.trim(), role, department: department.trim() || null, job_title: jobTitle.trim() || null, is_active: isActive };
      const payload = isSelf ? basePayload : { ...basePayload, permissions };
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
        {!isNew && (
          <div className="flex items-center gap-4 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <Avatar name={name} src={avatarUrl} size="h-14 w-14" textClass="text-base" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <label className={`btn-secondary !px-3 !py-1.5 text-xs ${photoBusy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                  {photoBusy ? 'Working…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/heic"
                    className="hidden"
                    onChange={(e) => uploadPhoto(e.target.files?.[0])}
                  />
                </label>
                {avatarUrl && (
                  <button type="button" onClick={removePhoto} disabled={photoBusy} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">PNG, JPEG, GIF, WebP, or HEIC · up to 5 MB.</p>
            </div>
          </div>
        )}

        <FormField label="Full name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls()} autoFocus />
        </FormField>

        <FormField label="Job title" hint="Optional — the user's role or position (e.g. IT Support Specialist).">
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputCls()} placeholder="e.g. IT Support Specialist" />
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
          {!isNew && <p className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">Email cannot be changed after the account is created.</p>}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Role" required>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls()} disabled={isSelf}>
              {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
            {isSelf && <p className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">You cannot change your own role.</p>}
          </FormField>
          <FormField label="Department">
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls()}>
              <option value="">— None —</option>
              {/* Keep the user's current department selectable even if it's no
                  longer in the active list. */}
              {department && !departments.includes(department) && (
                <option value={department}>{department}</option>
              )}
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer dark:text-slate-300">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isSelf}
            className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500 dark:border-slate-600 dark:bg-slate-800"
          />
          Account active
          {isSelf && <span className="text-[11px] text-slate-500 dark:text-slate-400">(you cannot deactivate yourself)</span>}
        </label>

        <PermissionsPanel
          role={role}
          permissions={permissions}
          onChange={setPermissionFor}
          onReset={resetPermissions}
          disabled={isSelf}
        />

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>}

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

function PermissionsPanel({ role, permissions, onChange, onReset, disabled }) {
  const overrides = permissions || {};
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.user;
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/40">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Module access</div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Defaults follow the user's role. Override individual modules below — leave a row on
            <span className="font-semibold"> Inherit</span> to keep the role default.
          </p>
        </div>
        {hasOverrides && !disabled && (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-semibold text-accent-700 hover:text-accent-900 dark:text-accent-300 dark:hover:text-accent-100"
          >
            Reset to role defaults
          </button>
        )}
      </header>
      {disabled ? (
        <p className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">You cannot change your own permissions.</p>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {PERMISSION_MODULES.map((mod) => (
            <div key={mod.key} className="px-3 py-2.5">
              <div className="text-xs font-semibold text-slate-800 mb-1.5 dark:text-slate-200">{mod.label}</div>
              <div className="space-y-1.5">
                {mod.actions.map((action) => {
                  const override = overrides[mod.key]?.[action.key];
                  const isOverridden = typeof override === 'boolean';
                  const value = isOverridden ? (override ? 'allow' : 'deny') : 'inherit';
                  const inherited = !!defaults[mod.key]?.[action.key];
                  return (
                    <div key={action.key} className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        {action.label}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          role default: {inherited ? 'allow' : 'deny'}
                        </span>
                      </div>
                      <select
                        value={value}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'inherit') onChange(mod.key, action.key, 'inherit');
                          else onChange(mod.key, action.key, v === 'allow');
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="inherit">Inherit ({inherited ? 'allow' : 'deny'})</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const IMPORT_HEADER_MAP = {
  name: 'name', 'full name': 'name', fullname: 'name', full_name: 'name',
  email: 'email', 'work email': 'email', work_email: 'email', 'e-mail': 'email',
  department: 'department', dept: 'department',
  role: 'role'
};
const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeImportRow(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = IMPORT_HEADER_MAP[String(k).trim().toLowerCase()];
    if (key && (out[key] == null || out[key] === '')) {
      out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    }
  }
  return out;
}

function rowProblem(r) {
  if (!r.name || !r.email) return 'Missing name or email';
  if (!IMPORT_EMAIL_RE.test(r.email)) return 'Invalid email';
  if (r.role && !ROLES.includes(String(r.role).toLowerCase())) return `Invalid role "${r.role}"`;
  return null;
}

function csvCell(value) {
  const t = String(value ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportUsersModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const validRows = rows.filter((r) => !rowProblem(r));

  const handleFile = async (file) => {
    setParseError(''); setError(''); setResults(null); setRows([]); setFileName('');
    if (!file) return;
    try {
      // Lazy-load SheetJS (xlsx) only when a file is actually imported — it's a
      // heavy dependency, so keeping it out of the main bundle speeds first load.
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = json.map(normalizeImportRow).filter((r) => r.name || r.email);
      if (!mapped.length) {
        setParseError('No rows found. The first row must have headers: name, email, department, role.');
        return;
      }
      setRows(mapped);
      setFileName(file.name);
    } catch {
      setParseError('Could not read that file. Use a .csv or .xlsx with a header row.');
    }
  };

  const doImport = async () => {
    setImporting(true); setError('');
    try {
      const payload = {
        users: rows.map((r) => ({
          name: r.name,
          email: r.email,
          department: r.department || null,
          role: r.role ? String(r.role).toLowerCase() : 'user'
        }))
      };
      const res = await api('/api/users/import', { method: 'POST', body: JSON.stringify(payload) });
      setResults(res);
      onImported(res);
    } catch (e) {
      setError(e.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    downloadCsv('user-import-template.csv', [
      'name,email,department,role',
      'Jane Doe,jane.doe@eljin.corp,IT,user',
      'John Cruz,john.cruz@eljin.corp,Finance,agent'
    ]);
  };

  const downloadCredentials = () => {
    const created = results.results.filter((r) => r.status === 'created');
    downloadCsv(
      'imported-users-credentials.csv',
      ['name,email,password'].concat(created.map((r) => [csvCell(r.name), csvCell(r.email), csvCell(r.password)].join(',')))
    );
  };

  return (
    <Modal open onClose={onClose} title="Import users" size="lg">
      {!results ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file with a header row. Columns:
            {' '}<code className="text-xs bg-slate-100 rounded px-1 dark:bg-slate-800 dark:text-slate-200">name</code>,
            {' '}<code className="text-xs bg-slate-100 rounded px-1 dark:bg-slate-800 dark:text-slate-200">email</code> (required),
            {' '}<code className="text-xs bg-slate-100 rounded px-1 dark:bg-slate-800 dark:text-slate-200">department</code>,
            {' '}<code className="text-xs bg-slate-100 rounded px-1 dark:bg-slate-800 dark:text-slate-200">role</code> (optional, defaults to user).
            A random password is generated for each user.
          </p>

          <div className="flex items-center gap-3">
            <label className="btn-secondary !px-3.5 !py-2 text-xs cursor-pointer">
              Choose file
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            <button onClick={downloadTemplate} type="button" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200">
              Download template
            </button>
            {fileName && <span className="text-xs text-slate-500 truncate dark:text-slate-400">{fileName}</span>}
          </div>

          {parseError && (
            <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{parseError}</div>
          )}
          {error && (
            <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>
          )}

          {rows.length > 0 && (
            <>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {rows.length} row{rows.length === 1 ? '' : 's'} found · <span className="text-accent-700 font-semibold dark:text-accent-300">{validRows.length} ready</span>
                {rows.length - validRows.length > 0 && <span className="text-rose-600 font-semibold dark:text-rose-400"> · {rows.length - validRows.length} with problems</span>}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left font-semibold text-slate-500 sticky top-0 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r, i) => {
                      const problem = rowProblem(r);
                      return (
                        <tr key={i} className={problem ? 'bg-rose-50/40 dark:bg-rose-500/10' : ''}>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.name || <span className="text-slate-400 dark:text-slate-500">—</span>}</td>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.email || <span className="text-slate-400 dark:text-slate-500">—</span>}</td>
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{r.department || <span className="text-slate-400 dark:text-slate-500">—</span>}</td>
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{(r.role || 'user').toLowerCase()}</td>
                          <td className="px-3 py-1.5">
                            {problem
                              ? <span className="text-rose-600 dark:text-rose-400">{problem}</span>
                              : <span className="text-accent-700 dark:text-accent-300">Ready</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-ghost !px-4 !py-2 text-sm">Cancel</button>
            <button
              onClick={doImport}
              disabled={importing || validRows.length === 0}
              className="btn-primary !px-4 !py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing…' : `Import ${validRows.length} user${validRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-accent-50 text-accent-800 ring-1 ring-accent-200 px-3 py-1 font-medium dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30">{results.created} created</span>
            <span className="rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 px-3 py-1 font-medium dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{results.skipped} skipped</span>
            <span className="rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-3 py-1 font-medium dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30">{results.failed} failed</span>
          </div>

          {results.created > 0 && (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:ring-amber-500/30 dark:text-amber-200">
              Generated passwords are shown only now. Download them and share securely — they can't be retrieved later.
              <button onClick={downloadCredentials} className="ml-2 font-semibold underline">Download credentials CSV</button>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left font-semibold text-slate-500 sticky top-0 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Password / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.results.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.email || `Row ${r.row}`}</td>
                    <td className="px-3 py-1.5">
                      {r.status === 'created' && <span className="text-accent-700 font-medium dark:text-accent-300">Created</span>}
                      {r.status === 'skipped' && <span className="text-slate-500 font-medium dark:text-slate-400">Skipped</span>}
                      {r.status === 'error' && <span className="text-rose-600 font-medium dark:text-rose-400">Error</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-600 dark:text-slate-300">{r.status === 'created' ? r.password : <span className="font-sans text-slate-400 dark:text-slate-500">{r.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="btn-primary !px-4 !py-2 text-sm">Done</button>
          </div>
        </div>
      )}
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
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Set a new password for <span className="font-mono text-slate-800 dark:text-slate-100">{user.email}</span>. Share it
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
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>}
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
      <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      {error && <div className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>}
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
      <label className="block text-xs font-semibold text-slate-700 mb-1 dark:text-slate-300">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-400 read-only:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-500 dark:read-only:bg-slate-900/60';
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}

// Tinted icon chip + subtle card gradient, matching the Spaces / KB stat cards.
const STAT_TONES = {
  brand:  { chip: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',    glow: 'from-brand-50/70' },
  accent: { chip: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30', glow: 'from-accent-50/70' },
  amber:  { chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',    glow: 'from-amber-50/70' },
  sky:    { chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',          glow: 'from-sky-50/70' }
};

const STAT_ICONS = {
  users:  'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  active: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  admins: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  agents: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6'
};

function Stat({ label, value, tone, icon }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br ${t.glow} to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`}>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${t.chip}`}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {STAT_ICONS[icon].trim().split(' M').map((d, i) => <path key={i} d={(i === 0 ? d : 'M' + d)} />)}
        </svg>
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-brand-900 tabular-nums dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function RolePill({ role }) {
  const map = {
    admin: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
    agent: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',
    user: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[role] || map.user}`}>
      {role}
    </span>
  );
}

function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-200 px-2 py-0.5 text-[10px] font-semibold dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30">
      <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 px-2 py-0.5 text-[10px] font-semibold dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
    </span>
  );
}

function IconBtn({ children, label, onClick, disabled, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 hover:text-brand-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800',
    rose: 'text-slate-500 hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/15',
    accent: 'text-slate-500 hover:text-accent-700 hover:bg-accent-50 dark:text-slate-400 dark:hover:text-accent-300 dark:hover:bg-accent-500/15'
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
