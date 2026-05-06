import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/auth.js';
import DashboardHeader from '../components/DashboardHeader.jsx';

export default function Dashboard() {
  const user = getUser();
  const [tickets, setTickets] = useState([]);
  const [assets, setAssets] = useState([]);
  const [kb, setKb] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api('/api/tickets'), api('/api/assets'), api('/api/kb')])
      .then(([t, a, k]) => {
        setTickets(t);
        setAssets(a);
        setKb(k);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openTickets = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  const highPriority = tickets.filter((t) => t.priority === 'high' || t.priority === 'urgent').length;
  const inMaintenance = assets.filter((a) => a.status === 'repair').length;
  const greeting = getGreeting();

  const ticketStatusData = [
    { key: 'open', label: 'Open', color: '#f59e0b' },
    { key: 'in_progress', label: 'In progress', color: '#3f5b95' },
    { key: 'on_hold', label: 'On hold', color: '#94a3b8' },
    { key: 'resolved', label: 'Resolved', color: '#22a23e' },
    { key: 'closed', label: 'Closed', color: '#475569' }
  ].map((s) => ({ ...s, value: tickets.filter((t) => t.status === s.key).length }));

  const ticketPriorityData = [
    { key: 'urgent', label: 'Urgent', color: '#e11d48' },
    { key: 'high', label: 'High', color: '#f59e0b' },
    { key: 'normal', label: 'Normal', color: '#3f5b95' },
    { key: 'low', label: 'Low', color: '#94a3b8' }
  ].map((p) => ({ ...p, value: tickets.filter((t) => t.priority === p.key).length }));

  const ticketCategoryData = aggregate(tickets, 'category', 'Uncategorized').slice(0, 6);

  const assetStatusData = [
    { key: 'in_use', label: 'In use', color: '#22a23e' },
    { key: 'in_storage', label: 'In storage', color: '#0ea5e9' },
    { key: 'repair', label: 'Repair', color: '#f59e0b' },
    { key: 'retired', label: 'Retired', color: '#94a3b8' }
  ].map((s) => ({ ...s, value: assets.filter((a) => a.status === s.key).length }));

  const assetTypeData = aggregate(assets, 'type', 'Other').slice(0, 6);
  const assetLocationData = aggregate(assets, 'location', 'Unassigned').slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Overview</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">
              {greeting}, {user?.name?.split(' ')[0] || 'there'}.
            </h1>
            <p className="mt-1 text-slate-600">
              Signed in as <span className="font-mono text-slate-700">{user?.email}</span>
              {user?.department && <> · <span>{user.department}</span></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tickets/create" className="btn-primary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Ticket
            </Link>
            <Link to="/tickets/create-incident" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              Report Incident
            </Link>
            <Link to="/assets/request" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 13h5l2 3h4l2-3h5" />
                <path d="M5 13V5h14v8" />
              </svg>
              Request Asset
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-3">
          <StatCard
            label="Open tickets"
            value={openTickets.length}
            sub={`${tickets.length} total · ${highPriority} high priority`}
            tone="amber"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
              </svg>
            }
          />
          <StatCard
            label="Tracked assets"
            value={assets.length}
            sub={`${inMaintenance} under maintenance`}
            tone="brand"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7" />
              </svg>
            }
          />
          <StatCard
            label="KB articles"
            value={kb.length}
            sub="published"
            tone="accent"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
                <path d="M4 16a4 4 0 0 1 4-4h12" />
              </svg>
            }
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-brand-900">Recent tickets</h2>
                <p className="text-xs text-slate-500 mt-0.5">Latest activity across the queue</p>
              </div>
              <Link to="/tickets/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800">
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
            ) : tickets.length === 0 ? (
              <EmptyState
                title="No tickets yet"
                desc="When someone opens a ticket it'll show up here."
                cta={{ to: '/tickets/create', label: 'Create the first ticket' }}
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {tickets.slice(0, 6).map((t) => (
                  <li key={t.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50/60">
                    <span className="col-span-2 font-mono text-xs text-slate-500">T-{String(t.id).padStart(4, '0')}</span>
                    <span className="col-span-6 truncate text-slate-800">{t.title}</span>
                    <span className="col-span-2">
                      <PriorityPill priority={t.priority} />
                    </span>
                    <span className="col-span-2 text-right">
                      <StatusPill status={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-brand-900">Latest articles</h2>
                <p className="text-xs text-slate-500 mt-0.5">From the knowledge base</p>
              </div>
              <Link to="/kb/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800">
                Browse →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
            ) : kb.length === 0 ? (
              <EmptyState title="No articles yet" desc="Publish your first guide to help the team self-serve." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {kb.slice(0, 5).map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm hover:bg-slate-50/60">
                    <div className="font-medium text-slate-800 truncate">{a.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.category || 'General'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-brand-900">Ticketing reports</h2>
              <p className="text-xs text-slate-500 mt-0.5">Distribution across the queue</p>
            </div>
            <Link to="/tickets/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800">
              Open ticketing →
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <ChartCard title="By status" subtitle="Current ticket pipeline">
              <BarChart data={ticketStatusData} />
            </ChartCard>
            <ChartCard title="By priority" subtitle="What needs attention first">
              <Donut data={ticketPriorityData} centerLabel="Tickets" />
            </ChartCard>
            <ChartCard title="By category" subtitle="Top issue areas">
              <HBarChart data={ticketCategoryData} color="#3f5b95" emptyLabel="No tickets yet" />
            </ChartCard>
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-brand-900">Asset reports</h2>
              <p className="text-xs text-slate-500 mt-0.5">Inventory at a glance</p>
            </div>
            <Link to="/assets/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800">
              Open assets →
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <ChartCard title="By status" subtitle="Where each device sits">
              <Donut data={assetStatusData} centerLabel="Assets" />
            </ChartCard>
            <ChartCard title="By type" subtitle="Top hardware classes">
              <HBarChart data={assetTypeData} color="#22a23e" emptyLabel="No assets tracked" />
            </ChartCard>
            <ChartCard title="By location" subtitle="Where assets are deployed">
              <HBarChart data={assetLocationData} color="#3f5b95" emptyLabel="No locations recorded" />
            </ChartCard>
          </div>
        </section>
      </main>
    </div>
  );
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ label, value, sub, tone = 'brand', icon }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800 ring-brand-200',
    accent: 'bg-accent-50 text-accent-700 ring-accent-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200'
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-inset ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-brand-900 tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
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
    resolved: 'bg-accent-50 text-accent-700 ring-accent-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${map[status] || map.open}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function EmptyState({ title, desc, cta }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{desc}</p>
      {cta && (
        <Link to={cta.to} className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
          {cta.label} →
        </Link>
      )}
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

function BarChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {data.map((d) => (
          <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="text-[10px] font-semibold text-slate-700 tabular-nums">{d.value}</div>
            <div
              className="mt-1 w-full rounded-t-md transition-all"
              style={{
                height: `${(d.value / max) * 100}%`,
                backgroundColor: d.color,
                minHeight: d.value ? 4 : 0
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <div key={d.key} className="flex-1 text-center text-[10px] text-slate-500 truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({ data, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 36;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90 shrink-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {total > 0 &&
          data.map((d) => {
            const frac = d.value / total;
            const len = frac * C;
            const seg = (
              <circle
                key={d.key || d.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc * C}
              />
            );
            acc += frac;
            return seg;
          })}
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-brand-900 tabular-nums">{total}</div>
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
          {centerLabel}
        </div>
        <ul className="mt-2 space-y-1">
          {data.map((d) => (
            <li key={d.key || d.label} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="flex-1 truncate">{d.label}</span>
              <span className="font-semibold text-slate-700 tabular-nums">{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HBarChart({ data, color = '#3f5b95', emptyLabel = 'No data' }) {
  if (!data.length) {
    return <div className="text-sm text-slate-500 py-10 text-center">{emptyLabel}</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 truncate">{d.label}</span>
            <span className="font-semibold text-slate-800 tabular-nums">{d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
