import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser, hasPermission } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';
import { slaPill } from '../lib/sla.js';
import DashboardHeader from '../components/DashboardHeader.jsx';
import AnnouncementsBanner from '../components/AnnouncementsBanner.jsx';

// A published article counts as "new" for a week after it was created.
const NEW_ARTICLE_DAYS = 7;
function isNewArticle(a) {
  if (!a?.published) return false;
  const t = a.created_at ? new Date(a.created_at).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= NEW_ARTICLE_DAYS * 86400000;
}

function NewBadge() {
  return (
    <span className="flex-none rounded-full bg-accent-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
      New
    </span>
  );
}

export default function Dashboard() {
  const user = getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'agent';
  if (!isStaff) return <UserDashboard user={user} />;
  return <StaffDashboard user={user} />;
}

function StaffDashboard({ user }) {
  const [tickets, setTickets] = useState([]);
  const [kb, setKb] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api('/api/tickets'),
      api('/api/kb'),
      api('/api/spaces').catch(() => [])
    ])
      .then(([t, k, s]) => {
        setTickets(Array.isArray(t) ? t : []);
        setKb(Array.isArray(k) ? k : []);
        setSpaces(Array.isArray(s) ? s : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openTickets = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  const highPriority = tickets.filter((t) => t.priority === 'high' || t.priority === 'urgent').length;
  const spaceItems = spaces.reduce((n, s) => n + (s.item_count || 0), 0);
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-6 sm:py-10 space-y-6 sm:space-y-8">
        <AnnouncementsBanner canManage={user?.role === 'admin' || (user?.department || '').trim().toUpperCase() === 'IT'} />

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Overview</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-brand-900 dark:text-slate-100">
              {greeting}, {user?.name?.split(' ')[0] || 'there'}.
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Signed in as <span className="font-mono text-slate-700 dark:text-slate-300">{user?.email}</span>
              {user?.department && <> · <span>{user.department}</span></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tickets/create" className="btn-primary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Work Order
            </Link>
            <Link to="/tickets/create-incident" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              Report Incident
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-900 dark:text-rose-300">
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-3">
          <StatCard
            label="Open work orders"
            value={openTickets.length}
            sub={`${tickets.length} total · ${highPriority} high priority`}
            tone="amber"
            to="/tickets/all"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
              </svg>
            }
          />
          <StatCard
            label="KB articles"
            value={kb.length}
            sub="published"
            tone="accent"
            to="/kb/all"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
                <path d="M4 16a4 4 0 0 1 4-4h12" />
              </svg>
            }
          />
          <StatCard
            label="Spaces"
            value={spaces.length}
            sub={`${spaceItems} work item${spaceItems === 1 ? '' : 's'} tracked`}
            tone="violet"
            to="/spaces"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4" />
              </svg>
            }
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Recent work orders</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Latest activity across the queue</p>
              </div>
              <Link to="/tickets/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : tickets.length === 0 ? (
              <EmptyState
                title="No work orders yet"
                desc="When someone opens a work order it'll show up here."
                cta={{ to: '/tickets/create', label: 'Create the first work order' }}
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {tickets.slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/tickets/${t.id}`}
                      className="block px-5 py-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                        <div className="flex items-center justify-between gap-2 sm:col-span-2">
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{formatTicketId(t.id)}</span>
                          <span className="sm:hidden">
                            <StatusPill status={t.status} />
                          </span>
                        </div>
                        <span className="min-w-0 sm:col-span-3">
                          <span className="block truncate text-slate-800 dark:text-slate-200">{t.title}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {t.assignee ? `Technician: ${t.assignee}` : 'Unassigned'}
                          </span>
                        </span>
                        <span className="hidden min-w-0 sm:block sm:col-span-2">
                          {t.category ? (
                            <span className="inline-block max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={t.category}>
                              {t.category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </span>
                        <span className="sm:col-span-2">
                          <SlaPill ticket={t} />
                        </span>
                        <span className="sm:col-span-1">
                          <PriorityPill priority={t.priority} />
                        </span>
                        <span className="hidden sm:block sm:col-span-2 sm:text-right">
                          <StatusPill status={t.status} />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Latest articles</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">From the knowledge base</p>
              </div>
              <Link to="/kb/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
                Browse →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : kb.length === 0 ? (
              <EmptyState title="No articles yet" desc="Publish your first guide to help the team self-serve." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {kb.slice(0, 4).map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 truncate dark:text-slate-200">{a.title}</span>
                      {isNewArticle(a) && <NewBadge />}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{a.category || 'General'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <MyWorkItems />

        <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Spaces</h2>
              <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Project workspaces you can jump into</p>
            </div>
            <Link to="/spaces" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : spaces.length === 0 ? (
            <EmptyState
              title="No spaces yet"
              desc="Spin up a project space to plan and track work on a board."
              cta={{ to: '/spaces', label: 'Create a space' }}
            />
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {spaces.slice(0, 8).map((s) => (
                <SpaceMiniCard key={s.id} space={s} />
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

function SpaceMiniCard({ space: s }) {
  return (
    <Link
      to={`/spaces/${s.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-px hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-500/40"
    >
      <div className="flex items-center gap-3">
        {s.icon_url ? (
          <img src={s.icon_url} alt={s.name} className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/5" />
        ) : (
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-brand-700 text-[11px] font-bold tracking-wider text-white">
            {s.space_key}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-brand-900 group-hover:text-violet-700 dark:text-slate-100 dark:group-hover:text-violet-300">{s.name}</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Owner · {s.owner_name}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          {s.member_count ?? 0}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          {s.item_count ?? 0}
        </span>
      </div>
    </Link>
  );
}

// Due-date status for a 'YYYY-MM-DD' string, measured from today's local date.
function dueMeta(due) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { days, label: `${-days}d overdue`, tone: 'rose' };
  if (days === 0) return { days, label: 'Due today', tone: 'rose' };
  if (days === 1) return { days, label: 'Due tomorrow', tone: 'amber' };
  return { days, label: `Due in ${days}d`, tone: days <= 3 ? 'amber' : 'slate' };
}

const DUE_TONES = {
  rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};

const PRIORITY_DOT = { low: 'bg-slate-300', normal: 'bg-slate-400', high: 'bg-amber-500', urgent: 'bg-rose-500' };

// "Your work items" — space items assigned to me that are overdue or due soon.
// Self-fetching so it drops into either dashboard. Hidden entirely when the user
// has nothing assigned (keeps the Overview clean for non-Spaces users).
function MyWorkItems() {
  const [items, setItems] = useState(null); // null = loading

  useEffect(() => {
    api('/api/spaces/items/mine')
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]));
  }, []);

  if (items === null || items.length === 0) return null;

  const withDue = items.map((i) => ({ ...i, due: dueMeta(i.due_at) }));
  const soon = withDue.filter((i) => i.due.days <= 7); // overdue + within a week (already due-sorted by the API)
  const overdue = withDue.filter((i) => i.due.days < 0).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Your work items</h2>
          <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
            Assigned to you across spaces{overdue > 0 ? ` · ${overdue} overdue` : ''}
          </p>
        </div>
        <Link to="/spaces" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
          View all →
        </Link>
      </div>
      {soon.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nothing due in the next 7 days</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{items.length} item{items.length === 1 ? '' : 's'} assigned to you overall.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {soon.slice(0, 6).map((i) => (
            <li key={i.id}>
              <Link
                to={`/spaces/${i.space_id}?item=${i.id}`}
                className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[i.priority] || 'bg-slate-400'}`} title={i.priority} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-800 dark:text-slate-200">{i.title}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{i.item_key}</span> · {i.space_name}
                  </span>
                </span>
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${DUE_TONES[i.due.tone]}`}>
                  {i.due.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UserDashboard({ user }) {
  const [tickets, setTickets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [kb, setKb] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canViewAssets = hasPermission('assets', 'view', user);

  useEffect(() => {
    Promise.all([
      api('/api/tickets'),
      canViewAssets ? api('/api/asset-requests') : Promise.resolve([]),
      api('/api/kb')
    ])
      .then(([t, r, k]) => {
        setTickets(Array.isArray(t) ? t : []);
        setRequests(Array.isArray(r) ? r : []);
        setKb(Array.isArray(k) ? k : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canViewAssets]);

  const identities = [user?.name, user?.email].filter(Boolean);
  const mine = tickets;
  const openMine = mine.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  const awaitingMe = mine.filter((t) => t.status === 'pending' && identities.includes(t.requester));
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-6 sm:py-10 space-y-6 sm:space-y-8">
        <AnnouncementsBanner canManage={user?.role === 'admin' || (user?.department || '').trim().toUpperCase() === 'IT'} />

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Overview</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-brand-900 dark:text-slate-100">
              {greeting}, {user?.name?.split(' ')[0] || 'there'}.
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Signed in as <span className="font-mono text-slate-700 dark:text-slate-300">{user?.email}</span>
              {user?.department && <> · <span>{user.department}</span></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tickets/create" className="btn-primary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Work Order
            </Link>
            <Link to="/tickets/create-incident" className="btn-secondary !px-3.5 !py-2 text-xs">
              <svg className="h-4 w-4 mr-1.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              Report Incident
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-900 dark:text-rose-300">
            {error}
          </div>
        )}

        <section className={`grid gap-5 ${canViewAssets ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <StatCard
            label="Your open work orders"
            value={openMine.length}
            sub={`${mine.length} total · ${awaitingMe.length} waiting on you`}
            tone="amber"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
              </svg>
            }
          />
          {canViewAssets && (
            <StatCard
              label="Asset requests"
              value={pendingRequests.length}
              sub={`${requests.length} total · ${pendingRequests.length} pending review`}
              tone="brand"
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 13h5l2 3h4l2-3h5" />
                  <path d="M5 13V5h14v8" />
                </svg>
              }
            />
          )}
          <StatCard
            label="KB articles"
            value={kb.length}
            sub="available to read"
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
          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Your recent work orders</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Work orders you opened or are assigned to</p>
              </div>
              <Link to="/tickets/submitted" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : mine.length === 0 ? (
              <EmptyState
                title="No work orders yet"
                desc="Open one and it'll show up here. We'll keep you posted on updates."
                cta={{ to: '/tickets/create', label: 'Open your first work order' }}
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {mine.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/tickets/${t.id}`}
                      className="block px-5 py-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                        <div className="flex items-center justify-between gap-2 sm:col-span-2">
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{formatTicketId(t.id)}</span>
                          <span className="sm:hidden">
                            <StatusPill status={t.status} />
                          </span>
                        </div>
                        <span className="min-w-0 sm:col-span-3">
                          <span className="block truncate text-slate-800 dark:text-slate-200">{t.title}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {t.assignee ? `Technician: ${t.assignee}` : 'Unassigned'}
                          </span>
                        </span>
                        <span className="hidden min-w-0 sm:block sm:col-span-2">
                          {t.category ? (
                            <span className="inline-block max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={t.category}>
                              {t.category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </span>
                        <span className="sm:col-span-2">
                          <SlaPill ticket={t} />
                        </span>
                        <span className="sm:col-span-1">
                          <PriorityPill priority={t.priority} />
                        </span>
                        <span className="hidden sm:block sm:col-span-2 sm:text-right">
                          <StatusPill status={t.status} />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Latest articles</h2>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">From the knowledge base</p>
              </div>
              <Link to="/kb/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
                Browse →
              </Link>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : kb.length === 0 ? (
              <EmptyState title="No articles yet" desc="Check back later — IT publishes guides here." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {kb.slice(0, 4).map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <Link to={`/kb/${a.slug}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 truncate dark:text-slate-200">{a.title}</span>
                        {isNewArticle(a) && <NewBadge />}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{a.category || 'General'}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <MyWorkItems />

        {canViewAssets && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Your asset requests</h2>
              <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">Equipment you've asked IT to provision</p>
            </div>
            <Link to="/assets/request" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
              Request asset →
            </Link>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : requests.length === 0 ? (
            <EmptyState
              title="No requests yet"
              desc="Need new equipment? Submit a request and IT will review it."
              cta={{ to: '/assets/request', label: 'Request an asset' }}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">R-{String(r.id).padStart(4, '0')}</span>
                      <span className="sm:hidden">
                        <RequestStatusPill status={r.status} />
                      </span>
                    </div>
                    <span className="truncate text-slate-800 sm:col-span-5 dark:text-slate-200">
                      {r.asset_type}
                      {r.quantity > 1 && <span className="ml-1 text-xs text-slate-500">× {r.quantity}</span>}
                    </span>
                    <span className="text-xs text-slate-500 sm:col-span-3 dark:text-slate-400 truncate">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                    </span>
                    <span className="hidden sm:block sm:col-span-2 sm:text-right">
                      <RequestStatusPill status={r.status} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </main>
    </div>
  );
}

function RequestStatusPill({ status }) {
  const map = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    approved: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',
    denied: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
    fulfilled: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ label, value, sub, tone = 'brand', icon, to }) {
  const tones = {
    brand: { chip: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30', glow: 'from-brand-50/70', hover: 'hover:border-brand-300 dark:hover:border-brand-500/40' },
    accent: { chip: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30', glow: 'from-accent-50/70', hover: 'hover:border-accent-300 dark:hover:border-accent-500/40' },
    amber: { chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30', glow: 'from-amber-50/70', hover: 'hover:border-amber-300 dark:hover:border-amber-500/40' },
    violet: { chip: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30', glow: 'from-violet-50/70', hover: 'hover:border-violet-300 dark:hover:border-violet-500/40' }
  };
  const t = tones[tone] || tones.brand;
  const base = `group relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br ${t.glow} to-white p-5 shadow-card transition dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`;
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${t.chip}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-brand-900 tabular-nums dark:text-slate-100">{value}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{sub}</span>
        {to && (
          <span className="font-semibold text-accent-700 opacity-0 transition group-hover:opacity-100 dark:text-accent-400">View →</span>
        )}
      </div>
    </>
  );
  return to
    ? <Link to={to} className={`${base} ${t.hover} hover:-translate-y-px hover:shadow-md`}>{inner}</Link>
    : <div className={base}>{inner}</div>;
}

function PriorityPill({ priority }) {
  const map = {
    low: 'text-slate-600 bg-slate-100 ring-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-700',
    normal: 'text-slate-700 bg-slate-50 ring-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-700',
    high: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/30',
    urgent: 'text-rose-700 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:ring-rose-500/30'
  };
  if (!priority) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[priority] || map.normal}`}>
      {priority}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    open: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    in_progress: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',
    on_hold: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    pending: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
    resolved: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${map[status] || map.open}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function SlaPill({ ticket }) {
  const s = slaPill(ticket);
  if (!s) return null;
  const tones = {
    accent: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${tones[s.tone]}`}>
      {s.label}
    </span>
  );
}

function EmptyState({ title, desc, cta }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      {cta && (
        <Link to={cta.to} className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300">
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

