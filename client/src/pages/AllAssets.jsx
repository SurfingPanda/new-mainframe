import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api, getUser } from '../lib/auth.js';

const STATUSES = ['in_use', 'in_storage', 'repair', 'retired'];

const STATUS_META = {
  in_use:     { label: 'In Use',       color: 'bg-accent-50 text-accent-700 ring-accent-200',  dot: 'bg-accent-500' },
  in_storage: { label: 'In Storage',   color: 'bg-brand-50 text-brand-800 ring-brand-200',     dot: 'bg-brand-400' },
  repair:     { label: 'Under Repair', color: 'bg-amber-50 text-amber-700 ring-amber-200',     dot: 'bg-amber-400' },
  retired:    { label: 'Retired',      color: 'bg-slate-100 text-slate-500 ring-slate-200',    dot: 'bg-slate-400' },
};

export default function AllAssets() {
  const me = getUser();
  const navigate = useNavigate();
  const location = useLocation();
  const canEdit = me?.role === 'admin' || me?.role === 'agent';

  const [assets, setAssets]       = useState([]);
  const [types, setTypes]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [banner, setBanner]       = useState(location.state?.banner ? { text: location.state.banner } : null);

  const [query, setQuery]         = useState('');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [assetList, typeList] = await Promise.all([
        api('/api/assets'),
        api('/api/assets/meta/types')
      ]);
      setAssets(assetList);
      setTypes(typeList);
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
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
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
  }, [assets, query, typeFilter, statusFilter]);

  const counts = useMemo(() => ({
    total:      assets.length,
    in_use:     assets.filter((a) => a.status === 'in_use').length,
    repair:     assets.filter((a) => a.status === 'repair').length,
    retired:    assets.filter((a) => a.status === 'retired').length,
  }), [assets]);

  const handleStatusChange = async (asset, newStatus) => {
    try {
      const updated = await api(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? updated : a)));
      setBanner({ text: `${asset.asset_tag} → ${STATUS_META[newStatus].label}` });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/assets/${deleteTarget.id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setBanner({ text: `Asset ${deleteTarget.asset_tag} removed.` });
      setDeleteTarget(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Asset Inventory</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">All Assets</span>
        </nav>

        {/* Header */}
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Asset Inventory</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">All Assets</h1>
            <p className="mt-1 text-slate-600">Track every device issued by Eljin Corp.</p>
          </div>
          {canEdit && (
            <Link to="/assets/new" className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto inline-flex items-center">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Asset
            </Link>
          )}
        </section>

        {/* Banner */}
        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total assets"    value={counts.total}   tone="brand" icon="box" />
          <StatCard label="In use"          value={counts.in_use}  tone="accent" icon="check" />
          <StatCard label="Under repair"    value={counts.repair}  tone="amber" icon="wrench" />
          <StatCard label="Retired"         value={counts.retired} tone="slate" icon="archive" />
        </section>

        {/* Table card */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          {/* Toolbar */}
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
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="text-xs text-slate-400 shrink-0">
              {filtered.length} of {assets.length} asset{assets.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Loading assets…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">No assets found</p>
              <p className="mt-1 text-xs text-slate-500">
                {assets.length === 0 ? 'Start tracking hardware by adding your first asset.' : 'Try adjusting your filters.'}
              </p>
              {canEdit && assets.length === 0 && (
                <Link to="/assets/new" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
                  Add first asset →
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
                    <Th>Purchased</Th>
                    <Th>Status</Th>
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
                        {asset.assignee ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white text-[9px] font-bold flex-none">
                              {asset.assignee.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-slate-700 truncate max-w-[100px]">{asset.assignee}</span>
                          </div>
                        ) : (
                          <span className="italic text-slate-400 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs max-w-[120px] truncate">
                        {asset.location || <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {asset.purchased_at ? new Date(asset.purchased_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {canEdit ? (
                          <select
                            value={asset.status}
                            onChange={(e) => handleStatusChange(asset, e.target.value)}
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset border-0 focus:outline-none focus:ring-2 focus:ring-accent-500 cursor-pointer ${STATUS_META[asset.status]?.color}`}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_META[s].label}</option>
                            ))}
                          </select>
                        ) : (
                          <StatusPill status={asset.status} />
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <IconBtn label="Edit" onClick={() => navigate(`/assets/edit/${asset.id}`)}>
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                              </svg>
                            </IconBtn>
                            <IconBtn label="Delete" tone="rose" onClick={() => setDeleteTarget(asset)}>
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
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

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Remove asset" size="sm">
          <p className="text-sm text-slate-700">
            Permanently remove <span className="font-mono font-bold text-brand-900">{deleteTarget.asset_tag}</span> ({deleteTarget.model || deleteTarget.type})? This cannot be undone.
          </p>
          <footer className="flex justify-end gap-2 pt-4">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-60 transition-colors"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

/* ─── Small components ─── */
function StatCard({ label, value, tone, icon }) {
  const tones = {
    brand:  'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber:  'text-amber-700 ring-amber-200 bg-amber-50',
    slate:  'text-slate-700 ring-slate-200 bg-slate-100'
  };
  const icons = {
    box: <path d="M3 7l9-4 9 4-9 4-9-4z"/>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>
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
  const meta = STATUS_META[status] || STATUS_META.in_storage;
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
    rose:  'text-slate-500 hover:text-rose-700 hover:bg-rose-50',
  };
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
}
