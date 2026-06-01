import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editTarget, setEditTarget] = useState(null);   // null | 'new' | dept object
  const [confirm, setConfirm] = useState(null);         // { dept, message, action, label, tone }

  const load = async () => {
    setLoading(true);
    try {
      const list = await api('/api/departments');
      setDepartments(list);
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
    return departments.filter((d) => {
      if (statusFilter === 'active' && !d.is_active) return false;
      if (statusFilter === 'inactive' && d.is_active) return false;
      if (!q) return true;
      return (
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
      );
    });
  }, [departments, query, statusFilter]);

  const counts = useMemo(() => ({
    total: departments.length,
    active: departments.filter((d) => d.is_active).length,
    inactive: departments.filter((d) => !d.is_active).length
  }), [departments]);

  const handleSave = async (payload, isNew) => {
    if (isNew) {
      const created = await api('/api/departments', { method: 'POST', body: JSON.stringify(payload) });
      setDepartments((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setBanner({ type: 'success', text: `Department "${created.name}" created.` });
    } else {
      const updated = await api(`/api/departments/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setDepartments((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setBanner({ type: 'success', text: `Department "${updated.name}" updated.` });
    }
    setEditTarget(null);
  };

  const toggleActive = (dept) => {
    const turningOff = dept.is_active;
    setConfirm({
      dept,
      message: turningOff
        ? `Deactivate "${dept.name}"? It will be hidden from new assignments.`
        : `Reactivate "${dept.name}"?`,
      label: turningOff ? 'Deactivate' : 'Reactivate',
      tone: turningOff ? 'rose' : 'accent',
      action: async () => {
        const updated = await api(`/api/departments/${dept.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: !dept.is_active })
        });
        setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setBanner({
          type: 'success',
          text: `"${updated.name}" ${updated.is_active ? 'reactivated' : 'deactivated'}.`
        });
        setConfirm(null);
      }
    });
  };

  const deleteDept = (dept) => {
    setConfirm({
      dept,
      message: `Delete "${dept.name}"? This cannot be undone. Users currently labelled with this department will keep their text label.`,
      label: 'Delete',
      tone: 'rose',
      action: async () => {
        await api(`/api/departments/${dept.id}`, { method: 'DELETE' });
        setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
        setBanner({ type: 'success', text: `"${dept.name}" deleted.` });
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
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Departments</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Administration</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Departments</h1>
            <p className="mt-1 text-slate-600">
              Manage the departments used to organise users, work orders, and asset assignments.
            </p>
          </div>
          <button onClick={() => setEditTarget('new')} className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto">
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add department
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

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total" value={counts.total} tone="brand" />
          <Stat label="Active" value={counts.active} tone="accent" />
          <Stat label="Inactive" value={counts.inactive} tone="slate" />
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
                placeholder="Search by name or description…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
                  <Th>Department</Th>
                  <Th>Description</Th>
                  <Th className="w-28">Status</Th>
                  <Th className="w-36">Created</Th>
                  <Th className="w-44 text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Loading departments…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    {departments.length === 0
                      ? 'No departments yet. Click "Add department" to create one.'
                      : 'No departments match your filters.'}
                  </td></tr>
                ) : (
                  filtered.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
                            </svg>
                          </span>
                          <div className="font-medium text-slate-900">{d.name}</div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {d.description || <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3"><StatusPill active={!!d.is_active} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn label="Edit" onClick={() => setEditTarget(d)}>
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                          </IconBtn>
                          <IconBtn
                            label={d.is_active ? 'Deactivate' : 'Reactivate'}
                            onClick={() => toggleActive(d)}
                            tone={d.is_active ? 'rose' : 'accent'}
                          >
                            {d.is_active ? (
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
                          <IconBtn label="Delete" onClick={() => deleteDept(d)} tone="rose">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            </svg>
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
        <DepartmentFormModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSave}
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

function DepartmentFormModal({ target, onClose, onSave }) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name || '');
  const [description, setDescription] = useState(isNew ? '' : target.description || '');
  const [isActive, setIsActive] = useState(isNew ? true : !!target.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim() || null,
          is_active: isActive
        },
        isNew
      );
    } catch (err) {
      setError(err.message || 'Could not save the department.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'Add department' : `Edit ${target.name}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls()} autoFocus placeholder="e.g. Marketing" />
        </FormField>

        <FormField label="Description" hint="Optional. Shown alongside the department name.">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls()}
            placeholder="e.g. Brand, content, and campaigns"
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
          />
          Department active
        </label>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {submitting ? 'Saving…' : isNew ? 'Create department' : 'Save changes'}
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
