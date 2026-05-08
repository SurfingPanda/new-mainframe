import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';

const SEED_DEVICES = [
  { id: 1,  name: 'core-rtr-01',     ip: '10.0.0.1',     type: 'Router',        location: 'HQ — Server Room',  status: 'online',     latency: 4,   uptime: '142d 18h' },
  { id: 2,  name: 'core-sw-01',      ip: '10.0.0.2',     type: 'Switch',        location: 'HQ — Server Room',  status: 'online',     latency: 2,   uptime: '142d 18h' },
  { id: 3,  name: 'edge-fw-01',      ip: '10.0.0.3',     type: 'Firewall',      location: 'HQ — Server Room',  status: 'online',     latency: 6,   uptime: '76d 04h'  },
  { id: 4,  name: 'ap-flr2-east',    ip: '10.0.12.21',   type: 'Access Point',  location: 'HQ — Floor 2 East', status: 'degraded',   latency: 38,  uptime: '21d 03h'  },
  { id: 5,  name: 'ap-flr2-west',    ip: '10.0.12.22',   type: 'Access Point',  location: 'HQ — Floor 2 West', status: 'online',     latency: 11,  uptime: '21d 03h'  },
  { id: 6,  name: 'ap-flr3-north',   ip: '10.0.13.31',   type: 'Access Point',  location: 'HQ — Floor 3 N',    status: 'online',     latency: 9,   uptime: '64d 11h'  },
  { id: 7,  name: 'srv-dc-01',       ip: '10.0.20.10',   type: 'Server',        location: 'HQ — Server Room',  status: 'online',     latency: 1,   uptime: '298d 02h' },
  { id: 8,  name: 'srv-app-01',      ip: '10.0.20.11',   type: 'Server',        location: 'HQ — Server Room',  status: 'online',     latency: 3,   uptime: '57d 22h'  },
  { id: 9,  name: 'srv-bkp-01',      ip: '10.0.20.20',   type: 'Server',        location: 'DR Site',           status: 'online',     latency: 18,  uptime: '88d 13h'  },
  { id: 10, name: 'branch-rtr-mnl',  ip: '10.10.0.1',    type: 'Router',        location: 'Manila Branch',     status: 'online',     latency: 24,  uptime: '40d 08h'  },
  { id: 11, name: 'branch-sw-mnl',   ip: '10.10.0.2',    type: 'Switch',        location: 'Manila Branch',     status: 'offline',    latency: null, uptime: '—'        },
  { id: 12, name: 'voip-pbx-01',     ip: '10.0.30.5',    type: 'VoIP',          location: 'HQ — Server Room',  status: 'online',     latency: 7,   uptime: '112d 06h' },
  { id: 13, name: 'cam-lobby-01',    ip: '10.0.40.12',   type: 'Camera',        location: 'HQ — Lobby',        status: 'degraded',   latency: 52,  uptime: '4d 17h'   },
  { id: 14, name: 'printer-flr1',    ip: '10.0.50.8',    type: 'Printer',       location: 'HQ — Floor 1',      status: 'online',     latency: 5,   uptime: '12d 09h'  },
];

