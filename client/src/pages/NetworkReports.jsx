import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { deleteReport, listReports, todayKey } from '../lib/networkReports.js';

const STATUS_META = {
  stable:   { label: 'Stable',   ring: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',   dot: 'bg-accent-500' },
  degraded: { label: 'Degraded', ring: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',          dot: 'bg-amber-500'  },
  incident: { label: 'Incident', ring: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',                dot: 'bg-rose-500'   },
};

function formatLongDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export default function NetworkReports() {
  const location = useLocation();
  const [rows, setRows]               = useState(() => listReports());
  const [query, setQuery]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [banner, setBanner]           = useState(location.state?.banner ? { text: location.state.banner } : null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const todayKeyVal = todayKey();
  const todayReport = useMemo(() => rows.find((r) => r.date === todayKeyVal), [rows, todayKeyVal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.date?.toLowerCase().includes(q) ||
        r.author?.toLowerCase().includes(q) ||
        r.summary?.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const counts = useMemo(() => ({
    total:    rows.length,
    stable:   rows.filter((r) => r.status === 'stable').length,
    degraded: rows.filter((r) => r.status === 'degraded').length,
    incident: rows.filter((r) => r.status === 'incident').length,
  }), [rows]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteReport(deleteTarget.date);
    setRows(listReports());
    setBanner({ text: `Report for ${deleteTarget.date} deleted.` });
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-6 sm:py-10 space-y-6 sm:space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <Link to="/network" className="hover:text-slate-800 dark:hover:text-slate-200">Network</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700 dark:text-accent-400">Daily Reports</span>
        </nav>

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Network operations</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-brand-900 dark:text-slate-100">
              Daily network reports
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              One log per day — what changed, what broke, what's still open.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {todayReport ? (
              <Link to={`/network/reports/edit/${todayReport.date}`} className="btn-secondary !px-3.5 !py-2 text-xs">
                <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit today's report
              </Link>
            ) : (
              <Link to="/network/reports/new" className="btn-primary !px-3.5 !py-2 text-xs">
                <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New report
              </Link>
            )}
          </div>
        </section>

        {banner && (
          <div className="rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800 dark:bg-accent-500/10 dark:ring-accent-500/30 dark:text-accent-300">
            {banner.text}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-4">
          <StatCard label="Total reports" value={counts.total} sub="All time" tone="brand" />
          <StatCard label="Stable days"   value={counts.stable}   sub="No notable issues" tone="accent" />
          <StatCard label="Degraded"      value={counts.degraded} sub="Some impact"        tone="amber" />
          <StatCard label="Incidents"     value={counts.incident} sub="Outage or major"    tone="rose" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
          <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">All reports</h2>
              <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
                {filtered.length} of {rows.length} shown
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder="Search date, author, summary…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200"
              >
                <option value="all">All statuses</option>
                <option value="stable">Stable</option>
                <option value="degraded">Degraded</option>
                <option value="incident">Incident</option>
              </select>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No reports match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Date</th>
                    <th className="px-5 py-2.5 text-left">Author</th>
                    <th className="px-5 py-2.5 text-left">Executive summary</th>
                    <th className="px-5 py-2.5 text-left">Critical downtime</th>
                    <th className="px-5 py-2.5 text-right">Status</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((r) => (
                    <tr key={r.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <Link to={`/network/reports/view/${r.date}`} className="font-medium text-slate-800 hover:text-accent-700 dark:text-slate-200 dark:hover:text-accent-400">
                          {formatLongDate(r.date)}
                        </Link>
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.date}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.author || '—'}</td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200 max-w-xs">
                        <div className="truncate" title={r.executiveSummary || r.summary}>
                          {r.executiveSummary || r.summary || '—'}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">
                        {r.health?.criticalDowntime || '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            to={`/network/reports/view/${r.date}`}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
                          >
                            View
                          </Link>
                          <Link
                            to={`/network/reports/edit/${r.date}`}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          >
                            Delete
                          </button>
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

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete report"
        size="sm"
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Delete the network report for <span className="font-mono font-semibold">{deleteTarget?.date}</span>?
          This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setDeleteTarget(null)} className="btn-ghost !px-3.5 !py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition-colors"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, sub, tone = 'brand' }) {
  const tones = {
    brand:  'text-brand-800 dark:text-brand-200',
    accent: 'text-accent-700 dark:text-accent-300',
    amber:  'text-amber-700 dark:text-amber-300',
    rose:   'text-rose-700 dark:text-rose-300',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card dark:bg-slate-900 dark:border-slate-800">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-3 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.stable;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-12 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 ring-1 ring-inset ring-accent-200 text-accent-700 dark:bg-accent-500/10 dark:ring-accent-500/30 dark:text-accent-300">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" />
        </svg>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-brand-900 dark:text-slate-100">No reports yet</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto dark:text-slate-400">
        Capture today's network state — events, maintenance, and follow-ups — so the next shift starts informed.
      </p>
      <Link to="/network/reports/new" className="mt-5 inline-flex btn-primary !px-3.5 !py-2 text-xs">
        Write the first report
      </Link>
    </div>
  );
}
