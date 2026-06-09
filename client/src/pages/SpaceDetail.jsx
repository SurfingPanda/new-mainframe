import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import Avatar from '../components/Avatar.jsx';
import UserPicker from '../components/UserPicker.jsx';
import { ChartDoughnut, ChartBar } from '../components/DashboardCharts.jsx';
import { api, getUser } from '../lib/auth.js';

const INPUT =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const STATUSES = [
  { key: 'todo', label: 'To Do', color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'done', label: 'Done', color: '#22c55e' }
];
const TYPES = [
  { key: 'epic', label: 'Epic' },
  { key: 'task', label: 'Task' },
  { key: 'subtask', label: 'Subtask' }
];
const PRIORITIES = [
  { key: 'low', label: 'Low', color: '#94a3b8' },
  { key: 'normal', label: 'Normal', color: '#3f5b95' },
  { key: 'high', label: 'High', color: '#f59e0b' },
  { key: 'urgent', label: 'Urgent', color: '#ef4444' }
];
const TABS = ['summary', 'board', 'list', 'calendar', 'documents', 'members'];

const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const labelOf = (list, key) => list.find((x) => x.key === key)?.label || key;

// Deterministic gradient per space key (matches the Spaces list badges).
const KEY_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600'
];
function keyGradient(key = '') {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return KEY_GRADIENTS[h % KEY_GRADIENTS.length];
}

const TYPE_BADGE = {
  epic: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  task: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  subtask: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
};
const PRIORITY_BADGE = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  normal: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
};

// Colored pill for the status dropdown in the detail modal.
const STATUS_PILL = {
  todo: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
  in_progress: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
};

// Small accent icon shown beside left-column section headings.
function SectionHeading({ children, color = 'text-accent-500', action }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900 dark:text-slate-100">
        <span className={`inline-block h-3.5 w-1 rounded-full ${color.replace('text-', 'bg-')}`} />
        {children}
      </h3>
      {action}
    </div>
  );
}

// Parse a 'YYYY-MM-DD' date string into a Date at local midnight (avoids the
// UTC off-by-one you get from `new Date('2026-06-10')`).
function ymdToLocal(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
const formatYmd = (s) => { const d = ymdToLocal(s); return d ? d.toLocaleDateString() : ''; };

// Due/SLA status for an item: returns null when no SLA is set, otherwise a
// formatted date plus overdue/due-soon flags (a done item is never overdue).
function dueInfo(item) {
  if (!item.due_at) return null;
  const done = item.status === 'done';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueDay = ymdToLocal(item.due_at); dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay - today) / 86400000);
  return {
    text: dueDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    overdue: !done && diffDays < 0,
    dueSoon: !done && diffDays >= 0 && diffDays <= 2,
    done
  };
}

