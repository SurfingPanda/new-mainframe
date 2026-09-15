import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';

const URGENCY_META = {
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600 ring-slate-200',  dot: 'bg-slate-400' },
  normal: { label: 'Normal', color: 'bg-brand-50 text-brand-800 ring-brand-200',   dot: 'bg-brand-400' },
  high:   { label: 'High',   color: 'bg-amber-50 text-amber-700 ring-amber-200',   dot: 'bg-amber-400' },
  urgent: { label: 'Urgent', color: 'bg-rose-50 text-rose-700 ring-rose-200',      dot: 'bg-rose-400' },
};

const STATUS_META = {
  pending:   { label: 'Pending',   color: 'bg-amber-50 text-amber-700 ring-amber-200',   dot: 'bg-amber-400' },
  approved:  { label: 'Approved',  color: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-500' },
  denied:    { label: 'Denied',    color: 'bg-rose-50 text-rose-700 ring-rose-200',       dot: 'bg-rose-400' },
  fulfilled: { label: 'Fulfilled', color: 'bg-brand-50 text-brand-800 ring-brand-200',    dot: 'bg-brand-400' },
};

export default function AssetRequestApprovals() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/asset-requests');
      setRequests(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const counts = useMemo(() => ({
    total:     requests.length,
    pending:   requests.filter((r) => r.status === 'pending').length,
    approved:  requests.filter((r) => r.status === 'approved').length,
    fulfilled: requests.filter((r) => r.status === 'fulfilled').length,
  }), [requests]);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/assets/all" className="hover:text-slate-800">Asset Inventory</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Request Approvals</span>
        </nav>

        {/* Header */}
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Asset Inventory · IT</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Asset Request Approvals</h1>
            <p className="mt-1 text-slate-600">Review, approve, deny, or mark equipment requests fulfilled.</p>
          </div>
        </section>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total requests" value={counts.total}     tone="brand"  icon="inbox" />
          <StatCard label="Pending"        value={counts.pending}   tone="amber"  icon="clock" />
          <StatCard label="Approved"       value={counts.approved}  tone="accent" icon="check" />
          <StatCard label="Fulfilled"      value={counts.fulfilled} tone="slate"  icon="package" />
        </section>

        {/* Table */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="text-xs text-slate-400 shrink-0">
              {filtered.length} request{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Loading requests...</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">No requests found</p>
              <p className="mt-1 text-xs text-slate-500">
                {requests.length === 0 ? 'Nothing has been submitted yet.' : 'Try adjusting the filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <Th>ID</Th>
                    <Th>Requester</Th>
                    <Th>Asset Type</Th>
                    <Th>Qty</Th>
                    <Th>Urgency</Th>
                    <Th>Justification</Th>
                    <Th>Status</Th>
                    <Th>Submitted</Th>
                    <Th className="text-right pr-5">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold text-brand-900 bg-brand-50 ring-1 ring-inset ring-brand-200 rounded px-1.5 py-0.5">
                          #{req.id}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white text-[9px] font-bold flex-none">
                            {(req.requester_name || '?').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-slate-700 truncate max-w-[140px]">{req.requester_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">{req.asset_type}</td>
                      <td className="px-5 py-3 text-center text-slate-600">{req.quantity}</td>
                      <td className="px-5 py-3"><Pill meta={URGENCY_META} value={req.urgency} /></td>
                      <td className="px-5 py-3 text-xs text-slate-600 max-w-[240px] truncate" title={req.justification}>
                        {req.justification}
                      </td>
                      <td className="px-5 py-3"><Pill meta={STATUS_META} value={req.status} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          <Link
                            to={`/assets/requests/${req.id}`}
                            title="Review"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-brand-900 hover:bg-slate-100 transition-colors"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                          </Link>
                        </div>
                      </td>
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

function StatCard({ label, value, tone, icon }) {
  const tones = {
    brand:  'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber:  'text-amber-700 ring-amber-200 bg-amber-50',
    slate:  'text-slate-700 ring-slate-200 bg-slate-100'
  };
  const icons = {
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    package: <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>
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

function Pill({ meta, value }) {
  const m = meta[value] || meta[Object.keys(meta)[0]];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}
