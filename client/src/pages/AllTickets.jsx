import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';
import { formatTicketId, matchesTicketId, truncateWords } from '../lib/ticket.js';

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' }
];

const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'priority', label: 'Priority' }
];

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const PAGE_SIZE = 7;

export default function AllTickets() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'agent';
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(location.state?.banner || null);
  const [capped, setCapped] = useState(false); // server truncated the queue (see X-Result-Capped)

  // "New since you last looked": the timestamp of the previous visit is kept
  // per-user in localStorage. Any work order created after it is flagged New.
  // Captured once on mount (lazy init) so the badges stay put for this view;
  // the stored mark is then bumped to now (below) once the list has loaded.
  const seenKey = `mf_tickets_seen:${user?.id ?? 'anon'}`;
  const [seenThreshold] = useState(() => {
    const v = Number(localStorage.getItem(seenKey));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  });
  const isNew = (t) => {
    const c = new Date(t.created_at).getTime();
    return Number.isFinite(c) && c > seenThreshold;
  };

  useEffect(() => {
    if (location.state?.banner) {
      navigate(location.pathname, { replace: true, state: {} });
      const t = setTimeout(() => setBanner(null), 6000);
      return () => clearTimeout(t);
    }
  }, []);

  const [query, setQuery] = useState('');             // committed search term (applied on submit)
  const [searchInput, setSearchInput] = useState(''); // current text in the search box
  const [statusFilter, setStatusFilter] = useState(new Set()); // empty = all
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    // scope=all returns every work order (not just the caller's own/department)
    // so any user can browse and search the full queue here. withMeta surfaces
    // the server's cap signal so we can warn the user instead of silently
    // filtering/searching a truncated set.
    api('/api/tickets?scope=all', { withMeta: true })
      .then(({ data, capped }) => {
        setTickets(Array.isArray(data) ? data : []);
        setCapped(capped);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Once the list has loaded and the user has seen it, advance the "last viewed"
  // mark so these same work orders aren't flagged New on the next visit.
  useEffect(() => {
    if (!loading) localStorage.setItem(seenKey, String(Date.now()));
  }, [loading]);

  const newCount = useMemo(() => tickets.filter(isNew).length, [tickets, seenThreshold]);

  const assignees = useMemo(() => {
    const set = new Set();
    tickets.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set).sort();
  }, [tickets]);

  const categories = useMemo(() => {
    const set = new Set();
    tickets.forEach((t) => t.category && set.add(t.category));
    return Array.from(set).sort();
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = tickets.filter((t) => {
      if (statusFilter.size && !statusFilter.has(t.status)) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (overdueOnly && !(t.sla?.overdue && !t.sla?.resolved)) return false;
      if (assigneeFilter === 'unassigned' && t.assignee) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && t.assignee !== assigneeFilter) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || matchesTicketId(t.id, q);
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'updated':
          return new Date(b.updated_at) - new Date(a.updated_at);
        case 'priority':
          return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        case 'newest':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return rows;
  }, [tickets, query, statusFilter, priorityFilter, assigneeFilter, categoryFilter, overdueOnly, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, priorityFilter, assigneeFilter, categoryFilter, overdueOnly, sort]);

  const toggleStatus = (key) => {
    const next = new Set(statusFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatusFilter(next);
  };

  const clearFilters = () => {
    setQuery('');
    setSearchInput('');
    setStatusFilter(new Set());
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setCategoryFilter('all');
    setOverdueOnly(false);
    setSort('newest');
  };

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, on_hold: 0, pending: 0, resolved: 0, closed: 0 };
    tickets.forEach((t) => { if (c[t.status] != null) c[t.status]++; });
    return c;
  }, [tickets]);

  const hasActiveFilters =
    query || statusFilter.size > 0 || priorityFilter !== 'all' || assigneeFilter !== 'all' ||
    categoryFilter !== 'all' || overdueOnly;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Work Orders</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">{isStaff ? 'All Work Orders' : 'Browse Work Orders'}</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Work Orders</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">
              {isStaff ? 'All Work Orders' : 'Browse Work Orders'}
            </h1>
            <p className="mt-1 text-slate-600">
              {loading
                ? 'Loading work orders…'
                : `${filtered.length} of ${tickets.length} ${tickets.length === 1 ? 'work order' : 'work orders'} shown`}
              {!loading && newCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white align-middle">
                  {newCount} new
                </span>
              )}
              {!isStaff && !loading && (
                <span className="block text-xs text-slate-500 mt-0.5">
                  Every work order across the organization — view-only unless it's yours or your department's.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tickets/create-incident" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              Report Incident
            </Link>
            <Link to="/tickets/create" className="btn-primary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Work Order
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Open" value={counts.open} tone="amber" active={statusFilter.has('open')} onClick={() => toggleStatus('open')} />
          <SummaryTile label="In Progress" value={counts.in_progress} tone="brand" active={statusFilter.has('in_progress')} onClick={() => toggleStatus('in_progress')} />
          <SummaryTile label="On Hold" value={counts.on_hold} tone="slate" active={statusFilter.has('on_hold')} onClick={() => toggleStatus('on_hold')} />
          <SummaryTile label="Pending" value={counts.pending} tone="violet" active={statusFilter.has('pending')} onClick={() => toggleStatus('pending')} />
          <SummaryTile label="Resolved" value={counts.resolved} tone="accent" active={statusFilter.has('resolved')} onClick={() => toggleStatus('resolved')} />
          <SummaryTile label="Closed" value={counts.closed} tone="slate" active={statusFilter.has('closed')} onClick={() => toggleStatus('closed')} />
        </section>

        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">
              Dismiss
            </button>
          </div>
        )}

        {capped && !loading && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <span className="flex-1">
              Showing the most recent {tickets.length.toLocaleString()} work orders — the full queue is larger.
              Use search or filters to find older ones.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(searchInput.trim());
              }}
              className="flex flex-1 gap-2"
            >
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by title or ID — try WO%22 for #22"
                  className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <button type="submit" className="btn-primary !px-4 !py-2 text-xs whitespace-nowrap">
                Search
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                label="Priority"
              >
                <option value="all">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p[0].toUpperCase() + p.slice(1)}</option>
                ))}
              </Select>
              <Select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                label="Assignee"
              >
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                label="Category"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value)} label="Sort">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-ghost !px-3 !py-2 text-xs">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="border-b border-slate-100 px-4 py-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Status:</span>
            {STATUSES.map((s) => {
              const active = statusFilter.has(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => toggleStatus(s.key)}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors ${
                    active
                      ? 'bg-brand-900 text-white ring-brand-900'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {statusFilter.size > 0 && (
              <button
                onClick={() => setStatusFilter(new Set())}
                className="ml-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
              >
                Reset
              </button>
            )}
            <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
            <button
              onClick={() => setOverdueOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors ${
                overdueOnly
                  ? 'bg-rose-600 text-white ring-rose-600'
                  : 'bg-white text-rose-700 ring-rose-200 hover:bg-rose-50'
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Overdue
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th className="w-24">ID</Th>
                  <Th>Title</Th>
                  <Th className="w-32">Requester</Th>
                  <Th className="w-32">Assignee</Th>
                  <Th className="w-28">Priority</Th>
                  <Th className="w-32">Status</Th>
                  <Th className="w-28">SLA</Th>
                  <Th className="w-32 text-right">Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">Loading work orders…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {tickets.length === 0 ? 'No work orders yet' : 'No work orders match your filters'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tickets.length === 0
                          ? 'Open the first work order to get started.'
                          : 'Try clearing filters or broadening your search.'}
                      </p>
                      <div className="mt-4">
                        {tickets.length === 0 ? (
                          <Link to="/tickets/create" className="btn-primary !px-3.5 !py-2 text-xs">Create work order</Link>
                        ) : (
                          <button onClick={clearFilters} className="btn-secondary !px-3.5 !py-2 text-xs">Clear filters</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={t.id} className={isNew(t) ? 'bg-accent-50/50 hover:bg-accent-50' : 'hover:bg-slate-50/60'}>
                      <td className={`px-5 py-3 ${isNew(t) ? 'border-l-2 border-accent-500' : ''}`}>
                        <Link to={`/tickets/${t.id}`} className="font-mono text-xs text-accent-700 hover:text-accent-800">
                          {formatTicketId(t.id)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 max-w-md">
                        <Link to={`/tickets/${t.id}`} className="block">
                          <span className="flex items-center gap-2">
                            {isNew(t) && (
                              <span className="inline-flex flex-none items-center rounded-full bg-accent-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                New
                              </span>
                            )}
                            <span className="font-medium text-slate-800 line-clamp-1">{t.title}</span>
                          </span>
                          {t.description && (
                            <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">{truncateWords(t.description)}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{t.requester}</td>
                      <td className="px-5 py-3">
                        {t.assignee ? (
                          <span className="text-slate-700">{t.assignee}</span>
                        ) : (
                          <span className="text-xs italic text-slate-400">unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3"><PriorityPill priority={t.priority} /></td>
                      <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                      <td className="px-5 py-3"><SlaPill sla={t.sla} /></td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500">{relativeTime(t.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
              <span className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-700">{pageStart + 1}</span>–
                <span className="font-semibold text-slate-700">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span>{' '}
                of <span className="font-semibold text-slate-700">{filtered.length}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs text-slate-500 px-2">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function SummaryTile({ label, value, tone, active, onClick }) {
  const tones = {
    amber: 'text-amber-700 ring-amber-200 bg-amber-50',
    brand: 'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    violet: 'text-violet-700 ring-violet-200 bg-violet-50',
    slate: 'text-slate-700 ring-slate-200 bg-slate-50'
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition-all shadow-card ${
        active
          ? 'border-brand-900 ring-2 ring-brand-900/10 bg-white'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-elevated'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ring-1 ring-inset ${tones[tone]}`}>
          {value}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </button>
  );
}

function Select({ value, onChange, label, children }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {children}
      </select>
    </label>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}

function PriorityPill({ priority }) {
  const map = {
    low: 'text-slate-600 bg-slate-100 ring-slate-200',
    normal: 'text-slate-700 bg-slate-50 ring-slate-200',
    high: 'text-amber-700 bg-amber-50 ring-amber-200',
    urgent: 'text-rose-700 bg-rose-50 ring-rose-200'
  };
  if (!priority) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[priority] || map.normal}`}>
      {priority}
    </span>
  );
}

// Compact, human duration from a millisecond span (used for SLA remaining/overdue).
function shortDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// SLA standing chip. `sla` is the server-computed object on each ticket
// ({ overdue, resolved, remaining, ... }) or null when the ticket has no target.
function SlaPill({ sla }) {
  if (!sla) return <span className="text-xs text-slate-300">—</span>;
  const { overdue, resolved, remaining } = sla;
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset';

  // Finished work: report whether it beat the clock, kept muted (not actionable).
  if (resolved) {
    return overdue
      ? <span className={`${base} bg-slate-50 text-slate-500 ring-slate-200`}>Breached</span>
      : <span className={`${base} bg-slate-50 text-slate-500 ring-slate-200`}>Met</span>;
  }
  if (overdue) {
    return <span className={`${base} bg-rose-50 text-rose-700 ring-rose-200`}>Overdue {shortDuration(Math.abs(remaining))}</span>;
  }
  if (remaining <= 86400000) { // due within a day
    return <span className={`${base} bg-amber-50 text-amber-700 ring-amber-200`}>Due in {shortDuration(remaining)}</span>;
  }
  return <span className="text-xs text-slate-500">{shortDuration(remaining)} left</span>;
}

function StatusPill({ status }) {
  const map = {
    open: 'bg-amber-50 text-amber-700 ring-amber-200',
    in_progress: 'bg-brand-50 text-brand-800 ring-brand-200',
    on_hold: 'bg-slate-100 text-slate-700 ring-slate-200',
    pending: 'bg-violet-50 text-violet-700 ring-violet-200',
    resolved: 'bg-accent-50 text-accent-700 ring-accent-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${map[status] || map.open}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function relativeTime(ts) {
  if (!ts) return '—';
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
