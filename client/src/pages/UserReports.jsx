import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { ChartBar, ChartDoughnut } from '../components/DashboardCharts.jsx';
import { api } from '../lib/auth.js';

const C = {
  admin: '#f59e0b',
  agent: '#3f5b95',
  user: '#22a23e',
  active: '#22a23e',
  inactive: '#94a3b8',
  brand: '#3f5b95',
  accent: '#22a23e',
  amber: '#f59e0b',
  slate: '#94a3b8'
};

const DAY = 86400000;

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

function aggregate(rows, field, fallback) {
  const map = new Map();
  for (const r of rows) {
    const raw = r?.[field];
    const key = (raw && String(raw).trim()) || fallback;
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

export default function UserReports() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    api('/api/users')
      .then((list) => { setUsers(Array.isArray(list) ? list : []); setError(''); })
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

  const filtered = useMemo(() => users.filter((u) => {
    if (!u.created_at) return fromMs === -Infinity && toMs === Infinity;
    const c = new Date(u.created_at).getTime();
    return c >= fromMs && c <= toMs;
  }), [users, fromMs, toMs]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter((u) => u.is_active).length;
    const neverLoggedIn = filtered.filter((u) => !u.last_login_at).length;
    const customPerms = filtered.filter((u) => u.permissions && Object.keys(u.permissions).length > 0).length;
    return { total, active, inactive: total - active, neverLoggedIn, customPerms };
  }, [filtered]);

  const byRole = useMemo(() => {
    const order = ['admin', 'agent', 'user'];
    return {
      labels: order.map((r) => r[0].toUpperCase() + r.slice(1)),
      values: order.map((r) => filtered.filter((u) => u.role === r).length),
      colors: order.map((r) => C[r])
    };
  }, [filtered]);

  const byStatus = useMemo(() => ({
    labels: ['Active', 'Inactive'],
    values: [stats.active, stats.inactive],
    colors: [C.active, C.inactive]
  }), [stats]);

  const byDepartment = useMemo(() => {
    const data = aggregate(filtered, 'department', 'Unassigned').slice(0, 8);
    return { labels: data.map((d) => d.label), values: data.map((d) => d.value) };
  }, [filtered]);

  const loginActivity = useMemo(() => {
    const now = Date.now();
    const buckets = { 'Last 7 days': 0, '8–30 days': 0, '31–90 days': 0, '90+ days': 0, Never: 0 };
    for (const u of filtered) {
      if (!u.last_login_at) { buckets.Never += 1; continue; }
      const days = (now - new Date(u.last_login_at).getTime()) / DAY;
      if (days <= 7) buckets['Last 7 days'] += 1;
      else if (days <= 30) buckets['8–30 days'] += 1;
      else if (days <= 90) buckets['31–90 days'] += 1;
      else buckets['90+ days'] += 1;
    }
    return { labels: Object.keys(buckets), values: Object.values(buckets) };
  }, [filtered]);

  const newAccounts = useMemo(() => monthSeries(filtered, fromMs, toMs), [filtered, fromMs, toMs]);

  const accessConfig = useMemo(() => ({
    labels: ['Role default', 'Custom override'],
    values: [stats.total - stats.customPerms, stats.customPerms],
    colors: [C.brand, C.amber]
  }), [stats]);

  const rangeLabel = from || to ? `${from || '…'} → ${to || 'today'}` : 'All time';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Reports</span>
        </nav>

        <section>
          <span className="eyebrow">Administration</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">User Reports</h1>
          <p className="mt-1 text-slate-600">Account monitoring across roles, status, departments, and activity.</p>
        </section>

        {/* Date-range filter (by account creation date) */}
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
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {users.length} users
              {' · '}<span className="font-medium">{rangeLabel}</span>
            </p>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Total users" value={stats.total} />
              <Stat label="Active" value={stats.active} tone="accent" />
              <Stat label="Inactive" value={stats.inactive} tone="slate" />
              <Stat label="Never logged in" value={stats.neverLoggedIn} tone="amber" />
              <Stat label="Custom access" value={stats.customPerms} tone="brand" />
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <ChartCard title="By role" subtitle="Account types in the directory">
                <ChartDoughnut labels={byRole.labels} values={byRole.values} colors={byRole.colors} emptyLabel="No users" />
              </ChartCard>
              <ChartCard title="Account status" subtitle="Active vs deactivated">
                <ChartDoughnut labels={byStatus.labels} values={byStatus.values} colors={byStatus.colors} emptyLabel="No users" />
              </ChartCard>
              <ChartCard title="Access configuration" subtitle="Role default vs per-user override">
                <ChartDoughnut labels={accessConfig.labels} values={accessConfig.values} colors={accessConfig.colors} emptyLabel="No users" />
              </ChartCard>
              <ChartCard title="By department" subtitle="Where accounts are assigned">
                <ChartBar labels={byDepartment.labels} values={byDepartment.values} color={C.brand} horizontal emptyLabel="No departments" />
              </ChartCard>
              <ChartCard title="Login activity" subtitle="Recency of last sign-in (stale-account watch)">
                <ChartBar labels={loginActivity.labels} values={loginActivity.values} color={C.accent} emptyLabel="No activity" />
              </ChartCard>
              <ChartCard title="New accounts" subtitle="Created over the selected range">
                <ChartBar labels={newAccounts.labels} values={newAccounts.values} color={C.amber} emptyLabel="No accounts" />
              </ChartCard>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone = 'brand' }) {
  const tones = {
    brand: 'text-brand-800',
    accent: 'text-accent-700',
    amber: 'text-amber-700',
    slate: 'text-slate-600'
  };
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