function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export default function SpaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('view')) ? params.get('view') : 'summary';

  const [space, setSpace] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [itemModal, setItemModal] = useState(null); // { item } edit | { status } create | null

  const loadSpace = () =>
    api(`/api/spaces/${id}`).then(setSpace);
  const loadItems = () =>
    api(`/api/spaces/${id}/items`).then(setItems);

  const reload = () => {
    setLoading(true);
    Promise.all([loadSpace(), loadItems()])
      .then(() => setError(''))
      .catch((e) => setError(e.message || 'Failed to load space'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  // Open a specific item when deep-linked via ?item=<id> (e.g. a Mailbox CTA),
  // then strip the param so closing the modal doesn't reopen it.
  useEffect(() => {
    if (loading) return;
    const itemParam = params.get('item');
    if (!itemParam) return;
    const target = items.find((i) => String(i.id) === itemParam);
    if (target) setItemModal({ item: target });
    const next = new URLSearchParams(params);
    next.delete('item');
    setParams(next, { replace: true });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [loading, items, params]);

  const setTab = (next) => setParams(next === 'summary' ? {} : { view: next }, { replace: true });

  // Optimistically move an item to a new status, then persist.
  const moveItem = async (itemId, status) => {
    const current = items.find((i) => i.id === itemId);
    if (!current || current.status === status) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status } : i)));
    try {
      const updated = await api(`/api/spaces/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    } catch {
      loadItems().catch(() => {});
    }
  };

  const deleteItem = async (itemId) => {
    await api(`/api/spaces/${id}/items/${itemId}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <main className="container-app py-10">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-8 h-64 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
        </main>
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <main className="container-app py-10">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error || 'Space not found.'}
            <Link to="/spaces" className="ml-3 font-semibold underline">Back to Spaces</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />
      <main className="container-app py-8 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <Link to="/spaces" className="hover:text-slate-800 dark:hover:text-slate-200">Spaces</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700">{space.name}</span>
        </nav>

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {space.icon_url ? (
              <img src={space.icon_url} alt={space.name} className="h-12 w-12 rounded-xl object-cover ring-1 ring-inset ring-black/5" />
            ) : (
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${keyGradient(space.space_key)} text-xs font-bold tracking-wider text-white shadow-sm`}>
                {space.space_key}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{space.name}</h1>
                {space.is_archived ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Archived
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                    Active
                  </span>
                )}
              </div>
              {space.description && <p className="text-sm text-slate-600 dark:text-slate-300">{space.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-primary !py-2 text-xs" onClick={() => setItemModal({ status: 'todo' })}>
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Create item
            </button>
            {space.can_administer && (
              <SpaceSettingsButton space={space} onDeleted={() => navigate('/spaces')} onUpdated={loadSpace} />
            )}
          </div>
        </header>

        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? 'text-accent-700 dark:text-accent-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t}
                {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-500" />}
              </button>
            ))}
          </div>
        </div>

        {tab === 'summary' && <Summary items={items} onView={setTab} />}
        {tab === 'board' && (
          <Board items={items} onMove={moveItem} onOpen={(item) => setItemModal({ item })} onCreate={(status) => setItemModal({ status })} />
        )}
        {tab === 'list' && <ListView items={items} onOpen={(item) => setItemModal({ item })} />}
        {tab === 'calendar' && <CalendarView items={items} onOpen={(item) => setItemModal({ item })} onCreate={(ymd) => setItemModal({ status: 'todo', dueDate: ymd })} />}
        {tab === 'documents' && <DocumentsView spaceId={id} canManage={space.can_administer} />}
        {tab === 'members' && <Members space={space} onChanged={loadSpace} />}
      </main>

      {itemModal?.item && (
        <ItemDetailModal
          spaceId={id}
          members={space.members}
          allItems={items}
          itemId={itemModal.item.id}
          onClose={() => setItemModal(null)}
          onChanged={loadItems}
          onDeleted={async (itemId) => { await deleteItem(itemId); setItemModal(null); }}
        />
      )}
      {itemModal && !itemModal.item && (
        <ItemModal
          spaceId={id}
          members={space.members}
          defaultStatus={itemModal.status}
          defaultDue={itemModal.dueDate}
          onClose={() => setItemModal(null)}
          onSaved={(saved) => { setItems((prev) => [...prev, saved]); setItemModal(null); }}
        />
      )}
    </div>
  );
}

/* ---------------- Summary ---------------- */

function Summary({ items, onView }) {
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const within = (v) => v && new Date(v).getTime() >= weekAgo;
    const byStatus = STATUSES.map((s) => items.filter((i) => i.status === s.key).length);
    const byPriority = PRIORITIES.map((p) => items.filter((i) => i.priority === p.key).length);
    const byType = TYPES.map((t) => items.filter((i) => i.type === t.key).length);
    return {
      total: items.length,
      created: items.filter((i) => within(i.created_at)).length,
      updated: items.filter((i) => within(i.updated_at)).length,
      completed: items.filter((i) => within(i.completed_at)).length,
      byStatus, byPriority, byType
    };
  }, [items]);

  const recent = useMemo(
    () => [...items].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6),
    [items]
  );

  const cards = [
    { tone: 'accent', icon: 'check', value: stats.completed, label: 'Completed', sub: 'in the last 7 days' },
    { tone: 'sky', icon: 'refresh', value: stats.updated, label: 'Updated', sub: 'in the last 7 days' },
    { tone: 'amber', icon: 'plus', value: stats.created, label: 'Created', sub: 'in the last 7 days' },
    { tone: 'purple', icon: 'stack', value: stats.total, label: 'Total items', sub: 'across this space' }
  ];

  const hasItems = items.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <SummaryStat key={c.label} {...c} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Status overview" tone="sky" onView={hasItems ? () => onView('board') : null}>
          {hasItems
            ? <ChartDoughnut labels={STATUSES.map((s) => s.label)} values={stats.byStatus} colors={STATUSES.map((s) => s.color)} emptyLabel="No items yet" />
            : <EmptyPanel message="There are no items yet to display." />}
        </Panel>
        <Panel title="Priority breakdown" tone="violet" onView={hasItems ? () => onView('list') : null}>
          {hasItems
            ? <ChartBar labels={PRIORITIES.map((p) => p.label)} values={stats.byPriority} color="#3f5b95" emptyLabel="No items yet" />
            : <EmptyPanel message="There are no items yet to display." />}
        </Panel>
        <Panel title="Types of work" tone="amber" onView={hasItems ? () => onView('list') : null}>
          {hasItems
            ? <ChartBar labels={TYPES.map((t) => t.label)} values={stats.byType} color="#7c3aed" horizontal emptyLabel="No items yet" />
            : <EmptyPanel message="There are no items with types to display." />}
        </Panel>
        <Panel title="Recent activity" tone="accent" onView={recent.length ? () => onView('list') : null}>
          {recent.length === 0 ? (
            <EmptyPanel message="Recent activity will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs text-slate-400">{i.item_key}</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">{i.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[i.status]}`} />
                    <span className="hidden sm:inline">{labelOf(STATUSES, i.status)}</span>
                  </span>
                  <span className="flex w-32 shrink-0 items-center gap-1.5" title={i.assignee_name || 'Unassigned'}>
                    {i.assignee_name ? (
                      <>
                        <Avatar name={i.assignee_name} src={i.assignee_avatar} size="h-6 w-6" textClass="text-[10px]" />
                        <span className="truncate text-xs text-slate-600 dark:text-slate-300">{i.assignee_name}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-300 dark:border-slate-600 dark:text-slate-600">–</span>
                        <span className="truncate text-xs text-slate-400">Unassigned</span>
                      </>
                    )}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400">{timeAgo(i.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Tinted icon + value summary card at the top of the Summary view.
const STAT_TONE = {
  accent: { chip: 'bg-accent-50 text-accent-600 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30', glow: 'from-accent-50/70' },
  sky: { chip: 'bg-sky-50 text-sky-600 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30', glow: 'from-sky-50/70' },
  amber: { chip: 'bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30', glow: 'from-amber-50/70' },
  purple: { chip: 'bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/30', glow: 'from-purple-50/70' }
};
const STAT_ICON = {
  check: 'M20 6L9 17l-5-5',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  plus: 'M12 5v14M5 12h14',
  stack: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5'
};

function SummaryStat({ tone, icon, value, label, sub }) {
  const t = STAT_TONE[tone] || STAT_TONE.accent;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br ${t.glow} to-white p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`}>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${t.chip}`}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={STAT_ICON[icon]} />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-3xl font-bold leading-none text-brand-900 dark:text-white">{value}</div>
        <div className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

const PANEL_BAR = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  accent: 'bg-accent-500'
};

function Panel({ title, children, onView, tone = 'accent' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-slate-100">
          <span className={`h-4 w-1.5 rounded-full ${PANEL_BAR[tone] || PANEL_BAR.accent}`} />
          {title}
        </h3>
        {onView && (
          <button type="button" onClick={onView} className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent-700 hover:underline dark:text-accent-300">
            View all
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// Illustrated empty state for Summary panels with no data.
function EmptyPanel({ message }) {
  return (
    <div className="flex h-52 flex-col items-center justify-center gap-3 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      </span>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

/* ---------------- Board ---------------- */

const BOARD_COL = {
  todo: { accent: 'bg-slate-400', head: 'text-slate-600 dark:text-slate-300', count: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200' },
  in_progress: { accent: 'bg-blue-500', head: 'text-blue-600 dark:text-blue-300', count: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' },
  done: { accent: 'bg-emerald-500', head: 'text-emerald-600 dark:text-emerald-300', count: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' }
};

function Board({ items, onMove, onOpen, onCreate }) {
  const [dragId, setDragId] = useState(null);
  // Subtasks live inside their parent's detail modal, not on the board.
  const boardItems = items.filter((i) => i.type !== 'subtask');

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STATUSES.map((col) => {
        const colItems = boardItems.filter((i) => i.status === col.key);
        const c = BOARD_COL[col.key] || BOARD_COL.todo;
        return (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const itemId = Number(e.dataTransfer.getData('text/plain')); if (itemId) onMove(itemId, col.key); setDragId(null); }}
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <span className={`h-1 w-full ${c.accent}`} />
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <span className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${c.head}`}>
                {col.label}
                <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${c.count}`}>{colItems.length}</span>
              </span>
              <button type="button" onClick={() => onCreate(col.key)} className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`Add to ${col.label}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-3 pb-3">
              {colItems.map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  dragging={dragId === item.id}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(item.id)); e.dataTransfer.effectAllowed = 'move'; setDragId(item.id); }}
                  onDragEnd={() => setDragId(null)}
                  onOpen={() => onOpen(item)}
                  onMove={onMove}
                />
              ))}
              {colItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400 dark:border-slate-700">Drop items here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ item, dragging, onDragStart, onDragEnd, onOpen, onMove }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-accent-300 hover:shadow dark:border-slate-700 dark:bg-slate-800 ${dragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGE[item.type]}`}>{item.type}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[item.priority]}`}>{item.priority}</span>
        <DueBadge item={item} />
        <span className="font-mono text-[10px] text-slate-400">{item.item_key}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {item.assignee_name ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Avatar name={item.assignee_name} size="h-5 w-5" textClass="text-[9px]" />
            <span className="truncate max-w-[90px]">{item.assignee_name}</span>
          </span>
        ) : <span className="text-xs text-slate-400">Unassigned</span>}
        {/* Accessible fallback to drag-and-drop */}
        <select
          value={item.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onMove(item.id, e.target.value); }}
          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
        >
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function DueBadge({ item }) {
  const due = dueInfo(item);
  if (!due) return null;
  const cls = due.overdue
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
    : due.dueSoon
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2" />
      </svg>
      {due.overdue ? `Overdue · ${due.text}` : due.text}
    </span>
  );
}

const SLA_TONE = {
  emerald: { wrap: 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', sub: 'text-emerald-600/80 dark:text-emerald-300/70', bar: 'bg-emerald-500', track: 'bg-emerald-200/70 dark:bg-emerald-500/20' },
  amber: { wrap: 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', sub: 'text-amber-600/80 dark:text-amber-300/70', bar: 'bg-amber-500', track: 'bg-amber-200/70 dark:bg-amber-500/20' },
  rose: { wrap: 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300', sub: 'text-rose-600/80 dark:text-rose-300/70', bar: 'bg-rose-500', track: 'bg-rose-200/70 dark:bg-rose-500/20' }
};

// A banner above the description summarizing the item's SLA: on track / due soon /
// overdue while open, or met / breached once done. The bar tracks elapsed time in
// the SLA window (start or creation date → due date).
function SlaBar({ item }) {
  if (!item.due_at) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/40">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        No SLA set — add <span className="font-medium">SLA (days)</span> in Details to track a due date.
      </div>
    );
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = ymdToLocal(item.due_at); due.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((due - today) / 86400000);
  const startMid = (ymdToLocal(item.start_date) || new Date(item.created_at)); startMid.setHours(0, 0, 0, 0);
  const span = Math.max(1, (due - startMid) / 86400000);
  const elapsed = Math.min(100, Math.max(0, ((today - startMid) / 86400000 / span) * 100));
  const done = item.status === 'done';

  let tone, label, detail, fill, icon;
  const plural = (n) => `${n} day${n === 1 ? '' : 's'}`;
  if (done) {
    const comp = item.completed_at ? new Date(item.completed_at) : null;
    if (comp) comp.setHours(0, 0, 0, 0);
    const onTime = !comp || comp <= due;
    tone = onTime ? 'emerald' : 'rose';
    label = onTime ? 'Completed within SLA' : 'Completed late';
    detail = `Due ${formatYmd(item.due_at)}`;
    fill = 100;
    icon = onTime ? 'check' : 'alert';
  } else if (daysLeft < 0) {
    tone = 'rose'; label = `Overdue by ${plural(Math.abs(daysLeft))}`; detail = `Due ${formatYmd(item.due_at)}`; fill = 100; icon = 'alert';
  } else if (daysLeft <= 2) {
    tone = 'amber'; label = daysLeft === 0 ? 'Due today' : `Due in ${plural(daysLeft)}`; detail = `Due ${formatYmd(item.due_at)}`; fill = elapsed; icon = 'clock';
  } else {
    tone = 'emerald'; label = 'On track'; detail = `Due ${formatYmd(item.due_at)} · ${plural(daysLeft)} left`; fill = elapsed; icon = 'clock';
  }
  const t = SLA_TONE[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 ${t.wrap}`}>
      <div className="flex items-center gap-2">
        <svg className={`h-4 w-4 shrink-0 ${t.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon === 'check' && <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>}
          {icon === 'alert' && <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>}
          {icon === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
        </svg>
        <span className={`text-xs font-semibold ${t.text}`}>{label}</span>
        <span className={`min-w-0 truncate text-[11px] font-medium ${t.sub}`}>· {detail}</span>
        {item.sla_days != null && <span className={`ml-auto shrink-0 text-[11px] font-medium ${t.sub}`}>{plural(item.sla_days)} SLA</span>}
      </div>
      <div className={`mt-1.5 h-1 overflow-hidden rounded-full ${t.track}`}>
        <div className={`h-full rounded-full ${t.bar} transition-[width]`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

/* ---------------- List ---------------- */

function ListView({ items, onOpen }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (q && !(`${i.item_key} ${i.title} ${i.assignee_name || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, statusFilter, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-xs`} placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={`${INPUT} max-w-[160px]`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No items match.</td></tr>
            ) : rows.map((i) => (
              <tr key={i.id} onClick={() => onOpen(i)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{i.item_key}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{i.title}</td>
                <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGE[i.type]}`}>{i.type}</span></td>
                <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[i.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[i.status]}`} />{labelOf(STATUSES, i.status)}</span></td>
                <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[i.priority]}`}>{i.priority}</span></td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{i.assignee_name || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-2.5">{dueInfo(i) ? <DueBadge item={i} /> : <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{timeAgo(i.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Members ---------------- */

function Members({ space, onChanged }) {
  const [directory, setDirectory] = useState([]);
  const [pick, setPick] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [busyReq, setBusyReq] = useState(null);

  useEffect(() => { api('/api/users/directory').then(setDirectory).catch(() => setDirectory([])); }, []);

  const loadRequests = () => {
    if (!space.can_administer) return;
    api(`/api/spaces/${space.id}/join-requests`).then((d) => setRequests(Array.isArray(d) ? d : [])).catch(() => setRequests([]));
  };
  useEffect(loadRequests, [space.id, space.can_administer]);

  const decideRequest = async (reqId, action) => {
    setBusyReq(reqId);
    setError('');
    try {
      await api(`/api/spaces/${space.id}/join-requests/${reqId}/${action}`, { method: 'POST' });
      setRequests((prev) => prev.filter((r) => r.id !== reqId));
      if (action === 'approve') await onChanged(); // refresh members
    } catch (e) {
      setError(e.message || 'Failed to update request');
    } finally {
      setBusyReq(null);
    }
  };

  const memberIds = new Set(space.members.map((m) => m.user_id));
  const candidates = directory.filter((u) => !memberIds.has(u.id));

  const addMember = async () => {
    setError('');
    const match = candidates.find((u) => u.name.toLowerCase() === pick.trim().toLowerCase());
    if (!match) { setError('Pick a user from the list'); return; }
    setAdding(true);
    try {
      await api(`/api/spaces/${space.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: match.id }) });
      setPick('');
      await onChanged();
    } catch (e) {
      setError(e.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (userId) => {
    setError('');
    try {
      await api(`/api/spaces/${space.id}/members/${userId}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(e.message || 'Failed to remove member');
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {space.can_administer && requests.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-2 border-b border-amber-200/70 px-4 py-3 dark:border-amber-500/20">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg>
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Join requests</h3>
            <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/25 dark:text-amber-200">{requests.length}</span>
          </div>
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-500/20">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={r.name} src={r.avatar_url} size="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.email}{r.department ? ` · ${r.department}` : ''}</span>
                  {r.message && <span className="mt-0.5 block truncate text-xs italic text-slate-500 dark:text-slate-400">“{r.message}”</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" disabled={busyReq === r.id} onClick={() => decideRequest(r.id, 'approve')} className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-60">Approve</button>
                  <button type="button" disabled={busyReq === r.id} onClick={() => decideRequest(r.id, 'deny')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-rose-600 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800">Deny</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {space.can_administer && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-brand-900 dark:text-slate-100">Add a member</h3>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <UserPicker value={pick} users={candidates} onChange={setPick} placeholder="Search people…" />
            </div>
            <button type="button" className="btn-primary !py-2 text-xs" onClick={addMember} disabled={adding}>{adding ? 'Adding…' : 'Add'}</button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {space.members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3 min-w-0">
                <Avatar name={m.name} src={m.avatar_url} size="h-9 w-9" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{m.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{m.email}</span>
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${m.role === 'owner' ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{m.role}</span>
                {space.can_administer && m.role !== 'owner' && (
                  <button type="button" onClick={() => removeMember(m.user_id)} className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400">Remove</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- Item create/edit modal ---------------- */

function ItemModal({ spaceId, members, item, defaultStatus, defaultDue, onClose, onSaved, onDeleted }) {
  const editing = !!item;
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [type, setType] = useState(item?.type || 'task');
  const [status, setStatus] = useState(item?.status || defaultStatus || 'todo');
  const [priority, setPriority] = useState(item?.priority || 'normal');
  const [assigneeId, setAssigneeId] = useState(item?.assignee_id ? String(item.assignee_id) : '');
  // When created from a calendar day, seed the SLA so the derived due date lands
  // on that day (due_at = today + sla_days). Only works for future days — a clicked
  // today/past day can't be expressed as a positive SLA, so it's left blank.
  const [slaDays, setSlaDays] = useState(() => {
    if (item?.sla_days != null) return String(item.sla_days);
    if (!item && defaultDue) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const target = new Date(`${defaultDue}T00:00:00`);
      const days = Math.round((target.getTime() - today.getTime()) / 86400000);
      if (days >= 1) return String(days);
    }
    return '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Preview the due date the SLA implies (from the item's creation date when
  // editing, otherwise from today for a new item).
  const duePreview = useMemo(() => {
    const n = Number(slaDays);
    if (!Number.isInteger(n) || n < 1) return null;
    const base = item?.created_at ? new Date(item.created_at) : new Date();
    base.setDate(base.getDate() + n);
    return base.toLocaleDateString();
  }, [slaDays, item]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    const body = {
      title: title.trim(), description: description.trim(), type, status, priority,
      assignee_id: assigneeId === '' ? null : Number(assigneeId),
      sla_days: slaDays === '' ? null : Number(slaDays)
    };
    try {
      const saved = editing
        ? await api(`/api/spaces/${spaceId}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api(`/api/spaces/${spaceId}/items`, { method: 'POST', body: JSON.stringify(body) });
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Failed to save item');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${item.item_key}` : 'Create item'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Title</label>
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.filter((t) => t.key !== 'subtask').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="SLA — finish within (days)">
            <input
              className={INPUT}
              type="number"
              min="1"
              max="3650"
              value={slaDays}
              onChange={(e) => setSlaDays(e.target.value)}
              placeholder="No SLA"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {duePreview ? `Due by ${duePreview}` : 'Leave blank for no due date'}
            </p>
          </Field>
        </div>
        <Field label="Description">
          <textarea className={`${INPUT} min-h-[110px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add more detail…" />
        </Field>
        <div className="flex items-center justify-between pt-1">
          {editing ? (
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400" onClick={() => onDeleted(item.id)}>Delete item</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create item'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

// Native select restyled with a custom chevron (appearance-none) so dropdowns
// match the rest of the modernized form controls.
function Select({ value, onChange, children, className = '' }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`${INPUT} cursor-pointer appearance-none pr-9 ${className}`}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

/* ---------------- Space settings (rename / archive / delete) ---------------- */

function SpaceSettingsButton({ space, onDeleted, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description || '');
  const [iconUrl, setIconUrl] = useState(space.icon_url || null);
  const [saving, setSaving] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const iconRef = useRef(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/api/spaces/${space.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), description: description.trim() }) });
      await onUpdated();
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const pickIcon = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIconBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('icon', file);
      const updated = await api(`/api/spaces/${space.id}/icon`, { method: 'POST', body: fd });
      setIconUrl(updated.icon_url);
      await onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to upload icon');
    } finally {
      setIconBusy(false);
    }
  };

  const removeIcon = async () => {
    setIconBusy(true);
    setError('');
    try {
      const updated = await api(`/api/spaces/${space.id}/icon`, { method: 'DELETE' });
      setIconUrl(updated.icon_url);
      await onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to remove icon');
    } finally {
      setIconBusy(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api(`/api/spaces/${space.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err.message || 'Failed to delete');
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => setOpen(true)}>Settings</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Space settings" size="md">
          <form onSubmit={save} className="space-y-4">
            {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Profile icon</label>
              <div className="flex items-center gap-3">
                <input ref={iconRef} type="file" accept="image/*" className="hidden" onChange={pickIcon} />
                {iconUrl ? (
                  <img src={iconUrl} alt="Space icon" className="h-14 w-14 rounded-lg object-cover ring-1 ring-inset ring-black/5" />
                ) : (
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-brand-900 text-sm font-bold tracking-wider text-white dark:bg-brand-600">
                    {space.space_key}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => iconRef.current?.click()} disabled={iconBusy}>
                    {iconBusy ? 'Working…' : iconUrl ? 'Change' : 'Upload icon'}
                  </button>
                  {iconUrl && (
                    <button type="button" className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400" onClick={removeIcon} disabled={iconBusy}>Remove</button>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">PNG, JPEG, GIF, WebP, or HEIC — up to 5 MB. Square works best.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Name</label>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
              <textarea className={`${INPUT} min-h-[90px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400" onClick={() => setConfirmDelete(true)}>Delete this space</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal open onClose={() => !saving && setConfirmDelete(false)} title="Delete space" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-900 dark:text-white">Delete “{space.name}”?</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">This permanently removes the space and all of its items, documents, goals, and members. This cannot be undone.</p>
              </div>
            </div>
            {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={() => setConfirmDelete(false)} disabled={saving}>Cancel</button>
              <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {saving ? 'Deleting…' : 'Delete space'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Item detail (Jira-style two-column) ---------------- */

function ItemDetailModal({ spaceId, members, allItems, itemId, onClose, onChanged, onDeleted }) {
  const me = getUser();
  const [activeId, setActiveId] = useState(itemId);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    api(`/api/spaces/${spaceId}/items/${activeId}`)
      .then((d) => { setDetail(d); setError(''); })
      .catch((e) => setError(e.message || 'Failed to load item'))
      .finally(() => setLoading(false));

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [activeId]);

  const item = detail?.item;

  // Patch the active item, refresh the detail bundle, and let the board resync.
  const patch = async (fields) => {
    await api(`/api/spaces/${spaceId}/items/${activeId}`, { method: 'PATCH', body: JSON.stringify(fields) });
    await load();
    onChanged();
  };

  const addSubtask = async (title) => {
    await api(`/api/spaces/${spaceId}/items`, { method: 'POST', body: JSON.stringify({ title, type: 'subtask', parent_id: activeId }) });
    await load();
    onChanged();
  };
  const patchOther = async (otherId, fields) => {
    await api(`/api/spaces/${spaceId}/items/${otherId}`, { method: 'PATCH', body: JSON.stringify(fields) });
    await load();
    onChanged();
  };
  const addLink = async (linkedId) => {
    await api(`/api/spaces/${spaceId}/items/${activeId}/links`, { method: 'POST', body: JSON.stringify({ linked_item_id: linkedId }) });
    await load();
  };
  const removeLink = async (linkedId) => {
    await api(`/api/spaces/${spaceId}/items/${activeId}/links/${linkedId}`, { method: 'DELETE' });
    await load();
  };
  const addComment = async (body) => {
    await api(`/api/spaces/${spaceId}/items/${activeId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    await load();
  };
  const deleteComment = async (commentId) => {
    await api(`/api/spaces/${spaceId}/items/${activeId}/comments/${commentId}`, { method: 'DELETE' });
    await load();
  };

  return (
    <Modal open onClose={onClose} title={item ? item.item_key : 'Loading…'} size="full">
      {loading && !detail ? (
        <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
      ) : item ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_368px]">
          {/* Left column */}
          <div className="min-w-0 space-y-6">
            {detail.parent && (
              <button type="button" onClick={() => setActiveId(detail.parent.id)} className="group flex items-center gap-1.5 text-xs font-medium text-accent-700 dark:text-accent-300">
                <span className="font-mono underline underline-offset-2 group-hover:text-accent-900 dark:group-hover:text-accent-200">{detail.parent.item_key}</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 group-hover:underline dark:text-slate-400">{detail.parent.title}</span>
              </button>
            )}
            <div>
              <EditableTitle key={`t-${item.id}`} value={item.title} onSave={(v) => patch({ title: v })} />
              <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGE[item.type]}`}>{item.type}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[item.priority]}`}>{item.priority}</span>
                <DueBadge item={item} />
              </div>
            </div>

            <SlaBar item={item} />

            <section>
              <SectionHeading color="text-sky-500">Description</SectionHeading>
              <EditableDescription key={`d-${item.id}`} value={item.description || ''} onSave={(v) => patch({ description: v })} />
            </section>

            <SubtasksSection subtasks={detail.subtasks} onOpen={setActiveId} onAdd={addSubtask} onToggle={(sid, status) => patchOther(sid, { status })} />

            <LinksSection links={detail.links} allItems={allItems} activeId={activeId} onOpen={setActiveId} onAdd={addLink} onRemove={removeLink} />

            <ActivitySection comments={detail.comments} history={detail.history || []} me={me} onAdd={addComment} onDelete={deleteComment} />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <select
                value={item.status}
                onChange={(e) => patch({ status: e.target.value })}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-accent-500 ${STATUS_PILL[item.status]}`}
              >
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-accent-50 via-accent-50/40 to-transparent px-4 py-3 text-sm font-semibold text-brand-900 dark:border-slate-800 dark:from-accent-500/10 dark:text-slate-100">
                <svg className="h-4 w-4 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M3 12h3M18 12h3M12 3v3M12 18v3" />
                </svg>
                Details
              </h3>
              <dl className="space-y-0.5 p-2.5 text-sm">
                <DetailRow label="Assignee" icon="assignee">
                  <div className="flex items-center gap-2">
                    {item.assignee_name && <Avatar name={item.assignee_name} size="h-6 w-6" textClass="text-[10px]" />}
                    <select className={DETAIL_INPUT} value={item.assignee_id || ''} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                    </select>
                  </div>
                </DetailRow>
                <DetailRow label="Type" icon="type">
                  <select className={DETAIL_INPUT} value={item.type} onChange={(e) => patch({ type: e.target.value })}>
                    {/* Subtask is only selectable for items that already are one (created from a parent). */}
                    {TYPES.filter((t) => t.key !== 'subtask' || item.type === 'subtask').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </DetailRow>
                <DetailRow label="Priority" icon="priority">
                  <select className={DETAIL_INPUT} value={item.priority} onChange={(e) => patch({ priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </DetailRow>
                <DetailRow label="Labels" icon="labels">
                  {item.labels?.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1 px-2">
                      {item.labels.map((l) => <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{l}</span>)}
                    </div>
                  )}
                  <InlineText key={`l-${item.id}`} value={(item.labels || []).join(', ')} placeholder="Add labels…" onSave={(v) => patch({ labels: v.split(',') })} />
                </DetailRow>
                <DetailRow label="Parent" icon="parent">
                  <select className={DETAIL_INPUT} value={item.parent_id || ''} onChange={(e) => patch({ parent_id: e.target.value || null })}>
                    <option value="">None</option>
                    {allItems.filter((x) => x.id !== item.id).map((x) => <option key={x.id} value={x.id}>{x.item_key} · {x.title}</option>)}
                  </select>
                </DetailRow>
                <DetailRow label="SLA (days)" icon="sla">
                  <InlineText key={`s-${item.id}`} type="number" value={item.sla_days != null ? String(item.sla_days) : ''} placeholder="None" onSave={(v) => patch({ sla_days: v === '' ? null : Number(v) })} />
                </DetailRow>
                <DetailRow label="Due date" icon="due">
                  <span className="px-2 text-slate-700 dark:text-slate-200">{item.due_at ? formatYmd(item.due_at) : <span className="text-slate-400">None</span>}</span>
                </DetailRow>
                <DetailRow label="Start date" icon="start">
                  <input type="date" className={DETAIL_INPUT} value={item.start_date || ''} onChange={(e) => patch({ start_date: e.target.value || null })} />
                </DetailRow>
                <DetailRow label="Team" icon="team">
                  <InlineText key={`tm-${item.id}`} value={item.team || ''} placeholder="None" onSave={(v) => patch({ team: v })} />
                </DetailRow>
                <DetailRow label="Reporter" icon="reporter">
                  <span className="flex items-center gap-2 px-2 text-slate-700 dark:text-slate-200">
                    <Avatar name={item.reporter_name} size="h-6 w-6" textClass="text-[10px]" />
                    {item.reporter_name}
                  </span>
                </DetailRow>
              </dl>
            </div>

            <div className="px-1 text-[11px] text-slate-400">
              <span>Created {timeAgo(item.created_at)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// Jira-style detail field: looks flat until hovered/focused, so the panel reads
// as a clean list rather than a wall of input boxes.
const DETAIL_INPUT =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-white focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent-500 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:focus:bg-slate-800';

const ROW_ICONS = {
  assignee: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  type: <><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.2" /></>,
  priority: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
  labels: <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>,
  parent: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  sla: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  due: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  start: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><path d="m9 16 2 2 4-4" /></>,
  team: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  reporter: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>
};

function DetailRow({ label, icon, children }) {
  return (
    <div className="grid grid-cols-[116px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {icon && (
          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {ROW_ICONS[icon]}
          </svg>
        )}
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// Text input that commits on blur / Enter (used for inline detail fields).
function InlineText({ value, onSave, placeholder, type = 'text' }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { if (v !== value) onSave(v.trim()); };
  return (
    <input
      type={type}
      className={DETAIL_INPUT}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

function EditableTitle({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value); };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      maxLength={255}
      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold text-brand-900 hover:border-slate-200 focus:border-accent-500 focus:bg-white focus:outline-none dark:text-white dark:hover:border-slate-700 dark:focus:bg-slate-800"
    />
  );
}

function EditableDescription({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { if (v.trim() !== value) onSave(v.trim()); };
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      placeholder="Add a description…"
      className="min-h-[90px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    />
  );
}

function SubtasksSection({ subtasks, onOpen, onAdd, onToggle }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const done = subtasks.filter((s) => s.status === 'done').length;
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(title.trim());
    setTitle('');
    setAdding(false);
  };

  return (
    <section>
      <SectionHeading
        color="text-emerald-500"
        action={(
          <button type="button" onClick={() => setAdding((a) => !a)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Add subtask">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      >
        Subtasks
      </SectionHeading>
      {subtasks.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{pct}% Done</span>
        </div>
      )}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {subtasks.length === 0 && !adding && (
          <li className="px-3 py-2.5 text-xs text-slate-400">No subtasks yet.</li>
        )}
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <button type="button" onClick={() => onOpen(s.id)} className="font-mono text-xs text-accent-700 underline underline-offset-2 hover:text-accent-900 dark:text-accent-300 dark:hover:text-accent-200">{s.item_key}</button>
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{s.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[s.priority]}`}>{s.priority}</span>
            <select value={s.status} onChange={(e) => onToggle(s.id, e.target.value)} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {STATUSES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subtask title" autoFocus />
          <button type="submit" className="btn-primary !py-1.5 text-xs">Add</button>
        </form>
      )}
    </section>
  );
}

function LinksSection({ links, allItems, activeId, onOpen, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const linkedIds = new Set(links.map((l) => l.item.id));
  const options = allItems.filter((x) => x.id !== activeId && !linkedIds.has(x.id));

  const submit = async (e) => {
    e.preventDefault();
    if (!pick) return;
    await onAdd(Number(pick));
    setPick('');
    setAdding(false);
  };

  return (
    <section>
      <SectionHeading
        color="text-violet-500"
        action={(
          <button type="button" onClick={() => setAdding((a) => !a)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Add link">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      >
        Linked work items
      </SectionHeading>
      <ul className="space-y-1">
        {links.length === 0 && !adding && <li className="text-xs text-slate-400">No linked items.</li>}
        {links.map((l) => (
          <li key={l.link_id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <button type="button" onClick={() => onOpen(l.item.id)} className="font-mono text-xs text-accent-700 underline underline-offset-2 hover:text-accent-900 dark:text-accent-300 dark:hover:text-accent-200">{l.item.item_key}</button>
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{l.item.title}</span>
            <span className="text-[10px] uppercase text-slate-400">{labelOf(STATUSES, l.item.status)}</span>
            <button type="button" onClick={() => onRemove(l.item.id)} className="text-slate-400 hover:text-rose-500" aria-label="Remove link">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <select className={INPUT} value={pick} onChange={(e) => setPick(e.target.value)} autoFocus>
            <option value="">Select an item…</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.item_key} · {x.title}</option>)}
          </select>
          <button type="submit" className="btn-primary !py-1.5 text-xs" disabled={!pick}>Link</button>
        </form>
      )}
    </section>
  );
}

const HISTORY_FIELD = {
  title: 'title', description: 'description', type: 'Type', status: 'Status', priority: 'Priority',
  assignee: 'Assignee', sla: 'SLA', start_date: 'Start date', labels: 'Labels', team: 'Team', parent: 'Parent'
};

function ActivitySection({ comments, history, me, onAdd, onDelete }) {
  const [tab, setTab] = useState('comments');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try { await onAdd(body.trim()); setBody(''); } finally { setSaving(false); }
  };

  return (
    <section>
      <SectionHeading color="text-amber-500">Activity</SectionHeading>
      <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {[['comments', `Comments${comments.length ? ` ${comments.length}` : ''}`], ['history', 'History']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${tab === key ? 'bg-white text-brand-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'comments' ? (
        <>
          <form onSubmit={submit} className="mb-4 flex gap-2">
            <Avatar name={me?.name} src={me?.avatar_url} size="h-8 w-8" />
            <div className="flex-1">
              <textarea className={`${INPUT} min-h-[60px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" />
              <div className="mt-1.5 flex justify-end">
                <button type="submit" className="btn-primary !py-1.5 text-xs" disabled={saving || !body.trim()}>{saving ? 'Posting…' : 'Comment'}</button>
              </div>
            </div>
          </form>
          <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {comments.length === 0 && <li className="text-xs text-slate-400">No comments yet.</li>}
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2">
                <Avatar name={c.author_name} src={c.author_avatar} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.author_name}</span>
                    <span className="text-[11px] text-slate-400">{timeAgo(c.created_at)}</span>
                    {me && c.author_id === me.id && (
                      <button type="button" onClick={() => onDelete(c.id)} className="text-[11px] text-slate-400 hover:text-rose-500">Delete</button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {history.length === 0 && <li className="text-xs text-slate-400">No changes recorded yet.</li>}
          {history.map((h) => (
            <li key={h.id} className="flex gap-2">
              <Avatar name={h.actor_name} src={h.actor_avatar} size="h-7 w-7" textClass="text-[10px]" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{h.actor_name}</span> <HistoryText h={h} />
                </span>
                <span className="ml-1.5 text-[11px] text-slate-400">{timeAgo(h.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Colored value chips for the history feed — status/priority values get their
// own tones (keyed by the stored display labels); everything else stays neutral.
const HISTORY_NEUTRAL_CHIP = 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
const HISTORY_STATUS_CHIP = {
  'To Do': HISTORY_NEUTRAL_CHIP,
  'In Progress': 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30',
  'Done': 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
};
const HISTORY_PRIORITY_CHIP = {
  'Low': HISTORY_NEUTRAL_CHIP,
  'Normal': 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  'High': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  'Urgent': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
};
function historyChipClass(field, value) {
  if (field === 'status') return HISTORY_STATUS_CHIP[value] || HISTORY_NEUTRAL_CHIP;
  if (field === 'priority') return HISTORY_PRIORITY_CHIP[value] || HISTORY_NEUTRAL_CHIP;
  return HISTORY_NEUTRAL_CHIP;
}

function HistoryChip({ field, value }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${historyChipClass(field, value)}`}>
      {value || '—'}
    </span>
  );
}

function HistoryText({ h }) {
  if (h.field === 'created') return <>created this item</>;
  if (h.field === 'description') return <>updated the description</>;
  if (h.field === 'title') return <>updated the title</>;
  const label = HISTORY_FIELD[h.field] || h.field;
  return (
    <>
      changed <span className="font-medium">{label}</span> from{' '}
      <HistoryChip field={h.field} value={h.old_value} /> to{' '}
      <HistoryChip field={h.field} value={h.new_value} />
    </>
  );
}

/* ---------------- Calendar ---------------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_DOT = { todo: 'bg-slate-400', in_progress: 'bg-blue-500', done: 'bg-emerald-500' };

// A compact multi-select dropdown with checkboxes. `selected` is an array of
// values; an empty array means "all" (no filter). Closes on outside click.
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (value) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary = selected.length === 0
    ? label
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium transition-colors dark:bg-slate-800 ${
          selected.length
            ? 'border-accent-400 text-accent-700 ring-1 ring-accent-500/30 dark:border-accent-500/50 dark:text-accent-200'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700'
        }`}
      >
        <span className="max-w-[150px] truncate">{summary}</span>
        {selected.length > 1 && (
          <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">{selected.length}</span>
        )}
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/10">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-[11px] font-semibold text-accent-700 hover:text-accent-900 dark:text-accent-300">Clear</button>
            )}
          </div>
          <ul className="scrollbar-pretty max-h-64 space-y-0.5 overflow-y-auto">
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-accent-500 bg-accent-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {checked && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Filter items by assignee / type / status. Each filter is an array of selected
// values; an empty array means "all". 'unassigned' is a special assignee value.
function applyItemFilters(items, { assignees = [], types = [], statuses = [] }) {
  return items.filter((it) => {
    if (types.length && !types.includes(it.type)) return false;
    if (statuses.length && !statuses.includes(it.status)) return false;
    if (assignees.length) {
      const match = assignees.some((a) =>
        a === 'unassigned' ? !it.assignee_id : String(it.assignee_id) === String(a)
      );
      if (!match) return false;
    }
    return true;
  });
}

function ItemFilters({ items, filters, onChange }) {
  const assigneeOptions = useMemo(() => {
    const m = new Map();
    for (const it of items) if (it.assignee_id) m.set(it.assignee_id, it.assignee_name);
    return [
      { value: 'unassigned', label: 'Unassigned' },
      ...[...m.entries()].map(([id, name]) => ({ value: String(id), label: name }))
    ];
  }, [items]);
  const typeOptions = TYPES.map((t) => ({ value: t.key, label: t.label }));
  const statusOptions = STATUSES.map((s) => ({ value: s.key, label: s.label }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect label="All assignees" options={assigneeOptions} selected={filters.assignees} onChange={(v) => onChange({ ...filters, assignees: v })} />
      <MultiSelect label="All types" options={typeOptions} selected={filters.types} onChange={(v) => onChange({ ...filters, types: v })} />
      <MultiSelect label="All statuses" options={statusOptions} selected={filters.statuses} onChange={(v) => onChange({ ...filters, statuses: v })} />
    </div>
  );
}

// Status colour for calendar event pills (left bar + dot).
const CAL_EVENT = {
  todo: 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  in_progress: 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20',
  done: 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20'
};

// Short relative label for a YYYY-MM-DD due date (Today / Tomorrow / Mon, Jun 9).
function relativeDue(ymd) {
  const d = ymdToLocal(ymd); if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function CalendarView({ items, onOpen, onCreate }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [filters, setFilters] = useState({ assignees: [], types: [], statuses: [] });

  const filtered = useMemo(() => applyItemFilters(items, filters), [items, filters]);

  // Group filtered items by due date (YYYY-MM-DD).
  const byDay = useMemo(() => {
    const map = {};
    for (const it of filtered) {
      if (!it.due_at) continue;
      (map[it.due_at] ||= []).push(it);
    }
    return map;
  }, [filtered]);

  const todayYmd = toYmd(new Date());

  // Upcoming + overdue tasks (open items with a due date), soonest first.
  const upcoming = useMemo(() =>
    filtered
      .filter((it) => it.due_at && it.status !== 'done')
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
      .slice(0, 30),
    [filtered]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const gridStart = new Date(cursor); gridStart.setDate(1 - cursor.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Calendar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-900 dark:text-white">{monthLabel}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <ItemFilters items={items} filters={filters} onChange={setFilters} />
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button type="button" aria-label="Previous month" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })} className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800">‹</button>
              <button type="button" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }} className="border-x border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Today</button>
              <button type="button" aria-label="Next month" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })} className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800">›</button>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
            {WEEKDAYS.map((w) => <div key={w} className="py-2.5">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const ymd = toYmd(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = ymd === todayYmd;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const dayItems = byDay[ymd] || [];
              return (
                <div
                  key={i}
                  onClick={() => onCreate(ymd)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCreate(ymd); } }}
                  title="Add a task on this day"
                  className={`group relative min-h-[104px] cursor-pointer border-b border-r border-slate-200 p-1.5 transition-colors last:border-r-0 hover:bg-accent-50 dark:border-slate-800 dark:hover:bg-accent-500/5 ${
                    !inMonth ? 'bg-slate-100/80 dark:bg-slate-950/40' : isWeekend ? 'bg-slate-50/80 dark:bg-slate-900/40' : ''
                  } ${isToday ? 'ring-2 ring-inset ring-accent-500 dark:ring-accent-400' : ''}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <svg className="h-4 w-4 text-accent-500 opacity-0 transition-opacity group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {isToday ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-xs font-bold text-white shadow-sm">{d.getDate()}</span>
                    ) : (
                      <span className={`inline-flex h-6 w-6 items-center justify-center text-xs font-medium ${inMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>{d.getDate()}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpen(it); }}
                        title={it.title}
                        className={`flex w-full items-center gap-1.5 truncate rounded-md border-l-2 px-1.5 py-1 text-left text-[11px] font-medium transition-colors ${CAL_EVENT[it.status]}`}
                      >
                        <span className="truncate">{it.title}</span>
                      </button>
                    ))}
                    {dayItems.length > 3 && <div className="px-1 text-[10px] font-medium text-slate-400">+{dayItems.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-slate-400">Items are placed on their <span className="font-medium">due date</span>. Click any day to add a task due then.</p>
      </div>

      {/* Upcoming Tasks */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-white">
              <svg className="h-4 w-4 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              Upcoming Tasks
            </h3>
            {upcoming.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{upcoming.length}</span>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              </span>
              <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming due dates.</p>
            </div>
          ) : (
            <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {upcoming.map((it) => {
                const overdue = it.due_at < todayYmd;
                return (
                  <li key={it.id}>
                    <button type="button" onClick={() => onOpen(it)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[it.status]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-brand-900 dark:text-slate-100">{it.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                          <span className={`inline-flex items-center gap-1 font-semibold ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                            {overdue ? `Overdue · ${relativeDue(it.due_at)}` : relativeDue(it.due_at)}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_BADGE[it.priority]}`}>{labelOf(PRIORITIES, it.priority)}</span>
                        </span>
                      </span>
                      {it.assignee_name && (
                        <Avatar name={it.assignee_name} src={it.assignee_avatar} size="h-6 w-6" textClass="text-[10px]" className="mt-0.5 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Documents ---------------- */

// Map a document mime type to a tinted file-type chip.
function docKind(mime = '') {
  if (mime === 'application/pdf') return { label: 'PDF', tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' };
  if (mime.startsWith('image/')) return { label: 'IMG', tone: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300' };
  if (mime.includes('spreadsheet') || mime.includes('ms-excel') || mime === 'text/csv') return { label: 'XLS', tone: 'bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300' };
  if (mime.includes('word') || mime.includes('document')) return { label: 'DOC', tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' };
  if (mime.includes('presentation') || mime.includes('powerpoint')) return { label: 'PPT', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' };
  if (mime === 'application/zip') return { label: 'ZIP', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  return { label: 'FILE', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function DocumentsView({ spaceId, canManage }) {
  const me = getUser();
  const fileRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    api(`/api/spaces/${spaceId}/docs`).then((d) => { setDocs(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [spaceId]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const saved = await api(`/api/spaces/${spaceId}/docs`, { method: 'POST', body: fd });
      setDocs((prev) => [saved, ...prev]);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    setBusyId(docId);
    setError('');
    try {
      await api(`/api/spaces/${spaceId}/docs/${docId}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-white">Documents</h2>
        <button type="button" className="btn-primary !py-2 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <>
              <svg className="h-4 w-4 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
              Uploading…
            </>
          ) : (
            <>
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              Upload document
            </>
          )}
        </button>
      </div>
      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
      ) : error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
      ) : docs.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="block w-full rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center transition hover:border-accent-400 hover:bg-accent-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-accent-500/40"
        >
          <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          </span>
          <h3 className="text-base font-semibold text-brand-900 dark:text-white">No documents yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload PDFs, specs, spreadsheets, or images for this space.</p>
        </button>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {docs.map((d) => {
            const kind = docKind(d.mime);
            const canDelete = canManage || (me && d.author_id === me.id);
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <a href={d.file_path || '#'} download={d.file_name || d.title} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide ${kind.tone}`}>
                    {kind.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-brand-900 dark:text-slate-100">{d.title}</span>
                    <span className="block text-xs text-slate-400">
                      {d.size != null && <>{formatBytes(d.size)} · </>}{d.author_name} · {timeAgo(d.updated_at)}
                    </span>
                  </span>
                </a>
                <a href={d.file_path || '#'} download={d.file_name || d.title} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-accent-600 dark:hover:bg-slate-700" title="Download" aria-label="Download">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                </a>
                {canDelete && (
                  <button type="button" onClick={() => remove(d.id)} disabled={busyId === d.id} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10" title="Delete" aria-label="Delete">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
