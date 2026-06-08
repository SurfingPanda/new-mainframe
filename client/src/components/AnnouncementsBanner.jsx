import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/auth.js';
import Modal from './Modal.jsx';

const INPUT =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const DISMISS_KEY = 'mf_dismissed_announcements';

// Per-type styling + icon for the banner.
const TYPE_STYLE = {
  maintenance: {
    label: 'Maintenance',
    wrap: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-300',
    title: 'text-amber-900 dark:text-amber-200',
    body: 'text-amber-800/90 dark:text-amber-200/80',
    path: 'M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 1 5-5l-2.1-2.1z'
  },
  warning: {
    label: 'Important',
    wrap: 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10',
    icon: 'text-rose-600 dark:text-rose-300',
    title: 'text-rose-900 dark:text-rose-200',
    body: 'text-rose-800/90 dark:text-rose-200/80',
    path: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'
  },
  info: {
    label: 'Notice',
    wrap: 'border-brand-200 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10',
    icon: 'text-brand-600 dark:text-brand-300',
    title: 'text-brand-900 dark:text-brand-100',
    body: 'text-brand-800/90 dark:text-brand-100/80',
    path: 'M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
  }
};

// Parse a naive DATETIME ("YYYY-MM-DD HH:MM:SS") as local time (avoids the
// UTC drift you'd get from new Date() on a space-separated string).
function parseDT(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v));
  if (!m) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}
const isUpcoming = (a) => { const s = parseDT(a.starts_at); return s && s > new Date(); };
const hasEnded = (a) => { const e = parseDT(a.ends_at); return e && e < new Date(); };

function fmtRange(a) {
  const fmt = (v) => { const d = parseDT(v); return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  if (a.starts_at && a.ends_at) return `${fmt(a.starts_at)} – ${fmt(a.ends_at)}`;
  if (a.starts_at) return `From ${fmt(a.starts_at)}`;
  if (a.ends_at) return `Until ${fmt(a.ends_at)}`;
  return '';
}

function loadDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || {}; }
  catch { return {}; }
}

export default function AnnouncementsBanner({ canManage = false }) {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [manageOpen, setManageOpen] = useState(false);

  // Managers also pull scheduled/hidden ones so they can preview what they
  // posted; everyone else gets only the currently-live set from the server.
  const load = () => {
    api(canManage ? '/api/announcements?all=1' : '/api/announcements')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  };
  useEffect(load, [canManage]);

  const dismiss = (a) => {
    const next = { ...dismissed, [a.id]: a.updated_at };
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  };

  // Managers see active announcements that haven't ended (incl. upcoming),
  // flagged below. Everyone else gets the server's live set, minus dismissals.
  const visible = useMemo(
    () => (canManage
      ? items.filter((a) => a.is_active && !hasEnded(a))
      : items.filter((a) => dismissed[a.id] !== a.updated_at)),
    [items, dismissed, canManage]
  );

  if (!visible.length && !canManage) return null;

  return (
    <section className="space-y-3">
      {canManage && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Announcements</span>
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setManageOpen(true)}>
            <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
            Manage announcements
          </button>
        </div>
      )}

      {visible.map((a) => {
        const s = TYPE_STYLE[a.type] || TYPE_STYLE.info;
        const range = fmtRange(a);
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${s.wrap}`}>
            <svg className={`mt-0.5 h-5 w-5 shrink-0 ${s.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.path} /></svg>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${s.icon}`}>{s.label}</span>
                {isUpcoming(a) && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-black/5 dark:bg-slate-800/70 dark:text-slate-300">Scheduled</span>}
                <h3 className={`text-sm font-semibold ${s.title}`}>{a.title}</h3>
              </div>
              {a.body && <p className={`mt-0.5 whitespace-pre-line text-sm ${s.body}`}>{a.body}</p>}
              {range && (
                <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${s.body}`}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  {range}
                </p>
              )}
            </div>
            {!canManage && (
              <button type="button" onClick={() => dismiss(a)} aria-label="Dismiss" className={`shrink-0 rounded p-1 ${s.icon} hover:bg-black/5 dark:hover:bg-white/10`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        );
      })}

      {manageOpen && (
        <ManageAnnouncements
          onClose={() => setManageOpen(false)}
          onChanged={load}
        />
      )}
    </section>
  );
}

function ManageAnnouncements({ onClose, onChanged }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // announcement | 'new' | null

  const load = () => {
    setLoading(true);
    api('/api/announcements?all=1')
      .then((d) => { setList(Array.isArray(d) ? d : []); setError(''); })
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api(`/api/announcements/${id}`, { method: 'DELETE' });
      setList((prev) => prev.filter((a) => a.id !== id));
      onChanged();
    } catch (e) { setError(e.message || 'Failed to delete'); }
  };

  if (editing) {
    return (
      <AnnouncementEditor
        announcement={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); onChanged(); }}
      />
    );
  }

  return (
    <Modal open onClose={onClose} title="Announcements" size="lg">
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" className="btn-primary !px-3.5 !py-2 text-xs" onClick={() => setEditing('new')}>
            <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New announcement
          </button>
        </div>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No announcements yet. Post one to notify everyone of maintenance or downtime.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {list.map((a) => {
              const s = TYPE_STYLE[a.type] || TYPE_STYLE.info;
              return (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${s.wrap} ${s.icon}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.path} /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-brand-900 dark:text-slate-100">{a.title}</span>
                      {!a.is_active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">Hidden</span>}
                    </div>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400 capitalize">{a.type}{fmtRange(a) ? ` · ${fmtRange(a)}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => setEditing(a)} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700" aria-label="Edit">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button type="button" onClick={() => remove(a.id)} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

// Convert a stored DATETIME ("YYYY-MM-DD HH:MM:SS" or ISO) to the value a
// datetime-local input expects ("YYYY-MM-DDTHH:MM").
function toLocalInput(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
}

function AnnouncementEditor({ announcement, onCancel, onSaved }) {
  const editing = !!announcement;
  const [title, setTitle] = useState(announcement?.title || '');
  const [body, setBody] = useState(announcement?.body || '');
  const [type, setType] = useState(announcement?.type || 'maintenance');
  const [startsAt, setStartsAt] = useState(toLocalInput(announcement?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(announcement?.ends_at));
  const [isActive, setIsActive] = useState(announcement ? announcement.is_active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      type,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      is_active: isActive
    };
    try {
      if (editing) await api(`/api/announcements/${announcement.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onCancel} title={editing ? 'Edit announcement' : 'New announcement'} size="md">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Title</label>
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance this weekend" maxLength={160} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Message</label>
          <textarea className={`${INPUT} min-h-[90px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's happening, and how it affects users." maxLength={4000} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Type</label>
            <select className={INPUT} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="maintenance">Maintenance</option>
              <option value="warning">Important</option>
              <option value="info">Notice</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Starts <span className="font-normal text-slate-400">(optional)</span></label>
            <input type="datetime-local" className={INPUT} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Ends <span className="font-normal text-slate-400">(optional)</span></label>
            <input type="datetime-local" className={INPUT} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
          Show this announcement to users
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Post announcement'}</button>
        </div>
      </form>
    </Modal>
  );
}
