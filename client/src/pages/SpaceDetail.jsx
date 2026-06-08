import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import Avatar from '../components/Avatar.jsx';
import UserPicker from '../components/UserPicker.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
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
const TABS = ['summary', 'board', 'list', 'calendar', 'timeline', 'goals', 'documents', 'members'];

const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const labelOf = (list, key) => list.find((x) => x.key === key)?.label || key;

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
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-900 text-xs font-bold tracking-wider text-white dark:bg-brand-600">
              {space.space_key}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{space.name}</h1>
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

        {tab === 'summary' && <Summary items={items} />}
        {tab === 'board' && (
          <Board items={items} onMove={moveItem} onOpen={(item) => setItemModal({ item })} onCreate={(status) => setItemModal({ status })} />
        )}
        {tab === 'list' && <ListView items={items} onOpen={(item) => setItemModal({ item })} />}
        {tab === 'calendar' && <CalendarView items={items} onOpen={(item) => setItemModal({ item })} />}
        {tab === 'timeline' && <TimelineView items={items} onOpen={(item) => setItemModal({ item })} />}
        {tab === 'goals' && <GoalsView spaceId={id} />}
        {tab === 'documents' && <DocumentsView spaceId={id} />}
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
          onClose={() => setItemModal(null)}
          onSaved={(saved) => { setItems((prev) => [...prev, saved]); setItemModal(null); }}
        />
      )}
    </div>
  );
}

/* ---------------- Summary ---------------- */

