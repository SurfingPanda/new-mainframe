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
            <h2 className="text-sm font-semibold text-brand-900">Modules</h2>
            <span className="text-xs text-slate-500">Jump straight to a workspace</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <ModuleCard
              to="/tickets/all"
              title="Ticketing"
              desc="Submit, triage, and resolve support requests."
              stat={`${openTickets.length} open`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
                </svg>
              }
            />
            <ModuleCard
              to="/assets/all"
              title="Asset Inventory"
              desc="Track every device issued by Eljin Corp."
              stat={`${assets.length} tracked`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7l9-4 9 4-9 4-9-4z" />
                  <path d="M3 7v10l9 4 9-4V7" />
                </svg>
              }
            />
            <ModuleCard
              to="/kb/all"
              title="Knowledge Base"
              desc="Internal documentation, written once."
              stat={`${kb.length} articles`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
                  <path d="M4 16a4 4 0 0 1 4-4h12" />
                </svg>
              }
            />
          </div>
        </section>
      </main>
    </div>
  );
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

function ModuleCard({ to, title, desc, stat, icon }) {
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-slate-200 bg-white p-5 shadow-card hover:border-accent-300 hover:shadow-elevated transition-all"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900 text-white">
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-accent-700 bg-accent-50 ring-1 ring-inset ring-accent-200 rounded-full px-2 py-0.5">
          {stat}
        </span>
      </div>
      <h3 className="mt-4 font-semibold text-brand-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{desc}</p>
      <span className="mt-3 inline-flex text-xs font-semibold text-accent-700 group-hover:text-accent-800">
        Open module →
      </span>
    </Link>
  );
}
