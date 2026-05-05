import { useEffect, useMemo, useRef, useState } from 'react';

export default function UserPicker({
  value,
  users,
  onChange,
  disabled,
  placeholder = 'Type to search users or enter a name',
  className = ''
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const query = value || '';
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = `${u.name} ${u.email || ''} ${u.role || ''} ${u.department || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const pick = (u) => {
    onChange(u.name);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={
          className ||
          'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-700'
        }
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto scrollbar-pretty">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); setOpen(false); }}
            className="block w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 border-b border-slate-100"
          >
            Unassigned
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              No matching users. Press Enter to keep "{value}" as a custom name.
            </div>
          ) : (
            filtered.map((u, idx) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(u)}
                className={`block w-full text-left px-3 py-2 text-sm ${
                  idx === highlight ? 'bg-accent-50 text-accent-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-slate-500">
                  {u.email ? `${u.email} · ` : ''}{u.role}{u.department ? ` · ${u.department}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
