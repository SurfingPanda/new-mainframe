import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api, getUser, hasPermission } from '../lib/auth.js';

const INPUT =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

// Tinted icon chip + subtle card gradient for the stat cards.
const STAT_TONES = {
  brand: { chip: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30', glow: 'from-brand-50/70' },
  accent: { chip: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30', glow: 'from-accent-50/70' },
  amber: { chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30', glow: 'from-amber-50/70' },
  sky: { chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30', glow: 'from-sky-50/70' }
};

const ICONS = {
  spaces: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  members: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  items: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  owned: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6L12 2z'
};

// Deterministic gradient per space (keyed off its short key) so each space
// gets a stable, colorful badge instead of flat navy.
const BADGE_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600'
];
function badgeGradient(key = '') {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BADGE_GRADIENTS[h % BADGE_GRADIENTS.length];
}

function StatCard({ tone, icon, label, value }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br ${t.glow} to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`}>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${t.chip}`}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[icon]} />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

export default function Spaces() {
  const navigate = useNavigate();
  const me = getUser();
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'member' | 'mine'
  const [view, setView] = useState('grid'); // 'grid' | 'list'
  const [joiningId, setJoiningId] = useState(null);
  const canManage = hasPermission('spaces', 'manage');

  const load = () => {
    setLoading(true);
    api('/api/spaces')
      .then((data) => { setSpaces(data); setError(''); })
      .catch((e) => setError(e.message || 'Failed to load spaces'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // A space is openable if you're a member or hold spaces.manage (oversight).
  const canOpen = (s) => s.is_member || canManage;

  const requestJoin = async (s) => {
    setJoiningId(s.id);
    try {
      await api(`/api/spaces/${s.id}/join`, { method: 'POST' });
      setSpaces((prev) => prev.map((x) => (x.id === s.id ? { ...x, join_status: 'pending' } : x)));
    } catch (e) {
      setError(e.message || 'Could not send join request');
    } finally {
      setJoiningId(null);
    }
  };

  const stats = useMemo(() => ({
    total: spaces.length,
    member: spaces.filter((s) => s.is_member).length,
    items: spaces.reduce((n, s) => n + (s.item_count || 0), 0),
    owned: spaces.filter((s) => me && s.owner_id === me.id).length
  }), [spaces, me]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spaces.filter((s) => {
      if (filter === 'mine' && !(me && s.owner_id === me.id)) return false;
      if (filter === 'member' && !s.is_member) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.space_key || '').toLowerCase().includes(q) ||
        (s.owner_name || '').toLowerCase().includes(q)
      );
    });
  }, [spaces, query, filter, me]);

  // The sidebar only lists spaces the user can actually open.
  const recent = useMemo(() => spaces.filter(canOpen).slice(0, 5), [spaces, canManage]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />
      <main className="container-app py-10 space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700">Spaces</span>
        </nav>

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Spaces</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 dark:text-white">Spaces</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Create a space, add members, and track work on a board.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create space
          </button>
        </section>

        {/* Stat cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard tone="brand" icon="spaces" label="Total spaces" value={loading ? '—' : stats.total} />
          <StatCard tone="accent" icon="members" label="You're a member of" value={loading ? '—' : stats.member} />
          <StatCard tone="sky" icon="items" label="Work items" value={loading ? '—' : stats.items} />
          <StatCard tone="amber" icon="owned" label="Owned by you" value={loading ? '—' : stats.owned} />
        </section>

        {/* Toolbar */}
        <section className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spaces, keys, owners…"
              className={`${INPUT} pl-9`}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">All spaces</option>
            <option value="member">Member of</option>
            <option value="mine">Owned by me</option>
          </select>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700 sm:ml-auto">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Grid view"
              className={`px-2.5 py-2 ${view === 'grid' ? 'bg-brand-900 text-white dark:bg-brand-600' : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="List view"
              className={`px-2.5 py-2 ${view === 'list' ? 'bg-brand-900 text-white dark:bg-brand-600' : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          </div>
        </section>

        {/* Main + sidebar */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
                <button onClick={load} className="ml-3 font-semibold underline">Retry</button>
              </div>
            ) : spaces.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-lg font-semibold text-brand-900 dark:text-white">No spaces yet</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Create your first space to start planning work.</p>
                <button type="button" className="btn-primary mt-5" onClick={() => setCreateOpen(true)}>Create space</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-lg font-semibold text-brand-900 dark:text-white">No matching spaces</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Try a different search or filter.</p>
              </div>
            ) : view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {visible.map((s) => <SpaceCard key={s.id} s={s} canOpen={canOpen(s)} joining={joiningId === s.id} onJoin={() => requestJoin(s)} />)}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {visible.map((s) => <SpaceRow key={s.id} s={s} canOpen={canOpen(s)} joining={joiningId === s.id} onJoin={() => requestJoin(s)} />)}
              </div>
            )}
          </div>

          {/* Sidebar: recently updated */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-brand-900 dark:text-white">Recently updated</h2>
                <svg className="h-4 w-4 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div className="mt-3 space-y-1">
                {loading ? (
                  [0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)
                ) : recent.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>
                ) : (
                  recent.map((s) => (
                    <Link
                      key={s.id}
                      to={`/spaces/${s.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {s.icon_url ? (
                        <img src={s.icon_url} alt={s.name} className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/5" />
                      ) : (
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${badgeGradient(s.space_key)} text-[10px] font-bold tracking-wide text-white shadow-sm`}>
                          {s.space_key}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-brand-900 dark:text-white">{s.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{s.item_count} item{s.item_count === 1 ? '' : 's'}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <p className="mt-3 border-t border-slate-100 pt-3 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {visible.length} space{visible.length === 1 ? '' : 's'} shown
              </p>
            </div>
          </aside>
        </div>
      </main>

      {createOpen && (
        <CreateSpaceModal
          onClose={() => setCreateOpen(false)}
          onCreated={(space) => { setCreateOpen(false); navigate(`/spaces/${space.id}`); }}
        />
      )}
    </div>
  );
}

// Footer control for a space the viewer can't open: request to join / pending.
function JoinControl({ s, joining, onJoin }) {
  if (s.join_status === 'pending') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        Requested
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={joining}
      className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
    >
      {joining ? 'Requesting…' : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg>
          {s.join_status === 'denied' ? 'Request again' : 'Request to join'}
        </>
      )}
    </button>
  );
}

function SpaceCard({ s, canOpen, joining, onJoin }) {
  const grad = badgeGradient(s.space_key);
  const cardClass = `group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-slate-800 dark:bg-slate-900 ${canOpen ? 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg dark:hover:border-slate-700' : ''}`;
  const inner = (
    <>
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${grad}`} />
      <div className="flex items-center gap-3">
        {s.icon_url ? (
          <img src={s.icon_url} alt={s.name} className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-inset ring-black/5" />
        ) : (
          <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-xs font-bold tracking-wider text-white shadow-sm`}>
            {s.space_key}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`truncate font-semibold text-brand-900 dark:text-white ${canOpen ? 'transition-colors group-hover:text-accent-700 dark:group-hover:text-accent-300' : ''}`}>{s.name}</h3>
            {!s.is_member && (
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Private</span>
            )}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Owner · {s.owner_name}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-slate-600 dark:text-slate-300">
        {s.description || <span className="italic text-slate-400 dark:text-slate-500">No description</span>}
      </p>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 ring-1 ring-inset ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          {s.member_count}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 ring-1 ring-inset ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          {s.item_count}
        </span>
        {canOpen ? (
          <span className="ml-auto inline-flex translate-x-1 items-center gap-1 text-accent-700 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 dark:text-accent-300">
            Open
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        ) : (
          <JoinControl s={s} joining={joining} onJoin={onJoin} />
        )}
      </div>
    </>
  );

  return canOpen
    ? <Link to={`/spaces/${s.id}`} className={cardClass}>{inner}</Link>
    : <div className={cardClass}>{inner}</div>;
}

function SpaceRow({ s, canOpen, joining, onJoin }) {
  const badge = s.icon_url ? (
    <img src={s.icon_url} alt={s.name} className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/5" />
  ) : (
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${badgeGradient(s.space_key)} text-xs font-bold tracking-wider text-white shadow-sm`}>
      {s.space_key}
    </span>
  );
  const meta = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-brand-900 dark:text-white">{s.name}</h3>
          {!s.is_member && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Private</span>}
        </div>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">Owner · {s.owner_name}</p>
      </div>
      <div className="hidden items-center gap-4 text-xs font-medium text-slate-500 sm:flex dark:text-slate-400">
        <span>{s.member_count} member{s.member_count === 1 ? '' : 's'}</span>
        <span>{s.item_count} item{s.item_count === 1 ? '' : 's'}</span>
      </div>
    </>
  );

  if (canOpen) {
    return (
      <Link to={`/spaces/${s.id}`} className="flex items-center gap-4 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
        {badge}
        {meta}
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4 p-4">
      {badge}
      {meta}
      <JoinControl s={s} joining={joining} onJoin={onJoin} />
    </div>
  );
}

function CreateSpaceModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const space = await api('/api/spaces', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() }) });
      onCreated(space);
    } catch (err) {
      setError(err.message || 'Failed to create space');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create space" size="md">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Revamp" maxLength={120} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Description <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea className={`${INPUT} min-h-[90px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this space for?" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Creating…' : 'Create space'}</button>
        </div>
      </form>
    </Modal>
  );
}
