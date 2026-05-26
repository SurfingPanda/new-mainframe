import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const STATUS_META = {
  in_use:     { label: 'In Use',       color: 'bg-accent-50 text-accent-700 ring-accent-200',  dot: 'bg-accent-500' },
  in_storage: { label: 'In Storage',   color: 'bg-brand-50 text-brand-800 ring-brand-200',     dot: 'bg-brand-400' },
  repair:     { label: 'Under Repair', color: 'bg-amber-50 text-amber-700 ring-amber-200',     dot: 'bg-amber-400' },
  retired:    { label: 'Retired',      color: 'bg-slate-100 text-slate-500 ring-slate-200',    dot: 'bg-slate-400' }
};

export default function AssignedAssets() {
  const me = getUser();
  const navigate = useNavigate();
  const canEdit = me?.role === 'admin' || me?.role === 'agent';

  const [assets, setAssets] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [list, typeList] = await Promise.all([
        api('/api/assets'),
        api('/api/assets/meta/types')
      ]);
      setAssets(list);
      setTypes(typeList);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // The whole page works on assets that actually have someone assigned.
  const assigned = useMemo(
    () => assets.filter((a) => a.assignee && a.assignee.trim() && a.status !== 'retired'),
    [assets]
  );

  const assigneeOptions = useMemo(
    () => [...new Set(assigned.map((a) => a.assignee))].sort((a, b) => a.localeCompare(b)),
    [assigned]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assigned.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (assigneeFilter !== 'all' && a.assignee !== assigneeFilter) return false;
      if (!q) return true;
      return (
        a.asset_tag?.toLowerCase().includes(q) ||
        a.model?.toLowerCase().includes(q) ||
        a.assignee?.toLowerCase().includes(q) ||
        a.serial_no?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q)
      );
    });
  }, [assigned, query, typeFilter, assigneeFilter]);

  const counts = useMemo(() => ({
    total: assigned.length,
    people: assigneeOptions.length,
    in_use: assigned.filter((a) => a.status === 'in_use').length,
    repair: assigned.filter((a) => a.status === 'repair').length
  }), [assigned, assigneeOptions]);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/assets/all" className="hover:text-slate-800">Asset Inventory</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Assigned Assets</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Asset Inventory</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Assigned Assets</h1>
            <p className="mt-1 text-slate-600">Devices currently issued to employees across Eljin Corp.</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <Link to="/assets/all" className="btn-ghost !px-3.5 !py-2 text-xs">View all assets</Link>
            {canEdit && (
              <Link to="/assets/new" className="btn-primary !px-3.5 !py-2 text-xs inline-flex items-center">
                <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Asset
              </Link>
            )}
          </div>
        </section>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Assigned" value={counts.total} tone="brand" icon="box" />
          <StatCard label="People with assets" value={counts.people} tone="accent" icon="user" />
          <StatCard label="In use" value={counts.in_use} tone="accent" icon="check" />
          <StatCard label="Under repair" value={counts.repair} tone="amber" icon="wrench" />
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
                placeholder="Search by tag, model, serial, assignee, or location…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 max-w-[180px]">
                <option value="all">All assignees</option>
                {assigneeOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="text-xs text-slate-400 shrink-0">
              {filtered.length} of {assigned.length} assigned
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Loading assigned assets…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {assigned.length === 0 ? 'Nothing issued yet' : 'No matches'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {assigned.length === 0
                  ? 'Once an asset is assigned to a person it will show up here.'
                  : 'Try adjusting your filters or search.'}
              </p>
              {canEdit && assigned.length === 0 && (
                <Link to="/assets/all" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
                  Open inventory →
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <Th>Asset tag</Th>
                    <Th>Type / Model</Th>
                    <Th>Serial no.</Th>
                    <Th>Assignee</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                    <Th>Issued</Th>
                    {canEdit && <Th className="text-right pr-5">Actions</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold text-brand-900 bg-brand-50 ring-1 ring-inset ring-brand-200 rounded px-1.5 py-0.5">
                          {asset.asset_tag}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-800">{asset.model || <span className="italic text-slate-400">—</span>}</div>
                        <div className="text-xs text-slate-500">{asset.type}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">
                        {asset.serial_no || <span className="italic text-slate-400 font-sans">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-white text-[10px] font-bold flex-none">
                            {initials(asset.assignee)}
                          </span>
                          <span className="text-slate-700 truncate max-w-[140px]">{asset.assignee}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs max-w-[140px] truncate">
                        {asset.location || <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={asset.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {asset.updated_at
                          ? new Date(asset.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          : <span className="italic text-slate-400">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <IconBtn label="Edit" onClick={() => navigate(`/assets/edit/${asset.id}`)}>
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                              </svg>
                            </IconBtn>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function initials(name) {
  return (name || 'U').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function StatCard({ label, value, tone, icon }) {
  const tones = {
    brand:  'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber:  'text-amber-700 ring-amber-200 bg-amber-50',
    slate:  'text-slate-700 ring-slate-200 bg-slate-100'
  };
  const icons = {
    box: <path d="M3 7l9-4 9 4-9 4-9-4z" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" /></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset ${tones[tone]}`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icons[icon]}
          </svg>
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.in_use;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}

function IconBtn({ children, label, onClick, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 hover:text-brand-900 hover:bg-slate-100',
    rose:  'text-slate-500 hover:text-rose-700 hover:bg-rose-50'
  };
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
}
