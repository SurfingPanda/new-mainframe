import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';
import { invalidateTaxonomy } from '../lib/categories.js';

// Admin editor for the work-order Request Types and the 3-level Category →
// Subcategory → Sub-subcategory tree (GET/POST/PATCH/DELETE /api/taxonomy/*).
// Hidden entries disappear from the forms but old work orders keep them;
// "System" entries are referenced by name in code and can't be renamed/deleted.
const LEVEL_NAMES = ['category', 'subcategory', 'sub-subcategory'];

export default function TicketTaxonomy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // see <Dialogs>

  const load = async () => {
    try {
      setData(await api('/api/taxonomy/manage'));
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load categories.');
    }
  };
  useEffect(() => { load(); }, []);

  // Run a write, then refresh this page + every open form's cached copy.
  const run = async (fn, success) => {
    await fn();
    await load();
    invalidateTaxonomy();
    if (success) setBanner(success);
  };

  const toggle = (id) => setExpanded((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const move = (kind, siblings, index, delta) => {
    const ids = siblings.map((s) => s.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => api('/api/taxonomy/reorder', { method: 'POST', body: JSON.stringify({ kind, ids }) }))
      .catch((e) => setError(e.message));
  };

  const setActive = (path, item, active) =>
    run(() => api(path, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }),
      `${active ? 'Shown' : 'Hidden'}: ${item.label || item.name}`)
      .catch((e) => setError(e.message));

  const types = data?.requestTypes || [];
  const tree = data?.categories || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Categories &amp; Request Types</span>
        </nav>

        <section>
          <span className="eyebrow">Administration</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Categories &amp; Request Types</h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            Control the options on the Create Work Order form. Renaming a category also updates the work orders,
            SLA policies, and automation rules that use it. Anything already in use can&apos;t be deleted — hide it
            instead, and existing work orders keep their value.
          </p>
        </section>

        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <span className="flex-1">{banner}</span>
            <button onClick={() => setBanner('')} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="font-semibold text-xs">Dismiss</button>
          </div>
        )}

        {!data && !error ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* ---------------- Request types ---------------- */}
            <section className="lg:col-span-2 self-start rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-brand-900">Request types</h2>
                  <p className="text-xs text-slate-500 mt-0.5">What kind of work order is this?</p>
                </div>
                <button onClick={() => setDialog({ type: 'requestType' })} className="btn-primary !px-3 !py-1.5 text-xs">+ Add</button>
              </header>
              <ul className="divide-y divide-slate-100">
                {types.map((t, i) => (
                  <li key={t.id} className={`flex items-start gap-3 px-5 py-3 ${t.is_active ? '' : 'bg-slate-50/70'}`}>
                    <MoveButtons onUp={() => move('request_types', types, i, -1)} onDown={() => move('request_types', types, i, 1)} first={i === 0} last={i === types.length - 1} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-sm font-medium ${t.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{t.label}</span>
                        <code className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">{t.key}</code>
                        <Badges item={t} />
                      </div>
                      {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
                      <p className="mt-0.5 text-[11px] text-slate-400">{usageText(t.usage)}</p>
                    </div>
                    <div className="flex flex-none gap-0.5">
                      <IconBtn label="Edit" onClick={() => setDialog({ type: 'requestType', item: t })}><PencilIcon /></IconBtn>
                      {!t.is_system && (
                        <IconBtn label={t.is_active ? 'Hide' : 'Show'} onClick={() => setActive(`/api/taxonomy/request-types/${t.id}`, t, !t.is_active)}>
                          <EyeIcon off={t.is_active} />
                        </IconBtn>
                      )}
                      {!t.is_system && t.usage === 0 && (
                        <IconBtn label="Delete" tone="rose" onClick={() => setDialog({ type: 'delete', path: `/api/taxonomy/request-types/${t.id}`, name: t.label })}><TrashIcon /></IconBtn>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* ---------------- Categories ---------------- */}
            <section className="lg:col-span-3 rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-brand-900">Categories</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Category › Subcategory › Sub-subcategory (three levels).</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExpanded((s) => (s.size ? new Set() : new Set(allIds(tree))))}
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                  >
                    {expanded.size ? 'Collapse all' : 'Expand all'}
                  </button>
                  <button onClick={() => setDialog({ type: 'category', parent: null, depth: 1 })} className="btn-primary !px-3 !py-1.5 text-xs">+ Add category</button>
                </div>
              </header>
              <ul className="py-1">
                {tree.map((node, i) => (
                  <CategoryNode
                    key={node.id}
                    node={node}
                    depth={1}
                    siblings={tree}
                    index={i}
                    expanded={expanded}
                    onToggle={toggle}
                    onMove={move}
                    onSetActive={setActive}
                    onDialog={setDialog}
                  />
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>

      <Dialogs dialog={dialog} onClose={() => setDialog(null)} run={run} />
    </div>
  );
}

function CategoryNode({ node, depth, siblings, index, expanded, onToggle, onMove, onSetActive, onDialog, parentHidden = false }) {
  const open = expanded.has(node.id);
  const hasKids = node.children.length > 0;
  const hidden = !node.is_active || parentHidden;
  return (
    <li>
      <div
        className={`group flex items-center gap-2 py-1.5 pr-4 hover:bg-slate-50 ${hidden ? 'opacity-60' : ''}`}
        style={{ paddingLeft: `${(depth - 1) * 24 + 12}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded text-slate-400 hover:bg-slate-200 ${depth < 3 ? '' : 'invisible'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <span className={`min-w-0 truncate text-sm ${depth === 1 ? 'font-semibold text-slate-900' : 'text-slate-700'} ${node.is_active ? '' : 'line-through'}`}>
          {node.name}
        </span>
        {depth < 3 && <span className="text-[11px] text-slate-400">{node.children.length}</span>}
        <Badges item={node} />
        <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">{usageText(node.usage)}</span>
        <div className="flex flex-none gap-0.5">
          <MoveButtons onUp={() => onMove('categories', siblings, index, -1)} onDown={() => onMove('categories', siblings, index, 1)} first={index === 0} last={index === siblings.length - 1} />
          {depth < 3 && (
            <IconBtn label={`Add ${LEVEL_NAMES[depth]}`} onClick={() => { if (!open) onToggle(node.id); onDialog({ type: 'category', parent: node, depth: depth + 1 }); }}>
              <PlusIcon />
            </IconBtn>
          )}
          {!node.is_system && (
            <IconBtn label="Rename" onClick={() => onDialog({ type: 'category', item: node, depth })}><PencilIcon /></IconBtn>
          )}
          <IconBtn label={node.is_active ? 'Hide' : 'Show'} onClick={() => onSetActive(`/api/taxonomy/categories/${node.id}`, node, !node.is_active)}>
            <EyeIcon off={node.is_active} />
          </IconBtn>
          {!node.is_system && node.usage === 0 && !hasKids && (
            <IconBtn label="Delete" tone="rose" onClick={() => onDialog({ type: 'delete', path: `/api/taxonomy/categories/${node.id}`, name: node.name })}><TrashIcon /></IconBtn>
          )}
        </div>
      </div>
      {open && depth < 3 && (
        <ul>
          {node.children.map((child, i) => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              siblings={node.children}
              index={i}
              expanded={expanded}
              onToggle={onToggle}
              onMove={onMove}
              onSetActive={onSetActive}
              onDialog={onDialog}
              parentHidden={hidden}
            />
          ))}
          {node.children.length === 0 && (
            <li className="py-1.5 text-xs italic text-slate-400" style={{ paddingLeft: `${depth * 24 + 40}px` }}>
              No {LEVEL_NAMES[depth]} yet.
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/* -------- Dialogs: add/edit request type, add/rename category, delete -------- */

function Dialogs({ dialog, onClose, run }) {
  if (!dialog) return null;
  if (dialog.type === 'requestType') return <RequestTypeDialog item={dialog.item} onClose={onClose} run={run} />;
  if (dialog.type === 'category') return <CategoryDialog {...dialog} onClose={onClose} run={run} />;
  if (dialog.type === 'delete') return <DeleteDialog {...dialog} onClose={onClose} run={run} />;
  return null;
}

function useSubmit(onClose) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
      setBusy(false);
    }
  };
  return { busy, err, submit };
}

function RequestTypeDialog({ item, onClose, run }) {
  const [label, setLabel] = useState(item?.label || '');
  const [description, setDescription] = useState(item?.description || '');
  const { busy, err, submit } = useSubmit(onClose);
  const save = (e) => {
    e.preventDefault();
    const body = JSON.stringify({ label, description });
    submit(() => run(
      () => api(item ? `/api/taxonomy/request-types/${item.id}` : '/api/taxonomy/request-types', { method: item ? 'PATCH' : 'POST', body }),
      item ? `Saved request type "${label.trim()}".` : `Added request type "${label.trim()}".`
    ));
  };
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.label}` : 'Add request type'} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} autoFocus className={INPUT} placeholder="e.g. Hardware Refresh" />
        </Field>
        <Field label="Description" hint="Shown under the dropdown on the Create Work Order form.">
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={INPUT} />
        </Field>
        {item && <p className="text-[11px] text-slate-500">Stored key <code>{item.key}</code> never changes, so renaming is safe.</p>}
        <DialogFooter err={err} busy={busy} disabled={!label.trim()} onClose={onClose} label={item ? 'Save' : 'Add'} />
      </form>
    </Modal>
  );
}

function CategoryDialog({ item, parent, depth, onClose, run }) {
  const [name, setName] = useState(item?.name || '');
  const { busy, err, submit } = useSubmit(onClose);
  const level = LEVEL_NAMES[depth - 1];
  const max = depth === 1 ? 50 : 120;
  const save = (e) => {
    e.preventDefault();
    const clean = name.trim();
    submit(() => run(
      async () => {
        if (item) {
          const res = await api(`/api/taxonomy/categories/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: clean }) });
          return res;
        }
        return api('/api/taxonomy/categories', { method: 'POST', body: JSON.stringify({ parent_id: parent?.id || 0, name: clean }) });
      },
      item
        ? `Renamed "${item.name}" to "${clean}"${item.usage ? ` — ${item.usage} work order(s) updated` : ''}.`
        : `Added ${level} "${clean}"${parent ? ` under ${parent.name}` : ''}.`
    ));
  };
  return (
    <Modal open onClose={onClose} title={item ? `Rename ${level}` : `Add ${level}${parent ? ` to ${parent.name}` : ''}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={max} autoFocus className={INPUT} />
        </Field>
        {item?.usage > 0 && name.trim() && name.trim() !== item.name && (
          <p className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
            {item.usage} existing work order(s) will be updated to the new name
            {depth === 1 ? ', along with SLA policies and automation rules that match this category' : ''}.
          </p>
        )}
        <DialogFooter err={err} busy={busy} disabled={!name.trim() || name.trim() === item?.name} onClose={onClose} label={item ? 'Rename' : 'Add'} />
      </form>
    </Modal>
  );
}

function DeleteDialog({ path, name, onClose, run }) {
  const { busy, err, submit } = useSubmit(onClose);
  return (
    <Modal open onClose={onClose} title="Delete" size="sm">
      <p className="text-sm text-slate-700">Delete <strong>{name}</strong>? It isn&apos;t used by any work order. This can&apos;t be undone.</p>
      <DialogFooter
        err={err}
        busy={busy}
        onClose={onClose}
        label="Delete"
        danger
        onConfirm={() => submit(() => run(() => api(path, { method: 'DELETE' }), `Deleted "${name}".`))}
      />
    </Modal>
  );
}

/* -------- Small pieces -------- */

const INPUT = 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';

function usageText(n) {
  return n ? `${n} work order${n === 1 ? '' : 's'}` : 'Unused';
}

function allIds(nodes) {
  return nodes.flatMap((n) => [n.id, ...allIds(n.children)]);
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

function DialogFooter({ err, busy, disabled, onClose, label, danger, onConfirm }) {
  return (
    <>
      {err && <div className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <footer className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onClose} className="btn-ghost !px-3 !py-1.5 text-xs">Cancel</button>
        <button
          type={onConfirm ? 'button' : 'submit'}
          onClick={onConfirm}
          disabled={busy || disabled}
          className={`${danger ? 'bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold' : 'btn-primary'} !px-3 !py-1.5 text-xs disabled:opacity-50`}
        >
          {busy ? 'Saving…' : label}
        </button>
      </footer>
    </>
  );
}

function Badges({ item }) {
  return (
    <>
      {item.is_system && (
        <span title="Used by the app by name — can't be renamed or deleted" className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-200">System</span>
      )}
      {!item.is_active && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200">Hidden</span>
      )}
    </>
  );
}

function IconBtn({ label, onClick, tone, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1 text-slate-400 transition-colors ${tone === 'rose' ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-slate-100 hover:text-slate-700'}`}
    >
      {children}
    </button>
  );
}

function MoveButtons({ onUp, onDown, first, last }) {
  return (
    <span className="flex flex-none flex-col">
      <button type="button" onClick={onUp} disabled={first} aria-label="Move up" title="Move up" className="rounded px-0.5 text-slate-400 hover:text-slate-700 disabled:invisible">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      <button type="button" onClick={onDown} disabled={last} aria-label="Move down" title="Move down" className="rounded px-0.5 text-slate-400 hover:text-slate-700 disabled:invisible">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </span>
  );
}

const icon = 'h-4 w-4';
function PencilIcon() {
  return <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" /></svg>;
}
function PlusIcon() {
  return <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function TrashIcon() {
  return <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;
}
function EyeIcon({ off }) {
  // off = currently visible → action is "hide" (eye with slash)
  return off ? (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" /></svg>
  ) : (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}
