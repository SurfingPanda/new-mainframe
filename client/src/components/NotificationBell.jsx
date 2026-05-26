import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/auth.js';

const POLL_MS = 45_000;

function timeAgo(value) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(value).toLocaleDateString();
}

function dotColor(kind) {
  switch (kind) {
    case 'assigned': return 'bg-accent-500';
    case 'password_reset': return 'bg-rose-500';
    default: return 'bg-brand-500';
  }
}

const bellPath = (
  <>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </>
);

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();

  const load = async () => {
    try {
      const data = await api('/api/notifications');
      setItems(Array.isArray(data.items) ? data.items : []);
      setCount(Number(data.count) || 0);
    } catch {
      // A failed poll must never break the header — keep the last good state.
    } finally {
      setLoading(false);
    }
  };

  // Initial load + background polling + refresh when the tab regains focus.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    // Opening the panel clears the unread badge; items keep their "New" mark
    // for this view so the user can still see what changed.
    if (next && count > 0) {
      setCount(0);
      try {
        await api('/api/notifications/seen', { method: 'POST' });
      } catch {
        // ignore — the next poll will reconcile
      }
    }
  };

  const hasUnread = items.some((n) => n.unread) || count > 0;

  const markAllRead = async () => {
    setCount(0);
    setItems((prev) => prev.map((n) => (n.unread ? { ...n, unread: false } : n)));
    try {
      await api('/api/notifications/seen', { method: 'POST' });
    } catch {
      // ignore — the next poll will reconcile
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
          open
            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
        }`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {bellPath}
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 origin-top-right rounded-xl border border-slate-200 bg-white shadow-elevated ring-1 ring-black/5 overflow-hidden dark:bg-slate-900 dark:border-slate-700 dark:ring-white/5"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!hasUnread}
              className="text-xs font-semibold text-accent-700 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed dark:text-accent-400 dark:disabled:text-slate-500"
            >
              Mark all as read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {bellPath}
                  </svg>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">You're all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((n) => {
                  const to = n.link || (n.ticketId ? `/tickets/${n.ticketId}` : '#');
                  const subtitle = n.subtitle || (n.ticketId ? `#${n.ticketId} · ${n.ticketTitle}` : null);
                  return (
                    <li key={n.id}>
                      <Link
                        to={to}
                        onClick={() => setOpen(false)}
                        className={`flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                          n.unread ? 'bg-accent-50/50 dark:bg-accent-500/5' : ''
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor(n.kind)} ${n.unread ? '' : 'opacity-30'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-800 dark:text-slate-100">{n.message}</span>
                          {subtitle && (
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {subtitle}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        {n.unread && (
                          <span className="mt-0.5 inline-flex h-fit items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
                            New
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
