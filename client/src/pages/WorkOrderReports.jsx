import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { ChartBar, ChartDoughnut } from '../components/DashboardCharts.jsx';
import { api } from '../lib/auth.js';
import { useTaxonomy, requestTypeLabel } from '../lib/categories.js';

const STATUS_ORDER = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed', 'cancelled'];
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', on_hold: 'On hold', pending: 'Pending', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled' };
const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];
// Request types are admin-editable (useTaxonomy); these seeded ones keep their
// familiar colours, anything added later cycles through REQ_EXTRA_COLORS.

const C = {
  brand: '#3f5b95', accent: '#22a23e', amber: '#f59e0b', rose: '#e11d48', slate: '#94a3b8', violet: '#7c3aed'
};
const PRIORITY_COLORS = { low: C.slate, normal: C.brand, high: C.amber, urgent: C.rose };
const REQ_COLORS = { incident: C.rose, service_request: C.brand, question: C.slate, change: C.accent };
const REQ_EXTRA_COLORS = [C.violet, C.amber, '#0891b2', '#db2777', '#65a30d', '#ea580c'];

const PRESETS = [
  { key: 'all', label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' }
];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetRange(key) {
  const now = new Date();
  if (key === 'all') return { from: '', to: '' };
  if (key === 'ytd') return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
  const days = key === '7d' ? 6 : key === '30d' ? 29 : 89;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: ymd(start), to: ymd(now) };
}

const zero = (obj, order) => order.map((k) => Number(obj?.[k] || 0));
const toSeries = (rows) => ({ labels: rows.map((r) => r.label), values: rows.map((r) => r.value) });

// Server month buckets ({ y, m (0-based), count }) -> chart labels; the year is
// shown only when the range spans more than one.
function monthSeries(buckets) {
  const list = Array.isArray(buckets) ? buckets : [];
  const multiYear = list.length > 0 && list[0].y !== list[list.length - 1].y;
  const label = (b) => {
    const mon = new Date(b.y, b.m, 1).toLocaleDateString(undefined, { month: 'short' });
    return multiYear ? `${mon} ${String(b.y).slice(2)}` : mon;
  };
  return { labels: list.map(label), values: list.map((b) => b.count) };
}