const STATUS_META = {
  online:   { label: 'Online',   ring: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',   dot: 'bg-accent-500' },
  degraded: { label: 'Degraded', ring: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',          dot: 'bg-amber-500'  },
  offline:  { label: 'Offline',  ring: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',                dot: 'bg-rose-500'   },
};

const SEED_EVENTS = [
  { id: 1, when: '2 min ago',  level: 'warn',  text: 'High latency on ap-flr2-east (38ms, threshold 25ms)' },
  { id: 2, when: '7 min ago',  level: 'error', text: 'branch-sw-mnl stopped responding to ICMP' },
  { id: 3, when: '12 min ago', level: 'info',  text: 'srv-bkp-01 nightly snapshot replicated to DR site' },
  { id: 4, when: '34 min ago', level: 'warn',  text: 'cam-lobby-01 packet loss 3.2% over last 5 min' },
  { id: 5, when: '1 hr ago',   level: 'info',  text: 'edge-fw-01 firmware health check passed' },
];

export default function NetworkMonitoring() {
  const [devices, setDevices]       = useState(SEED_DEVICES);
  const [query, setQuery]           = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  // Simulated tick — nudges latency on online devices and refreshes the timestamp.
  useEffect(() => {
    const t = setInterval(() => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.status !== 'online' && d.status !== 'degraded') return d;
          if (d.latency == null) return d;
          const drift = Math.round((Math.random() - 0.5) * 4);
          const next = Math.max(1, d.latency + drift);
          return { ...d, latency: next };
        })
      );
      setRefreshedAt(new Date());
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const types = useMemo(
    () => Array.from(new Set(devices.map((d) => d.type))).sort(),
    [devices]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.ip.toLowerCase().includes(q) ||
        d.location.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q)
      );
    });
  }, [devices, query, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const online   = devices.filter((d) => d.status === 'online').length;
    const degraded = devices.filter((d) => d.status === 'degraded').length;
    const offline  = devices.filter((d) => d.status === 'offline').length;
    const reachable = devices.filter((d) => d.latency != null);
    const avgLatency = reachable.length
      ? Math.round(reachable.reduce((s, d) => s + d.latency, 0) / reachable.length)
      : 0;
    return { total: devices.length, online, degraded, offline, avgLatency };
  }, [devices]);

  const typeBreakdown = useMemo(() => {
    const map = new Map();
    for (const d of devices) map.set(d.type, (map.get(d.type) || 0) + 1);
    return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [devices]);

  const handleRefresh = () => {
    setRefreshedAt(new Date());
  };

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
              Live reachability and latency across Eljin Corp's internal network.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
              </span>
              Last poll {refreshedAt.toLocaleTimeString()}
            </div>
            <button type="button" onClick={handleRefresh} className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-4">
          <StatCard
            label="Total devices"
            value={counts.total}
            sub="Monitored endpoints"
            tone="brand"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="6" rx="1.5" />
                <rect x="3" y="14" width="18" height="6" rx="1.5" />
                <path d="M7 7h.01M7 17h.01" />
              </svg>
            }
          />
          <StatCard
            label="Online"
            value={counts.online}
            sub={`${Math.round((counts.online / Math.max(1, counts.total)) * 100)}% reachable`}
            tone="accent"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <circle cx="12" cy="20" r="1" />
              </svg>
            }
          />
          <StatCard
            label="Issues"
            value={counts.degraded + counts.offline}
            sub={`${counts.degraded} degraded · ${counts.offline} offline`}
            tone={counts.offline > 0 ? 'rose' : 'amber'}
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            }
          />
          <StatCard
            label="Avg latency"
            value={`${counts.avgLatency} ms`}
            sub="Across reachable devices"
            tone="brand"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            }
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Devices</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
                  {filtered.length} of {devices.length} shown
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Search name, IP, location…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200"
                >
                  <option value="all">All types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200"
                >
                  <option value="all">All statuses</option>
                  <option value="online">Online</option>
                  <option value="degraded">Degraded</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Device</th>
                    <th className="px-5 py-2.5 text-left">Type</th>
                    <th className="px-5 py-2.5 text-left">Location</th>
                    <th className="px-5 py-2.5 text-right">Latency</th>
                    <th className="px-5 py-2.5 text-right">Uptime</th>
                    <th className="px-5 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        No devices match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{d.name}</div>
                          <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{d.ip}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{d.type}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{d.location}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <LatencyCell ms={d.latency} status={d.status} />
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.uptime}</td>
                        <td className="px-5 py-3 text-right">
                          <StatusPill status={d.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">By device type</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Endpoint mix</p>
              </div>
              <div className="p-5">
                <HBarChart data={typeBreakdown} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Recent events</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Last hour</p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {SEED_EVENTS.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
                    <EventDot level={ev.level} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 dark:text-slate-300">{ev.text}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{ev.when}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

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

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.online;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function LatencyCell({ ms, status }) {
  if (status === 'offline' || ms == null) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  const tone =
    ms >= 30 ? 'text-rose-600 dark:text-rose-400'
    : ms >= 15 ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-700 dark:text-slate-200';
  return <span className={`font-medium ${tone}`}>{ms} ms</span>;
}

function EventDot({ level }) {
  const map = {
    info:  'bg-brand-500',
    warn:  'bg-amber-500',
    error: 'bg-rose-500',
  };
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${map[level] || map.info}`} />;
}

function HBarChart({ data }) {
  if (!data.length) {
    return <div className="text-sm text-slate-500 py-6 text-center dark:text-slate-400">No data</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 truncate dark:text-slate-300">{d.label}</span>
            <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-200">{d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-accent-500 transition-all"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