function Summary({ items }) {
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
    { label: 'Completed (7d)', value: stats.completed },
    { label: 'Updated (7d)', value: stats.updated },
    { label: 'Created (7d)', value: stats.created },
    { label: 'Total items', value: stats.total }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-3xl font-bold text-brand-900 dark:text-white">{c.value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Status overview">
          <ChartDoughnut labels={STATUSES.map((s) => s.label)} values={stats.byStatus} colors={STATUSES.map((s) => s.color)} emptyLabel="No items yet" />
        </Panel>
        <Panel title="Priority breakdown">
          <ChartBar labels={PRIORITIES.map((p) => p.label)} values={stats.byPriority} color="#3f5b95" emptyLabel="No items yet" />
        </Panel>
        <Panel title="Types of work">
          <ChartBar labels={TYPES.map((t) => t.label)} values={stats.byType} color="#7c3aed" horizontal emptyLabel="No items yet" />
        </Panel>
        <Panel title="Recent activity">
          {recent.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">No activity yet</div>
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

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-semibold text-brand-900 dark:text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

/* ---------------- Board ---------------- */

function Board({ items, onMove, onOpen, onCreate }) {
  const [dragId, setDragId] = useState(null);
  // Subtasks live inside their parent's detail modal, not on the board.
  const boardItems = items.filter((i) => i.type !== 'subtask');

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STATUSES.map((col) => {
        const colItems = boardItems.filter((i) => i.status === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const itemId = Number(e.dataTransfer.getData('text/plain')); if (itemId) onMove(itemId, col.key); setDragId(null); }}
            className="flex flex-col rounded-xl border border-slate-200 bg-slate-100/60 p-3 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                {col.label}
                <span className="text-slate-400">{colItems.length}</span>
              </span>
              <button type="button" onClick={() => onCreate(col.key)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`Add to ${col.label}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            <div className="flex min-h-[80px] flex-1 flex-col gap-2">
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
    <div className={`rounded-xl border px-3.5 py-3 ${t.wrap}`}>
      <div className="flex items-center gap-2.5">
        <svg className={`h-5 w-5 shrink-0 ${t.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {icon === 'check' && <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>}
          {icon === 'alert' && <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>}
          {icon === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-semibold ${t.text}`}>{label}</span>
            {item.sla_days != null && <span className={`shrink-0 text-[11px] font-medium ${t.sub}`}>{plural(item.sla_days)} SLA</span>}
          </div>
          <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${t.track}`}>
            <div className={`h-full rounded-full ${t.bar} transition-[width]`} style={{ width: `${fill}%` }} />
          </div>
          <div className={`mt-1 text-[11px] font-medium ${t.sub}`}>{detail}</div>
        </div>
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
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-2.5">Key</th>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Priority</th>
              <th className="px-4 py-2.5">Assignee</th>
              <th className="px-4 py-2.5">Due</th>
              <th className="px-4 py-2.5">Updated</th>
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
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{labelOf(STATUSES, i.status)}</td>
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

  useEffect(() => { api('/api/users/directory').then(setDirectory).catch(() => setDirectory([])); }, []);

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

function ItemModal({ spaceId, members, item, defaultStatus, onClose, onSaved, onDeleted }) {
  const editing = !!item;
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [type, setType] = useState(item?.type || 'task');
  const [status, setStatus] = useState(item?.status || defaultStatus || 'todo');
  const [priority, setPriority] = useState(item?.priority || 'normal');
  const [assigneeId, setAssigneeId] = useState(item?.assignee_id ? String(item.assignee_id) : '');
  const [slaDays, setSlaDays] = useState(item?.sla_days != null ? String(item.sla_days) : '');
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
            <select className={INPUT} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.filter((t) => t.key !== 'subtask').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={INPUT} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee">
            <select className={INPUT} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
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

/* ---------------- Space settings (rename / archive / delete) ---------------- */

function SpaceSettingsButton({ space, onDeleted, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

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
            {confirmDelete ? (
              <div className="rounded-md bg-rose-50 p-3 dark:bg-rose-500/10">
                <p className="text-sm text-rose-700 dark:text-rose-300">Delete this space and all its items? This cannot be undone.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete space</button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400" onClick={() => setConfirmDelete(true)}>Delete this space</button>
            )}
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
              <button type="button" onClick={() => setActiveId(detail.parent.id)} className="flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline">
                <span className="font-mono">{detail.parent.item_key}</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500">{detail.parent.title}</span>
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
            <button type="button" onClick={() => onOpen(s.id)} className="font-mono text-xs text-accent-700 hover:underline">{s.item_key}</button>
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
            <button type="button" onClick={() => onOpen(l.item.id)} className="font-mono text-xs text-accent-700 hover:underline">{l.item.item_key}</button>
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

function HistoryText({ h }) {
  if (h.field === 'created') return <>created this item</>;
  if (h.field === 'description') return <>updated the description</>;
  if (h.field === 'title') return <>updated the title</>;
  const label = HISTORY_FIELD[h.field] || h.field;
  return (
    <>
      changed <span className="font-medium">{label}</span> from{' '}
      <span className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{h.old_value || '—'}</span> to{' '}
      <span className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{h.new_value || '—'}</span>
    </>
  );
}

/* ---------------- Calendar ---------------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_DOT = { todo: 'bg-slate-400', in_progress: 'bg-blue-500', done: 'bg-emerald-500' };

const FILTER_SELECT =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

// Filter items by assignee / type / status (shared by Calendar & Timeline).
function applyItemFilters(items, { assignee, type, status }) {
  return items.filter((it) => {
    if (type !== 'all' && it.type !== type) return false;
    if (status !== 'all' && it.status !== status) return false;
    if (assignee === 'unassigned') return !it.assignee_id;
    if (assignee !== 'all' && String(it.assignee_id) !== String(assignee)) return false;
    return true;
  });
}

function ItemFilters({ items, filters, onChange }) {
  const assignees = useMemo(() => {
    const m = new Map();
    for (const it of items) if (it.assignee_id) m.set(it.assignee_id, it.assignee_name);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select className={FILTER_SELECT} value={filters.assignee} onChange={set('assignee')} aria-label="Filter by assignee">
        <option value="all">All assignees</option>
        <option value="unassigned">Unassigned</option>
        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={FILTER_SELECT} value={filters.type} onChange={set('type')} aria-label="Filter by type">
        <option value="all">All types</option>
        {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <select className={FILTER_SELECT} value={filters.status} onChange={set('status')} aria-label="Filter by status">
        <option value="all">All statuses</option>
        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </div>
  );
}

function CalendarView({ items, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [filters, setFilters] = useState({ assignee: 'all', type: 'all', status: 'all' });

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

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const gridStart = new Date(cursor); gridStart.setDate(1 - cursor.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const todayYmd = toYmd(new Date());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-white">{monthLabel}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ItemFilters items={items} filters={filters} onChange={setFilters} />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })} className="btn-secondary !px-2.5 !py-1.5 text-xs">‹</button>
            <button type="button" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }} className="btn-secondary !px-3 !py-1.5 text-xs">Today</button>
            <button type="button" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })} className="btn-secondary !px-2.5 !py-1.5 text-xs">›</button>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
          {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const ymd = toYmd(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const dayItems = byDay[ymd] || [];
            return (
              <div key={i} className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 dark:border-slate-800 ${inMonth ? '' : 'bg-slate-50/60 dark:bg-slate-950/40'}`}>
                <div className={`mb-1 text-right text-xs ${ymd === todayYmd ? 'font-bold text-accent-600' : inMonth ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>
                  {ymd === todayYmd ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white">{d.getDate()}</span> : d.getDate()}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <button key={it.id} type="button" onClick={() => onOpen(it)} className="flex w-full items-center gap-1 truncate rounded bg-slate-100 px-1.5 py-0.5 text-left text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[it.status]}`} />
                      <span className="truncate">{it.title}</span>
                    </button>
                  ))}
                  {dayItems.length > 3 && <div className="px-1 text-[10px] text-slate-400">+{dayItems.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">Items are placed on their <span className="font-medium">due date</span>. Set an SLA on an item to give it one.</p>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

const STATUS_BAR = { todo: 'bg-slate-400', in_progress: 'bg-blue-500', done: 'bg-emerald-500' };

function TimelineView({ items, onOpen }) {
  const [filters, setFilters] = useState({ assignee: 'all', type: 'all', status: 'all' });
  const filtered = useMemo(() => applyItemFilters(items, filters), [items, filters]);

  const rows = useMemo(() => filtered
    .map((it) => {
      const s = ymdToLocal(it.start_date) || ymdToLocal(it.due_at);
      const e = ymdToLocal(it.due_at) || ymdToLocal(it.start_date);
      if (!s || !e) return null;
      return { it, start: s < e ? s : e, end: e > s ? e : s };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start), [filtered]);

  const range = useMemo(() => {
    if (!rows.length) return null;
    let min = rows[0].start, max = rows[0].end;
    for (const r of rows) { if (r.start < min) min = r.start; if (r.end > max) max = r.end; }
    // pad a few days each side
    min = new Date(min); min.setDate(min.getDate() - 2);
    max = new Date(max); max.setDate(max.getDate() + 2);
    return { min, max, span: Math.max(1, (max - min) / 86400000) };
  }, [rows]);

  // Month gridlines across the range.
  const months = useMemo(() => {
    if (!range) return [];
    const out = [];
    const d = new Date(range.min.getFullYear(), range.min.getMonth(), 1);
    while (d <= range.max) {
      const left = Math.max(0, ((d - range.min) / 86400000 / range.span) * 100);
      out.push({ left, label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [range]);

  const pct = (d) => range ? ((d - range.min) / 86400000 / range.span) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-white">Timeline</h2>
        <ItemFilters items={items} filters={filters} onChange={setFilters} />
      </div>
      {!rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No items match — or none have a start or due date yet. Add an SLA (due date) or a start date to see them on the timeline.
        </div>
      ) : (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-[640px]">
        {/* Month header */}
        <div className="relative mb-2 ml-48 h-5 border-b border-slate-100 dark:border-slate-800">
          {months.map((m, i) => (
            <span key={i} className="absolute -top-0 text-[10px] font-medium text-slate-400" style={{ left: `${m.left}%` }}>{m.label}</span>
          ))}
        </div>
        <div className="space-y-1.5">
          {rows.map(({ it, start, end }) => {
            const left = pct(start);
            const width = Math.max(1.5, pct(end) - left);
            return (
              <div key={it.id} className="flex items-center gap-2">
                <button type="button" onClick={() => onOpen(it)} className="w-44 shrink-0 truncate text-left text-xs text-slate-700 hover:text-accent-700 dark:text-slate-200">
                  <span className="font-mono text-[10px] text-slate-400">{it.item_key}</span> {it.title}
                </button>
                <div className="relative h-6 flex-1">
                  {months.map((m, i) => (
                    <span key={i} className="absolute top-0 h-full w-px bg-slate-100 dark:bg-slate-800" style={{ left: `${m.left}%` }} />
                  ))}
                  <button
                    type="button"
                    onClick={() => onOpen(it)}
                    title={`${toYmd(start)} → ${toYmd(end)}`}
                    className={`absolute top-1 h-4 rounded ${STATUS_BAR[it.status]} opacity-90 hover:opacity-100`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
      )}
    </div>
  );
}

/* ---------------- Goals ---------------- */

const GOAL_STATUS = {
  on_track: { label: 'On track', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', bar: 'bg-emerald-500' },
  at_risk: { label: 'At risk', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', bar: 'bg-amber-500' },
  off_track: { label: 'Off track', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', bar: 'bg-rose-500' },
  done: { label: 'Done', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', bar: 'bg-sky-500' }
};
const GOAL_STATUS_KEYS = Object.keys(GOAL_STATUS);

function GoalsView({ spaceId }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { goal } | {} | null

  const load = () => {
    setLoading(true);
    api(`/api/spaces/${spaceId}/goals`).then((d) => { setGoals(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [spaceId]);

  const remove = async (goalId) => { await api(`/api/spaces/${spaceId}/goals/${goalId}`, { method: 'DELETE' }); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-white">Goals</h2>
        <button type="button" className="btn-primary !py-2 text-xs" onClick={() => setModal({})}>
          <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New goal
        </button>
      </div>
      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
      ) : error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
      ) : goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-brand-900 dark:text-white">No goals yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track objectives for this space and their progress.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => {
            const st = GOAL_STATUS[g.status] || GOAL_STATUS.on_track;
            return (
              <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-brand-900 dark:text-white">{g.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st.cls}`}>{st.label}</span>
                </div>
                {g.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{g.description}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${g.progress}%` }} />
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{g.progress}%</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{g.target_date ? `Target ${formatYmd(g.target_date)}` : 'No target date'}</span>
                  <span className="flex gap-2">
                    <button type="button" className="font-semibold text-slate-500 hover:text-accent-700 dark:text-slate-300" onClick={() => setModal({ goal: g })}>Edit</button>
                    <button type="button" className="font-semibold text-rose-500 hover:underline" onClick={() => remove(g.id)}>Delete</button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <GoalModal spaceId={spaceId} goal={modal.goal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function GoalModal({ spaceId, goal, onClose, onSaved }) {
  const editing = !!goal;
  const [title, setTitle] = useState(goal?.title || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [status, setStatus] = useState(goal?.status || 'on_track');
  const [progress, setProgress] = useState(goal?.progress != null ? String(goal.progress) : '0');
  const [targetDate, setTargetDate] = useState(goal?.target_date || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    const body = { title: title.trim(), description: description.trim(), status, progress: Number(progress) || 0, target_date: targetDate || null };
    try {
      if (editing) await api(`/api/spaces/${spaceId}/goals/${goal.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api(`/api/spaces/${spaceId}/goals`, { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save goal');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit goal' : 'New goal'} size="md">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <Field label="Title"><input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus /></Field>
        <Field label="Description"><textarea className={`${INPUT} min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {GOAL_STATUS_KEYS.map((k) => <option key={k} value={k}>{GOAL_STATUS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Progress %"><input className={INPUT} type="number" min="0" max="100" value={progress} onChange={(e) => setProgress(e.target.value)} /></Field>
          <Field label="Target date"><input className={INPUT} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Create goal'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Documents ---------------- */

function DocumentsView({ spaceId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id } existing | 'new' | null

  const load = () => {
    setLoading(true);
    api(`/api/spaces/${spaceId}/docs`).then((d) => { setDocs(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [spaceId]);

  if (editing) {
    return <DocEditor spaceId={spaceId} docId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-white">Documents</h2>
        <button type="button" className="btn-primary !py-2 text-xs" onClick={() => setEditing('new')}>
          <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New document
        </button>
      </div>
      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
      ) : error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-brand-900 dark:text-white">No documents yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Write notes, specs, or meeting minutes in Markdown.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setEditing(d.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <svg className="h-5 w-5 shrink-0 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-brand-900 dark:text-slate-100">{d.title}</span>
                  <span className="block text-xs text-slate-400">{d.author_name} · updated {timeAgo(d.updated_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocEditor({ spaceId, docId, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(!!docId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!docId) return;
    api(`/api/spaces/${spaceId}/docs/${docId}`)
      .then((d) => { setTitle(d.title); setBody(d.body || ''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [spaceId, docId]);

  const save = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    const payload = { title: title.trim(), body };
    try {
      if (docId) await api(`/api/spaces/${spaceId}/docs/${docId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api(`/api/spaces/${spaceId}/docs`, { method: 'POST', body: JSON.stringify(payload) });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!docId) return;
    setSaving(true);
    try { await api(`/api/spaces/${spaceId}/docs/${docId}`, { method: 'DELETE' }); onSaved(); }
    catch (err) { setError(err.message || 'Failed to delete'); setSaving(false); }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-white dark:bg-slate-900" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="btn-secondary !px-3 !py-1.5 text-xs">← Back</button>
        <div className="ml-auto flex gap-2">
          {docId && <button type="button" onClick={remove} disabled={saving} className="text-xs font-semibold text-rose-600 hover:underline">Delete</button>}
          <button type="button" onClick={save} disabled={saving} className="btn-primary !px-3.5 !py-1.5 text-xs">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
      <input className={`${INPUT} text-lg font-semibold`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" maxLength={200} />
      <MarkdownEditor value={body} onChange={setBody} minRows={14} />
    </div>
  );
}
