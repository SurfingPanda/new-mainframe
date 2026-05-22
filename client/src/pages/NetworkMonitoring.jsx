import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';

const RANGES = [
  { key: '1h',  label: '1 hour'  },
  { key: '24h', label: '24 hours' },
];

const HEALTH_META = {
  ok:      { label: 'Healthy',  ring: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',  dot: 'bg-accent-500' },
  warning: { label: 'Degraded', ring: 'bg-amber-50  text-amber-700  ring-amber-200  dark:bg-amber-500/15  dark:text-amber-300  dark:ring-amber-500/30',  dot: 'bg-amber-500'  },
  error:   { label: 'Down',     ring: 'bg-rose-50   text-rose-700   ring-rose-200   dark:bg-rose-500/10   dark:text-rose-300   dark:ring-rose-500/30',   dot: 'bg-rose-500'   },
  unknown: { label: 'Unknown',  ring: 'bg-slate-100 text-slate-600  ring-slate-200  dark:bg-slate-800     dark:text-slate-400  dark:ring-slate-700',     dot: 'bg-slate-400'  },
};

const SUBSYSTEM_LABELS = { wan: 'WAN', www: 'Internet', lan: 'LAN', wlan: 'Wi-Fi', vpn: 'VPN' };

const BAND_COLORS = {
  '2.4 GHz': '#f59e0b',
  '5 GHz':   '#10b981',
  '6 GHz':   '#6366f1',
  Wired:     '#0ea5e9',
};

export default function NetworkMonitoring() {
  const [range, setRange] = useState('1h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);
  const pollRef = useRef(null);

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const json = await api(`/api/network/dashboard?range=${range}`);
      setData(json);
      setError('');
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load network data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    pollRef.current = setInterval(() => load(false), 30_000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const overview   = data?.overview;
  const health     = data?.health || [];
  const timeseries = data?.timeseries || [];
  const devices    = data?.devices || [];
  const topClients = data?.topClients || [];
  const bandMix    = data?.bandMix || [];
  const wanLatency = data?.wanLatency || [];
  const events     = data?.events || [];

  const apDevices = useMemo(() => devices.filter((d) => d.type === 'AP'), [devices]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-6 sm:py-10 space-y-6 sm:space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700 dark:text-accent-400">Network Monitoring</span>
        </nav>

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Operations</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-brand-900 dark:text-slate-100">
              Network Monitoring
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Live UniFi telemetry across {overview?.siteName || 'the network'} — clients, throughput, AP health, and WAN performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 rounded-[5px] font-medium transition-colors ${
                    range === r.key
                      ? 'bg-accent-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
              </span>
              {refreshedAt ? `Last poll ${refreshedAt.toLocaleTimeString()}` : 'Loading…'}
            </div>
            <button type="button" onClick={() => load(true)} className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </section>

        {data?.source === 'mock' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <strong className="font-semibold">Showing UniFi-shaped sample data.</strong>{' '}
            {data?.warning
              ? data.warning
              : 'Set UNIFI_HOST, UNIFI_USERNAME, and UNIFI_PASSWORD in server/.env to pull live metrics from your controller.'}
          </div>
        )}
        {error && !data && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-4">
          <StatCard
            label="Total clients"
            value={overview?.clients?.total ?? '—'}
            sub={overview ? `${overview.clients.wireless} wireless · ${overview.clients.wired} wired` : 'Connected endpoints'}
            tone="brand"
            icon={iconUsers}
          />
          <StatCard
            label="UniFi devices"
            value={overview?.devices?.total ?? '—'}
            sub={overview ? `${overview.devices.online} online · ${overview.devices.total - overview.devices.online} offline` : 'APs, switches, gateways'}
            tone="accent"
            icon={iconDevices}
          />
          <StatCard
            label="WAN latency"
            value={overview ? `${overview.wan.latencyMs} ms` : '—'}
            sub={overview?.wan?.uplink ? `Uplink ${overview.wan.uplink}` : 'Gateway round-trip'}
            tone={overview && overview.wan.latencyMs >= 30 ? 'rose' : overview && overview.wan.latencyMs >= 15 ? 'amber' : 'brand'}
            icon={iconLatency}
          />
          <StatCard
            label="Throughput now"
            value={timeseries.length ? `${formatMbps(timeseries[timeseries.length - 1].rxMbps + timeseries[timeseries.length - 1].txMbps)}` : '—'}
            sub={timeseries.length ? `↓ ${formatMbps(timeseries[timeseries.length - 1].rxMbps)} ↑ ${formatMbps(timeseries[timeseries.length - 1].txMbps)}` : 'WAN RX + TX'}
            tone="brand"
            icon={iconThroughput}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Site health</h2>
            <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">UniFi subsystem status</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800">
            {(health.length ? health : Object.keys(SUBSYSTEM_LABELS).map((k) => ({ subsystem: k, status: 'unknown' }))).map((h) => {
              const meta = HEALTH_META[h.status] || HEALTH_META.unknown;
              return (
                <div key={h.subsystem} className="px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {SUBSYSTEM_LABELS[h.subsystem] || h.subsystem}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.ring}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {h.numSta != null ? `${h.numSta} clients` : '—'}
                    {h.latencyMs ? ` · ${h.latencyMs} ms` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Clients over time" sub={range === '24h' ? 'Last 24 hours' : 'Last hour'} loading={loading && !timeseries.length}>
            <LineChart
              data={timeseries.map((p) => ({ x: p.t, y: p.clients }))}
              color="#0ea5e9"
              fill="rgba(14,165,233,0.12)"
              area
              yLabel="clients"
              formatX={range === '24h' ? formatHour : formatTime}
              formatY={(v) => `${Math.round(v)}`}
            />
          </ChartCard>

          <ChartCard title="WAN throughput" sub="RX (download) + TX (upload)" loading={loading && !timeseries.length}>
            <DualAreaChart
              data={timeseries}
              formatX={range === '24h' ? formatHour : formatTime}
              formatY={(v) => formatMbps(v)}
            />
          </ChartCard>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title="Access points" sub="Clients & 5 GHz channel utilization per AP" loading={loading && !devices.length}>
            <ApBars devices={apDevices} />
          </ChartCard>

          <ChartCard title="Wi-Fi band mix" sub="Clients per band" loading={loading && !bandMix.length}>
            <DonutChart data={bandMix.map((b) => ({ ...b, color: BAND_COLORS[b.label] || '#94a3b8' }))} />
          </ChartCard>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <ChartCard title="WAN latency" sub="Gateway round-trip (ms)" loading={loading && !wanLatency.length}>
            <LineChart
              data={wanLatency.map((p) => ({ x: p.t, y: p.latencyMs }))}
              color="#f97316"
              fill="rgba(249,115,22,0.12)"
              area
              yLabel="ms"
              formatX={range === '24h' ? formatHour : formatTime}
              formatY={(v) => `${Math.round(v)} ms`}
            />
          </ChartCard>

          <ChartCard className="lg:col-span-2" title="Top clients" sub="By data transferred over the last 7 days" loading={loading && !topClients.length}>
            <TopClientsBars items={topClients} />
          </ChartCard>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Recent UniFi events</h2>
            <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Latest activity from the controller</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No recent events.</li>
            ) : (
              events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
                  <EventDot level={ev.level} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 dark:text-slate-300">{ev.text}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{formatRelative(ev.when)}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

// =========================================================================
// Stat card + icons
// =========================================================================

function StatCard({ label, value, sub, tone = 'brand', icon }) {
  const tones = {
    brand:  'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',
    accent: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',
    amber:  'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
    rose:   'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-inset ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-brand-900 tabular-nums dark:text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  );
}

const iconUsers = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const iconDevices = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
);

const iconLatency = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const iconThroughput = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 16l4-6 4 4 5-8" />
  </svg>
);

// =========================================================================
// Chart shell
// =========================================================================

function ChartCard({ title, sub, loading, className = '', children }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800 ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{sub}</p>}
      </div>
      <div className="p-5">
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Loading…</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function EventDot({ level }) {
  const map = { info: 'bg-brand-500', warn: 'bg-amber-500', error: 'bg-rose-500' };
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${map[level] || map.info}`} />;
}

// =========================================================================
// Charts (pure SVG, no deps)
// =========================================================================

function LineChart({ data, color = '#0ea5e9', fill, area = false, formatX, formatY }) {
  const w = 640;
  const h = 200;
  const pad = { top: 12, right: 12, bottom: 24, left: 38 };

  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-slate-400">No data</div>;
  }

  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.y);
  const yMax = Math.max(1, ...ys);
  const yMin = 0;
  const xScale = (i) => pad.left + (i / Math.max(1, xs.length - 1)) * (w - pad.left - pad.right);
  const yScale = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.top - pad.bottom);

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.y)}`).join(' ');
  const areaPath = area
    ? `${path} L ${xScale(data.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`
    : null;

  const yTicks = niceTicks(yMin, yMax, 4);
  const xTickIdx = pickXTicks(data.length, 5);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
      {/* Y gridlines + labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={w - pad.right} y1={yScale(t)} y2={yScale(t)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
          <text x={pad.left - 6} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>
            {formatY ? formatY(t) : t}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xTickIdx.map((i) => (
        <text key={i} x={xScale(i)} y={h - 6} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>
          {formatX ? formatX(data[i].x) : data[i].x}
        </text>
      ))}

      {areaPath && <path d={areaPath} fill={fill || `${color}22`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DualAreaChart({ data, formatX, formatY }) {
  const w = 640;
  const h = 220;
  const pad = { top: 12, right: 12, bottom: 32, left: 44 };

  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-slate-400">No data</div>;
  }

  const ys = data.flatMap((d) => [d.rxMbps, d.txMbps]);
  const yMax = Math.max(1, ...ys);
  const xScale = (i) => pad.left + (i / Math.max(1, data.length - 1)) * (w - pad.left - pad.right);
  const yScale = (v) => pad.top + (1 - v / yMax) * (h - pad.top - pad.bottom);

  const buildArea = (key) => {
    const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d[key])}`).join(' ');
    return `${line} L ${xScale(data.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`;
  };
  const buildLine = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d[key])}`).join(' ');

  const yTicks = niceTicks(0, yMax, 4);
  const xTickIdx = pickXTicks(data.length, 5);

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs">
        <Legend color="#0ea5e9" label="Download (RX)" />
        <Legend color="#10b981" label="Upload (TX)" />
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52" preserveAspectRatio="none">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={w - pad.right} y1={yScale(t)} y2={yScale(t)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
            <text x={pad.left - 6} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>
              {formatY ? formatY(t) : t}
            </text>
          </g>
        ))}
        {xTickIdx.map((i) => (
          <text key={i} x={xScale(i)} y={h - 10} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>
            {formatX ? formatX(data[i].t) : data[i].t}
          </text>
        ))}
        <path d={buildArea('rxMbps')} fill="rgba(14,165,233,0.18)" />
        <path d={buildArea('txMbps')} fill="rgba(16,185,129,0.18)" />
        <path d={buildLine('rxMbps')} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        <path d={buildLine('txMbps')} fill="none" stroke="#10b981" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ApBars({ devices }) {
  if (!devices.length) {
    return <div className="text-sm text-slate-500 py-6 text-center dark:text-slate-400">No access points</div>;
  }
  const maxClients = Math.max(1, ...devices.map((d) => d.clients));
  return (
    <ul className="space-y-3">
      {devices.map((d) => (
        <li key={d.id}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-2 truncate">
              <span className={`h-2 w-2 rounded-full ${d.state === 'online' ? 'bg-accent-500' : d.state === 'pending' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{d.name}</span>
              <span className="text-slate-500 dark:text-slate-400">{d.model || ''}</span>
            </span>
            <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
              {d.clients} clients · {d.chanUtil}% util
            </span>
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-2 items-center">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
              <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${(d.clients / maxClients) * 100}%` }} />
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  d.chanUtil >= 60 ? 'bg-rose-500' : d.chanUtil >= 35 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, d.chanUtil)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TopClientsBars({ items }) {
  if (!items.length) {
    return <div className="text-sm text-slate-500 py-6 text-center dark:text-slate-400">No client usage data</div>;
  }
  const max = Math.max(1, ...items.map((d) => d.bytes));
  return (
    <ul className="space-y-2.5">
      {items.map((d) => (
        <li key={d.name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 truncate dark:text-slate-300">{d.name}</span>
            <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-200">{formatBytes(d.bytes)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(d.bytes / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="text-sm text-slate-500 py-6 text-center dark:text-slate-400">No client data</div>;
  }

  const size = 180;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth={stroke} />
        {data.map((d) => {
          if (!d.value) return null;
          const len = (d.value / total) * c;
          const dasharray = `${len} ${c - len}`;
          const el = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="fill-slate-800 dark:fill-slate-100" style={{ fontSize: 22, fontWeight: 700 }}>
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 10 }}>
          clients
        </text>
      </svg>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =========================================================================
// Helpers
// =========================================================================

function niceTicks(min, max, count) {
  if (max <= min) return [min];
  const range = max - min;
  const step = niceStep(range / count);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  if (ticks[0] !== min) ticks.unshift(min);
  return ticks;
}

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const n = raw / base;
  if (n < 1.5) return 1 * base;
  if (n < 3)   return 2 * base;
  if (n < 7)   return 5 * base;
  return 10 * base;
}

function pickXTicks(len, count) {
  if (len <= count) return Array.from({ length: len }, (_, i) => i);
  const step = (len - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

function formatTime(t) {
  const d = new Date(typeof t === 'number' ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatHour(t) {
  const d = new Date(typeof t === 'number' ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t);
  return d.toLocaleTimeString(undefined, { hour: '2-digit' });
}

function formatRelative(when) {
  const ms = typeof when === 'number' ? when : Date.parse(when);
  if (Number.isNaN(ms)) return String(when);
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

function formatMbps(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  if (v >= 100) return `${Math.round(v)} Mbps`;
  return `${v.toFixed(1)} Mbps`;
}

function formatBytes(b) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6)  return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3)  return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}
