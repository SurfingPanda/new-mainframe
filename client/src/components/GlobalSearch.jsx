import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, getUser, hasPermission } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';
import Avatar from './Avatar.jsx';

// ⌘K / Ctrl+K command palette. A header trigger opens an overlay that searches
// across modules via /api/search (each group already permission-gated server-side).
const DEBOUNCE_MS = 200;
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

const GROUP_LABELS = {
  tickets: 'Work Orders',
  spaces: 'Spaces',
  kb: 'Knowledge Base',
  assets: 'Assets',
  users: 'Users'
};
const GROUP_ORDER = ['tickets', 'spaces', 'kb', 'assets', 'users'];

// Map a result row to a navigable entry, per group.
function toEntry(group, row, canManageAssets) {
  switch (group) {
    case 'tickets':
      return { id: `t${row.id}`, to: `/tickets/${row.id}`, title: row.title, meta: `${formatTicketId(row.id)} · ${row.status}` };
    case 'spaces':
      return { id: `s${row.id}`, to: `/spaces/${row.space_id}?item=${row.id}`, title: row.title, meta: `${row.item_key} · ${row.space_name}` };
    case 'kb':
      return { id: `k${row.id}`, to: `/kb/${row.slug}`, title: row.title, meta: row.category || 'Knowledge Base' };
    case 'assets':
      return {
        id: `a${row.id}`,
        to: canManageAssets ? `/assets/edit/${row.id}` : '/assets/all',
        title: `${row.asset_tag} — ${row.type}`,
        meta: [row.model, row.assignee].filter(Boolean).join(' · ') || 'Asset'
      };
    case 'users':
      return { id: `u${row.id}`, to: '/users', title: row.name, meta: row.email, avatar: { name: row.name, src: row.avatar_url } };
    default:
      return null;
  }
}

export default function GlobalSearch() {
  const me = getUser();
  const navigate = useNavigate();
  const canManageAssets = hasPermission('assets', 'manage', me);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // { tickets, spaces, kb, assets, users }
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const inputRef = useRef(null);
  const reqId = useRef(0);

  // Global ⌘K / Ctrl+K to toggle the palette.
  useEffect(() => {
    if (!me) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me]);

  // Focus the input + reset state when opening.
  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const myReq = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
        if (myReq === reqId.current) { setResults(data); setActive(0); }
      } catch {
        if (myReq === reqId.current) setResults(null);
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, open]);

  // Flatten groups (in order) into a single list for keyboard navigation.
  const flat = useMemo(() => {
    if (!results) return [];
    const list = [];
    for (const g of GROUP_ORDER) {
      for (const row of results[g] || []) {
        const entry = toEntry(g, row, canManageAssets);
        if (entry) list.push({ ...entry, group: g });
      }
    }
    return list;
  }, [results, canManageAssets]);

  const go = (entry) => {
    if (!entry) return;
    setOpen(false);
    navigate(entry.to);
  };

  const onInputKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
  };

  if (!me) return null;

  const hasQuery = query.trim().length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800 md:w-56 md:justify-start"
        aria-label="Search"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <span className="hidden flex-1 text-left text-sm md:inline">Search…</span>
        <kbd className="hidden shrink-0 rounded border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900 md:inline">
          {isMac ? '⌘' : 'Ctrl '}K
        </kbd>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
              <svg className="h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search work orders, articles, spaces, assets…"
                className="flex-1 bg-transparent py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
              />
              {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-accent-500" />}
              <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700 sm:inline">Esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!hasQuery ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">Type at least 2 characters to search.</p>
              ) : flat.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">{loading ? 'Searching…' : `No results for “${query.trim()}”.`}</p>
              ) : (
                GROUP_ORDER.filter((g) => (results?.[g] || []).length).map((g) => (
                  <div key={g} className="mb-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{GROUP_LABELS[g]}</div>
                    {(results[g] || []).map((row) => {
                      const entry = toEntry(g, row, canManageAssets);
                      const idx = flat.findIndex((f) => f.id === entry.id);
                      const isActive = idx === active;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => go(entry)}
                          onMouseEnter={() => setActive(idx)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${isActive ? 'bg-accent-50 dark:bg-accent-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                        >
                          {entry.avatar ? (
                            <Avatar name={entry.avatar.name} src={entry.avatar.src} size="h-7 w-7" textClass="text-[10px]" />
                          ) : (
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${GROUP_ICON_BG[g]}`}>
                              <GroupIcon group={g} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-800 dark:text-slate-100">{entry.title}</span>
                            <span className="block truncate text-xs text-slate-400">{entry.meta}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const GROUP_ICON_BG = {
  tickets: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  spaces: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  kb: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  assets: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  users: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
};

function GroupIcon({ group }) {
  const p = {
    tickets: 'M9 12h6M9 16h6M9 8h6M5 3h14a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z',
    spaces: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    kb: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    assets: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
  }[group];
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={p} />
    </svg>
  );
}
