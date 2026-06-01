import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { ChartBar, ChartDoughnut } from '../components/DashboardCharts.jsx';
import { api } from '../lib/auth.js';

const SLA_DAYS = { low: 7, normal: 3, high: 2, urgent: 1 };
const RESOLVED = new Set(['resolved', 'closed']);
const DAY = 86400000;

const STATUS_ORDER = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed'];
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', on_hold: 'On hold', pending: 'Pending', resolved: 'Resolved', closed: 'Closed' };
const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];
const REQ_ORDER = ['incident', 'service_request', 'question', 'change'];
const REQ_LABEL = { incident: 'Incident', service_request: 'Service request', question: 'Question', change: 'Change' };

const C = {
  brand: '#3f5b95', accent: '#22a23e', amber: '#f59e0b', rose: '#e11d48', slate: '#94a3b8', violet: '#7c3aed'
};
const PRIORITY_COLORS = { low: C.slate, normal: C.brand, high: C.amber, urgent: C.rose };
const REQ_COLORS = { incident: C.rose, service_request: C.brand, question: C.slate, change: C.accent };

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

function countBy(rows, order, field) {
  return order.map((k) => rows.filter((r) => r[field] === k).length);
}

function aggregate(rows, field, fallback) {
  const map = new Map();
  for (const r of rows) {
    const key = (r?.[field] && String(r[field]).trim()) || fallback;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Monthly buckets spanning the active range (or earliest row -> now for "all
// time"), capped to the most recent 12 months.
function monthSeries(rows, fromMs, toMs) {
  const end = Number.isFinite(toMs) ? new Date(toMs) : new Date();
  let start;
  if (Number.isFinite(fromMs)) {
    start = new Date(fromMs);
  } else {
    const times = rows.map((r) => (r.created_at ? new Date(r.created_at).getTime() : NaN)).filter((n) => !Number.isNaN(n));
    start = times.length ? new Date(Math.min(...times)) : new Date(end.getFullYear(), end.getMonth() - 5, 1);
  }
  const months = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) && months.length < 24) {
    months.push({ y, m, key: `${y}-${m}`, count: 0 });
    if (++m > 11) { m = 0; y += 1; }
  }
  const capped = months.length > 12 ? months.slice(-12) : months;
  const multiYear = capped.length > 0 && capped[0].y !== capped[capped.length - 1].y;
  const index = new Map(capped.map((b) => [b.key, b]));
  for (const r of rows) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    const b = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.count += 1;
  }
  const fmt = (b) => {
    const label = new Date(b.y, b.m, 1).toLocaleDateString(undefined, { month: 'short' });
    return multiYear ? `${label} ${String(b.y).slice(2)}` : label;
  };
  return { labels: capped.map(fmt), values: capped.map((b) => b.count) };
}

// Approximate SLA: elapsed = created -> (resolved ? updated_at : now) vs the
// per-priority target. Unlike the per-ticket banner, this does NOT subtract
// paused (on-hold / pending) time, so it's a directional overview.
function slaInfo(t) {
  const days = SLA_DAYS[t.priority];
  if (!days || !t.created_at) return null;
  const opened = new Date(t.created_at).getTime();
  if (Number.isNaN(opened)) return null;
  const resolved = RESOLVED.has(t.status);
  const ref = resolved ? new Date(t.updated_at || t.created_at).getTime() : Date.now();
  const totalMs = days * DAY;
  const elapsed = Math.max(0, ref - opened);
  return { resolved, elapsed, totalMs, remaining: totalMs - elapsed, overdue: elapsed > totalMs, days };
}

