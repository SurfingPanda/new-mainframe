import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';

const ACTION_LABELS = {
  'user.create': 'Created user',
  'user.update': 'Updated user',
  'user.reset_password': 'Reset password',
  'user.import': 'Bulk-imported users',
  'dept.create': 'Created department',
  'dept.update': 'Updated department',
  'dept.delete': 'Deleted department',
  'password_reset.decide': 'Reset-request decision',
  'password_reset.delete': 'Deleted reset request'
};
const labelFor = (a) => ACTION_LABELS[a] || a;

const ACTION_TONE = (a) =>
  a.endsWith('.delete') ? 'bg-rose-50 text-rose-700 ring-rose-200'
  : a.endsWith('.create') ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  : a.includes('reset_password') || a.includes('decide') ? 'bg-amber-50 text-amber-700 ring-amber-200'
  : 'bg-slate-100 text-slate-700 ring-slate-200';

export default function AuditLog() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 50 });
  const [meta, setMeta] = useState({ actions: [], entityTypes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api('/api/audit/meta').then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (q.trim()) params.set('q', q.trim());
    if (action) params.set('action', action);
    if (entityType) params.set('entity_type', entityType);
    const t = setTimeout(() => {
      api(`/api/audit?${params.toString()}`)
        .then((d) => { setData(d); setError(''); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, action, entityType, page]);

  // Reset to page 1 when filters change.
  useEffect(() => { setPage(1); }, [q, action, entityType]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Audit Log</span>
        </nav>

        <section>
          <span className="eyebrow">Administration</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Audit Log</h1>
          <p className="mt-1 text-slate-600">
            App-wide record of sensitive administrative actions. Read-only; admins only.
          </p>
        </section>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search actor, target, or action…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
            <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              <option value="">All actions</option>
              {meta.actions.map((a) => <option key={a} value={a}>{labelFor(a)}</option>)}
            </select>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              <option value="">All targets</option>
              {meta.entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th className="w-44">When</Th>
                  <Th className="w-40">Actor</Th>
                  <Th className="w-48">Action</Th>
                  <Th>Target</Th>
                  <Th className="w-24 text-right pr-5">Details</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No audit entries match your filters.</td></tr>
                ) : (
                  data.items.map((it) => (
                    <Fragment key={it.id}>
                      <tr className="hover:bg-slate-50/60 align-top">
                        <td className="px-5 py-3 text-xs text-slate-500 tabular-nums">{new Date(it.created_at).toLocaleString()}</td>
                        <td className="px-5 py-3 text-slate-800">{it.actor_name || <span className="italic text-slate-400">system</span>}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${ACTION_TONE(it.action)}`}>
                            {labelFor(it.action)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {it.entity_label || <span className="text-slate-400">—</span>}
                          {it.entity_type && <span className="ml-1.5 text-[10px] text-slate-400">({it.entity_type}{it.entity_id ? ` #${it.entity_id}` : ''})</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {it.changes ? (
                            <button onClick={() => setExpanded(expanded === it.id ? null : it.id)} className="text-xs font-semibold text-accent-700 hover:text-accent-900">
                              {expanded === it.id ? 'Hide' : 'View'}
                            </button>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                      {expanded === it.id && it.changes && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="px-5 py-3">
                            <ChangeDetail changes={it.changes} ip={it.ip} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>{data.total} {data.total === 1 ? 'entry' : 'entries'}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-2.5 !py-1 disabled:opacity-40">Prev</button>
              <span>Page {data.page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-2.5 !py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ChangeDetail({ changes, ip }) {
  const entries = changes && typeof changes === 'object' ? Object.entries(changes) : [];
  return (
    <div className="space-y-1.5">
      {entries.map(([field, val]) => (
        <div key={field} className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className="font-semibold text-slate-700 min-w-[7rem]">{field}</span>
          {val && typeof val === 'object' && ('from' in val || 'to' in val) ? (
            <span className="font-mono">
              <span className="rounded bg-rose-100 px-1 text-rose-700">{fmt(val.from)}</span>
              <span className="mx-1.5 text-slate-400">→</span>
              <span className="rounded bg-emerald-100 px-1 text-emerald-700">{fmt(val.to)}</span>
            </span>
          ) : (
            <span className="font-mono text-slate-600">{fmt(val)}</span>
          )}
        </div>
      ))}
      {ip && <div className="pt-1 text-[11px] text-slate-400">IP: <span className="font-mono">{ip}</span></div>}
    </div>
  );
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}
