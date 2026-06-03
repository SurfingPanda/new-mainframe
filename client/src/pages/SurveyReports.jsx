import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';

const ASPECTS = [
  { key: 'satisfaction', label: 'Satisfaction' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'professionalism', label: 'Professionalism' }
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'pending', label: 'Pending' }
];

// Mean of the three aspects for a completed survey (1–5), else null.
function overallOf(s) {
  if (s.status !== 'completed') return null;
  return (Number(s.satisfaction) + Number(s.timeliness) + Number(s.professionalism)) / 3;
}

export default function SurveyReports() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/surveys')
      .then((data) => active && setSurveys(Array.isArray(data) ? data : []))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  // Date range + user search apply to the entire report (summary, leaderboard,
  // and list). The date compared is the survey's own date (completed, else sent).
  const fromMs = useMemo(() => (from ? new Date(`${from}T00:00:00`).getTime() : -Infinity), [from]);
  const toMs = useMemo(() => (to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity), [to]);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return surveys.filter((s) => {
      const ms = new Date(s.completed_at || s.created_at).getTime();
      if (!Number.isNaN(ms) && (ms < fromMs || ms > toMs)) return false;
      if (q && !`${s.technician || ''} ${s.respondent_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [surveys, fromMs, toMs, query]);

  const hasFilters = !!(query.trim() || from || to);
  const clearFilters = () => { setQuery(''); setFrom(''); setTo(''); };

  const completed = useMemo(() => base.filter((s) => s.status === 'completed'), [base]);

  const summary = useMemo(() => {
    const total = base.length;
    const done = completed.length;
    const responseRate = total ? Math.round((done / total) * 100) : null;
    const avg = done
      ? Math.round((completed.reduce((acc, s) => acc + overallOf(s), 0) / done) * 10) / 10
      : null;
    return { total, done, responseRate, avg };
  }, [base, completed]);

  // Per-technician leaderboard from completed surveys.
  const leaderboard = useMemo(() => {
    const byTech = new Map();
    for (const s of completed) {
      const key = s.technician || '—';
      if (!byTech.has(key)) {
        byTech.set(key, { technician: key, count: 0, sum: 0, satisfaction: 0, timeliness: 0, professionalism: 0 });
      }
      const row = byTech.get(key);
      row.count += 1;
      row.sum += overallOf(s);
      row.satisfaction += Number(s.satisfaction);
      row.timeliness += Number(s.timeliness);
      row.professionalism += Number(s.professionalism);
    }
    return [...byTech.values()]
      .map((r) => ({
        technician: r.technician,
        count: r.count,
        average: r.sum / r.count,
        satisfaction: r.satisfaction / r.count,
        timeliness: r.timeliness / r.count,
        professionalism: r.professionalism / r.count
      }))
      .sort((a, b) => b.average - a.average || b.count - a.count);
  }, [completed]);

  const rows = useMemo(
    () => (filter === 'all' ? base : base.filter((s) => s.status === filter)),
    [base, filter]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Survey Reports</span>
        </nav>

        <section className="flex flex-col gap-1">
          <span className="eyebrow">Technician feedback</span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Survey Reports</h1>
          <p className="mt-1 text-slate-600">Post-resolution surveys and technician ratings across all work orders.</p>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        {/* Filters */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="block lg:col-span-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search user</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Technician or requester name…"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {loading ? '' : `${base.length} survey${base.length === 1 ? '' : 's'} match${base.length === 1 ? 'es' : ''}`}
            </p>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-xs font-semibold text-accent-700 hover:text-accent-900">
                Clear filters
              </button>
            )}
          </div>
        </section>

        {/* Summary */}
        <section className="grid gap-5 sm:grid-cols-3">
          <StatCard label="Surveys sent" value={loading ? '—' : summary.total} sub={`${summary.done} completed`} />
          <StatCard
            label="Response rate"
            value={loading ? '—' : summary.responseRate == null ? '—' : `${summary.responseRate}%`}
            sub={`${summary.done} of ${summary.total} responded`}
          />
          <StatCard
            label="Average rating"
            value={loading ? '—' : summary.avg == null ? '—' : summary.avg.toFixed(1)}
            sub={summary.avg == null ? 'No ratings yet' : 'out of 5'}
            stars={summary.avg}
          />
        </section>

        {/* Leaderboard */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">By technician</h2>
            <p className="text-xs text-slate-500 mt-0.5">Average rating from completed surveys.</p>
          </header>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : leaderboard.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No completed surveys yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-2">Technician</th>
                    <th className="px-3 py-2">Ratings</th>
                    <th className="px-3 py-2">Overall</th>
                    {ASPECTS.map((a) => (
                      <th key={a.key} className="px-3 py-2 hidden md:table-cell">{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboard.map((r) => (
                    <tr key={r.technician} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5 font-medium text-slate-800">{r.technician}</td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">{r.count}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Stars value={r.average} />
                          <span className="text-xs text-slate-500 tabular-nums">{r.average.toFixed(1)}</span>
                        </div>
                      </td>
                      {ASPECTS.map((a) => (
                        <td key={a.key} className="px-3 py-2.5 text-slate-600 tabular-nums hidden md:table-cell">{r[a.key].toFixed(1)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* All surveys */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">All surveys</h2>
              <p className="text-xs text-slate-500 mt-0.5">Every survey sent, newest first.</p>
            </div>
            <div className="flex items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filter === f.key ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </header>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No surveys to show.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((s) => {
                const overall = overallOf(s);
                return (
                  <li key={s.ticket_id} className="px-5 py-3.5 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/tickets/${s.ticket_id}`} className="font-mono text-xs text-accent-700 hover:text-accent-900">
                            {formatTicketId(s.ticket_id)}
                          </Link>
                          <span className="truncate text-slate-800">{s.ticket_title || '(untitled)'}</span>
                          <StatusPill status={s.status} />
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Technician: <span className="text-slate-700">{s.technician}</span>
                          {' · '}from <span className="text-slate-700">{s.respondent_name}</span>
                          {' · '}{formatDate(s.completed_at || s.created_at)}
                        </div>
                        {s.comment && (
                          <p className="mt-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-1.5 text-xs text-slate-700 whitespace-pre-wrap break-words">
                            “{s.comment}”
                          </p>
                        )}
                      </div>
                      <div className="flex-none sm:text-right">
                        {overall == null ? (
                          <span className="text-xs text-slate-400">Awaiting response</span>
                        ) : (
                          <div className="flex items-center gap-2 sm:justify-end">
                            <Stars value={overall} />
                            <span className="text-xs text-slate-500 tabular-nums">{overall.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, stars }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-brand-900 tabular-nums">{value}</div>
      {typeof stars === 'number' && <Stars value={stars} />}
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    completed: 'bg-accent-50 text-accent-700 ring-accent-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

// Five stars filled to the nearest fraction for the given 1–5 average.
function Stars({ value = 0 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-slate-200" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="h-4 w-4 text-amber-400" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Star({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