export default function WorkOrderReports() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    api('/api/tickets')
      .then((list) => { setTickets(Array.isArray(list) ? list : []); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const applyPreset = (key) => {
    const r = presetRange(key);
    setPreset(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const fromMs = useMemo(() => (from ? new Date(`${from}T00:00:00`).getTime() : -Infinity), [from]);
  const toMs = useMemo(() => (to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity), [to]);

  const filtered = useMemo(() => tickets.filter((t) => {
    if (!t.created_at) return fromMs === -Infinity && toMs === Infinity;
    const c = new Date(t.created_at).getTime();
    return c >= fromMs && c <= toMs;
  }), [tickets, fromMs, toMs]);

  const incidents = useMemo(() => filtered.filter((t) => t.request_type === 'incident'), [filtered]);
  const active = useMemo(() => filtered.filter((t) => !RESOLVED.has(t.status)), [filtered]);
  const resolved = useMemo(() => filtered.filter((t) => RESOLVED.has(t.status)), [filtered]);

  const stats = useMemo(() => {
    const overdueOpen = active.filter((t) => slaInfo(t)?.overdue).length;
    const resolvedWithin = resolved.filter((t) => { const s = slaInfo(t); return s && !s.overdue; }).length;
    const withinPct = resolved.length ? Math.round((resolvedWithin / resolved.length) * 100) : null;
    return { total: filtered.length, open: active.length, incidents: incidents.length, overdueOpen, withinPct };
  }, [filtered, active, resolved, incidents]);

  const byStatus = useMemo(() => ({ labels: STATUS_ORDER.map((s) => STATUS_LABEL[s]), values: countBy(filtered, STATUS_ORDER, 'status') }), [filtered]);
  const byPriority = useMemo(() => ({ labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: countBy(filtered, PRIORITY_ORDER, 'priority'), colors: PRIORITY_ORDER.map((p) => PRIORITY_COLORS[p]) }), [filtered]);
  const byReqType = useMemo(() => ({ labels: REQ_ORDER.map((r) => REQ_LABEL[r]), values: countBy(filtered, REQ_ORDER, 'request_type'), colors: REQ_ORDER.map((r) => REQ_COLORS[r]) }), [filtered]);
  const byDept = useMemo(() => { const d = aggregate(filtered, 'department', 'Unassigned').slice(0, 8); return { labels: d.map((x) => x.label), values: d.map((x) => x.value) }; }, [filtered]);
  const openByAssignee = useMemo(() => { const d = aggregate(active, 'assignee', 'Unassigned').slice(0, 8); return { labels: d.map((x) => x.label), values: d.map((x) => x.value) }; }, [active]);
  const woByMonth = useMemo(() => monthSeries(filtered, fromMs, toMs), [filtered, fromMs, toMs]);

  const incByPriority = useMemo(() => ({ labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)), values: countBy(incidents, PRIORITY_ORDER, 'priority'), colors: PRIORITY_ORDER.map((p) => PRIORITY_COLORS[p]) }), [incidents]);
  const incByStatus = useMemo(() => ({ labels: STATUS_ORDER.map((s) => STATUS_LABEL[s]), values: countBy(incidents, STATUS_ORDER, 'status') }), [incidents]);
  const incByMonth = useMemo(() => monthSeries(incidents, fromMs, toMs), [incidents, fromMs, toMs]);

  const slaCompliance = useMemo(() => {
    const within = resolved.filter((t) => { const s = slaInfo(t); return s && !s.overdue; }).length;
    const breached = resolved.filter((t) => slaInfo(t)?.overdue).length;
    return { labels: ['Within SLA', 'Breached'], values: [within, breached], colors: [C.accent, C.rose] };
  }, [resolved]);

  const openSlaHealth = useMemo(() => {
    let onTrack = 0, dueSoon = 0, overdue = 0;
    for (const t of active) {
      const s = slaInfo(t);
      if (!s) continue;
      if (s.overdue) overdue += 1;
      else if (s.remaining < s.totalMs * 0.25) dueSoon += 1;
      else onTrack += 1;
    }
    return { labels: ['On track', 'Due soon', 'Overdue'], values: [onTrack, dueSoon, overdue] };
  }, [active]);

  const breachesByPriority = useMemo(() => ({
    labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)),
    values: PRIORITY_ORDER.map((p) => filtered.filter((t) => t.priority === p && slaInfo(t)?.overdue).length)
  }), [filtered]);

  const avgResolutionByPriority = useMemo(() => ({
    labels: PRIORITY_ORDER.map((p) => p[0].toUpperCase() + p.slice(1)),
    values: PRIORITY_ORDER.map((p) => {
      const items = resolved.filter((t) => t.priority === p && t.created_at && t.updated_at);
      if (!items.length) return 0;
      const sum = items.reduce((acc, t) => acc + Math.max(0, new Date(t.updated_at) - new Date(t.created_at)), 0);
      return Math.round((sum / items.length / DAY) * 10) / 10;
    })
  }), [resolved]);

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
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {tickets.length} work orders
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
