import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import BulkTicketActionBar from '../components/BulkTicketActionBar.jsx';
import { api, getUser } from '../lib/auth.js';
import { formatTicketId, truncateWords } from '../lib/ticket.js';

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' }
];

const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'priority', label: 'Priority' }
];

const PAGE_SIZE = 10;
const ACTIVE_STATUSES = new Set(['open', 'in_progress', 'on_hold', 'pending']);
const ZERO_COUNTS = { open: 0, in_progress: 0, on_hold: 0, pending: 0, resolved: 0, closed: 0, cancelled: 0 };

export default function MyQueue() {
  const user = getUser();
  const me = user?.name || '';

  // One server page of the work orders assigned to me (see loadTickets).
  const [pageRows, setPageRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(ZERO_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set());
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [showResolvedClosed, setShowResolvedClosed] = useState(false);

  useEffect(() => {
    api('/api/users/assignable').then(setAssignableUsers).catch(() => {});
  }, []);

  // One server page (GET /api/tickets?scope=assigned&page=…): filtering, sorting and paging
  // run in the API. A request counter drops responses superseded by a newer change.
  const reqId = useRef(0);
  const loadTickets = () => {
    const id = ++reqId.current;
    const params = new URLSearchParams({ scope: 'assigned', page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (query) params.set('q', query);
    if (statusFilter.size) params.set('status', [...statusFilter].join(','));
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (!showResolvedClosed) params.set('active', '1');
    setLoading(true);
    return api(`/api/tickets?${params.toString()}`)
      .then((res) => {
        if (id !== reqId.current) return;
        setPageRows(Array.isArray(res?.items) ? res.items : []);
        setTotal(res?.total || 0);
        setCounts({ ...ZERO_COUNTS, ...(res?.counts || {}) });
        setError('');
      })
      .catch((e) => { if (id === reqId.current) setError(e.message); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  };

  useEffect(() => {
    loadTickets();
  }, [query, statusFilter, priorityFilter, sort, showResolvedClosed, page]);

  const scopeTotal = Object.values(counts).reduce((n, c) => n + Number(c || 0), 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;

  // Any filter/sort change returns to page 1; the page effect above then refetches.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [query, statusFilter, priorityFilter, sort, showResolvedClosed]);

  // If the last page empties (e.g. rows were bulk-updated away), step back.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = pageRows.map((t) => t.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleStatus = (key) => {
    const next = new Set(statusFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatusFilter(next);
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter(new Set());
    setPriorityFilter('all');
    setSort('newest');
  };

  const activeCount = counts.open + counts.in_progress + counts.on_hold + counts.pending;
  const hasActiveFilters = query || statusFilter.size > 0 || priorityFilter !== 'all';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Work Orders</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">My Queue</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Work Orders</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">My Queue</h1>
            <p className="mt-1 text-slate-600">
              {loading
                ? 'Loading your work orders…'
                : me
                  ? `${activeCount} active ${activeCount === 1 ? 'work order' : 'work orders'} assigned to you${scopeTotal !== activeCount ? ` · ${scopeTotal} total` : ''}`
                  : 'Sign in to see work orders assigned to you.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tickets/all" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
              All Work Orders
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

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <BulkTicketActionBar
          selectedIds={selected}
          onClear={() => setSelected(new Set())}
          onApplied={loadTickets}
          statuses={STATUSES}
          priorities={PRIORITIES}
          assignableUsers={assignableUsers}
        />

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
                placeholder="Search by ID, title, requester, or description…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} label="Priority">
                <option value="all">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value)} label="Sort">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
              <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={showResolvedClosed}
                  onChange={(e) => setShowResolvedClosed(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                />
                Show resolved, closed & cancelled
              </label>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-ghost !px-3 !py-2 text-xs">Clear</button>
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
              <button onClick={() => setStatusFilter(new Set())} className="ml-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                Reset
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                      onChange={toggleSelectAllOnPage}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                      aria-label="Select all on this page"
                    />
                  </Th>
                  <Th className="w-24">ID</Th>
                  <Th>Title</Th>
                  <Th className="w-32">Requester</Th>
                  <Th className="w-28">Priority</Th>
                  <Th className="w-32">Status</Th>
                  <Th className="w-32 text-right">Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">Loading your work orders…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {scopeTotal === 0
                          ? 'Nothing in your queue'
                          : 'No work orders match your filters'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {scopeTotal === 0
                          ? `No work orders are currently assigned to ${me || 'you'}.`
                          : 'Try clearing filters or broadening your search.'}
                      </p>
                      <div className="mt-4">
                        {scopeTotal === 0 ? (
                          <Link to="/tickets/all" className="btn-secondary !px-3.5 !py-2 text-xs">Browse all work orders</Link>
                        ) : (
                          <button onClick={clearFilters} className="btn-secondary !px-3.5 !py-2 text-xs">Clear filters</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={t.id} className={`hover:bg-slate-50/60 ${ACTIVE_STATUSES.has(t.status) ? '' : 'opacity-70'}`}>
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleSelected(t.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                          aria-label={`Select ${t.title}`}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <Link to={`/tickets/${t.id}`} className="font-mono text-xs text-accent-700 hover:text-accent-800">
                          {formatTicketId(t.id)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 max-w-md">
                        <Link to={`/tickets/${t.id}`} className="block">
                          <span className="font-medium text-slate-800 line-clamp-1">{t.title}</span>
                          {t.description && (
                            <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">{truncateWords(t.description)}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{t.requester}</td>
                      <td className="px-5 py-3"><PriorityPill priority={t.priority} /></td>
                      <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500">{relativeTime(t.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
              <span className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-700">{pageStart + 1}</span>–
                <span className="font-semibold text-slate-700">{Math.min(pageStart + PAGE_SIZE, total)}</span>{' '}
                of <span className="font-semibold text-slate-700">{total}</span>
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

function StatusPill({ status }) {
  const map = {
    open: 'bg-amber-50 text-amber-700 ring-amber-200',
    in_progress: 'bg-brand-50 text-brand-800 ring-brand-200',
    on_hold: 'bg-slate-100 text-slate-700 ring-slate-200',
    pending: 'bg-violet-50 text-violet-700 ring-violet-200',
    resolved: 'bg-accent-50 text-accent-700 ring-accent-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200',
    cancelled: 'bg-rose-50 text-rose-700 ring-rose-200'
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