export default function WorkOrderReports() {
  const { requestTypes } = useTaxonomy();
  // Aggregates computed by the API (GET /api/tickets/reports) — the queue itself is never shipped here.
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // A request counter drops responses superseded by a newer date-range change.
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    const params = new URLSearchParams({ tz_offset: String(new Date().getTimezoneOffset()) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setLoading(true);
    api(`/api/tickets/reports?${params.toString()}`)
      .then((r) => { if (id === reqId.current) { setReport(r); setError(''); } })
      .catch((e) => { if (id === reqId.current) setError(e.message); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [from, to]);

  const applyPreset = (key) => {
    const r = presetRange(key);
    setPreset(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const r = useMemo(() => report || {}, [report]);
  const rs = r.stats || {};
  const stats = { total: rs.total || 0, open: rs.open || 0, incidents: rs.incidents || 0, overdueOpen: rs.overdue_open || 0, withinPct: rs.within_pct ?? null };

  const byStatus = useMemo(() => ({ labels: STATUS_ORDER.map((s) => STATUS_LABEL[s]), values: zero(r.by_status, STATUS_ORDER) }), [r]);
  const byPriority = useMemo(() => ({ labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: zero(r.by_priority, PRIORITY_ORDER), colors: PRIORITY_ORDER.map((p) => PRIORITY_COLORS[p]) }), [r]);
  const byReqType = useMemo(() => {
    // Configured order first, then any type still on old work orders but since hidden/deleted.
    const counts = r.by_request_type || {};
    const order = requestTypes.map((t) => t.key);
    for (const k of Object.keys(counts)) if (!order.includes(k)) order.push(k);
    let extra = 0;
    return {
      labels: order.map((k) => requestTypeLabel(requestTypes, k)),
      values: order.map((k) => Number(counts[k] || 0)),
      colors: order.map((k) => REQ_COLORS[k] || REQ_EXTRA_COLORS[extra++ % REQ_EXTRA_COLORS.length])
    };
  }, [r, requestTypes]);
  const byDept = useMemo(() => toSeries(r.by_department || []), [r]);
  const openByAssignee = useMemo(() => toSeries(r.open_by_assignee || []), [r]);
  const woByMonth = useMemo(() => monthSeries(r.volume_by_month), [r]);

  const incByPriority = useMemo(() => ({ labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: zero(r.incidents_by_priority, PRIORITY_ORDER), colors: PRIORITY_ORDER.map((p) => PRIORITY_COLORS[p]) }), [r]);
  const incByStatus = useMemo(() => ({ labels: STATUS_ORDER.map((s) => STATUS_LABEL[s]), values: zero(r.incidents_by_status, STATUS_ORDER) }), [r]);
  const incByMonth = useMemo(() => monthSeries(r.incidents_by_month), [r]);

  const slaCompliance = { labels: ['Within SLA', 'Breached'], values: [r.sla_compliance?.within || 0, r.sla_compliance?.breached || 0], colors: [C.accent, C.rose] };
  const openSlaHealth = { labels: ['On track', 'Due soon', 'Overdue'], values: [r.open_sla_health?.on_track || 0, r.open_sla_health?.due_soon || 0, r.open_sla_health?.overdue || 0] };
  const breachesByPriority = { labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: zero(r.breaches_by_priority, PRIORITY_ORDER) };
  const avgResolutionByPriority = { labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: zero(r.avg_resolution_days, PRIORITY_ORDER) };

  const rangeLabel = from || to
    ? `${from || '…'} → ${to || 'today'}`
    : 'All time';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Work Orders</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Reports</span>
        </nav>

        <section>
          <span className="eyebrow">Work Orders</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Work Order Reports</h1>
          <p className="mt-1 text-slate-600">Volume, incidents, and SLA performance across the queue.</p>
        </section>

        {/* Date-range filter (by work order creation date) */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                    preset === p.key
                      ? 'bg-accent-50 text-accent-700 ring-accent-200'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">From</span>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => { setTo(e.target.value); setPreset('custom'); }}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </label>
              {(from || to) && (
                <button onClick={() => applyPreset('all')} className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading reports…</div>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{stats.total}</span> of {r.scope_total ?? 0} work orders
              {' · '}<span className="font-medium">{rangeLabel}</span>
            </p>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Total work orders" value={stats.total} />
              <Stat label="Open" value={stats.open} tone="amber" />
              <Stat label="Incidents" value={stats.incidents} tone="rose" />
              <Stat label="Overdue (open)" value={stats.overdueOpen} tone="rose" />
              <Stat label="Resolved within SLA" value={stats.withinPct == null ? '—' : `${stats.withinPct}%`} tone="accent" />
            </section>

            <SectionTitle>Work orders</SectionTitle>
            <section className="grid gap-5 lg:grid-cols-3">
              <ChartCard title="By status" subtitle="Current pipeline">
                <ChartBar labels={byStatus.labels} values={byStatus.values} color={C.brand} emptyLabel="No work orders" />
              </ChartCard>
              <ChartCard title="By priority" subtitle="What needs attention first">
                <ChartDoughnut labels={byPriority.labels} values={byPriority.values} colors={byPriority.colors} emptyLabel="No work orders" />
              </ChartCard>
              <ChartCard title="By request type" subtitle="Incidents vs requests">
                <ChartDoughnut labels={byReqType.labels} values={byReqType.values} colors={byReqType.colors} emptyLabel="No work orders" />
              </ChartCard>
              <ChartCard title="By department" subtitle="Where work originates">
                <ChartBar labels={byDept.labels} values={byDept.values} color={C.brand} horizontal emptyLabel="No departments" />
              </ChartCard>
              <ChartCard title="Open by assignee" subtitle="Current workload balance">
                <ChartBar labels={openByAssignee.labels} values={openByAssignee.values} color={C.accent} horizontal emptyLabel="No open work orders" />
              </ChartCard>
              <ChartCard title="Volume by month" subtitle="Created over the selected range">
                <ChartBar labels={woByMonth.labels} values={woByMonth.values} color={C.brand} emptyLabel="No work orders" />
              </ChartCard>
            </section>

            <SectionTitle>Incidents</SectionTitle>
            <section className="grid gap-5 lg:grid-cols-3">
              <ChartCard title="Incidents by priority" subtitle="Severity mix">
                <ChartDoughnut labels={incByPriority.labels} values={incByPriority.values} colors={incByPriority.colors} emptyLabel="No incidents" />
              </ChartCard>
              <ChartCard title="Incidents by status" subtitle="Where incidents stand">
                <ChartBar labels={incByStatus.labels} values={incByStatus.values} color={C.rose} emptyLabel="No incidents" />
              </ChartCard>
              <ChartCard title="Incidents by month" subtitle="Reported over the selected range">
                <ChartBar labels={incByMonth.labels} values={incByMonth.values} color={C.rose} emptyLabel="No incidents" />
              </ChartCard>
            </section>

            <SectionTitle>SLA</SectionTitle>
            <p className="-mt-3 text-xs text-slate-500">
              Targets: Urgent 1d · High 2d · Normal 3d · Low 7d. Approximate (excludes paused time) — the per-work-order banner is exact.
            </p>
            <section className="grid gap-5 lg:grid-cols-3">
              <ChartCard title="Resolved: SLA compliance" subtitle="Resolved/closed within target">
                <ChartDoughnut labels={slaCompliance.labels} values={slaCompliance.values} colors={slaCompliance.colors} emptyLabel="Nothing resolved yet" />
              </ChartCard>
              <ChartCard title="Open work orders: SLA health" subtitle="On track / due soon / overdue">
                <ChartBar labels={openSlaHealth.labels} values={openSlaHealth.values} color={C.amber} emptyLabel="No open work orders" />
              </ChartCard>
              <ChartCard title="Breaches by priority" subtitle="Where targets are missed">
                <ChartBar labels={breachesByPriority.labels} values={breachesByPriority.values} color={C.rose} emptyLabel="No breaches" />
              </ChartCard>
              <ChartCard title="Avg resolution time" subtitle="Days from open to resolved, by priority">
                <ChartBar labels={avgResolutionByPriority.labels} values={avgResolutionByPriority.values} color={C.brand} emptyLabel="Nothing resolved yet" />
              </ChartCard>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 pt-2">{children}</h2>;
}

function Stat({ label, value, tone = 'brand' }) {
  const tones = { brand: 'text-brand-800', accent: 'text-accent-700', amber: 'text-amber-700', rose: 'text-rose-700', slate: 'text-slate-600' };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-card">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
