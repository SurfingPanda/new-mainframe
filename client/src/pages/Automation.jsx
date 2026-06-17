import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';

const TRIGGER_LABELS = {
  'ticket.created': 'When a work order is created',
  'ticket.updated': 'When a work order is updated',
  'ticket.idle': 'When a work order sits idle',
  'sla.response_breached': 'When the response SLA is breached',
  'sla.resolution_breached': 'When the resolution SLA is breached'
};
const OP_LABELS = {
  eq: 'is', neq: 'is not', contains: 'contains',
  in: 'is any of', is_empty: 'is empty', is_not_empty: 'is not empty'
};
const VALUELESS_OPS = new Set(['is_empty', 'is_not_empty']);

function humanize(s) {
  return String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export default function Automation() {
  const [rules, setRules] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // null | 'new' | rule
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api('/api/automation');
      setRules(Array.isArray(list) ? list : []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api('/api/automation/meta').then(setMeta).catch(() => setMeta(null));
  }, []);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const counts = useMemo(() => ({
    total: rules.length,
    active: rules.filter((r) => r.is_active).length,
    inactive: rules.filter((r) => !r.is_active).length
  }), [rules]);

  const handleSave = async (payload, isNew) => {
    if (isNew) {
      const created = await api('/api/automation', { method: 'POST', body: JSON.stringify(payload) });
      setRules((prev) => [...prev, created]);
      setBanner({ type: 'success', text: `Rule "${created.name}" created.` });
    } else {
      const updated = await api(`/api/automation/${editTarget.id}`, {
        method: 'PATCH', body: JSON.stringify(payload)
      });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setBanner({ type: 'success', text: `Rule "${updated.name}" updated.` });
    }
    setEditTarget(null);
  };

  const toggleActive = async (rule) => {
    const updated = await api(`/api/automation/${rule.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_active: !rule.is_active })
    });
    setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setBanner({ type: 'success', text: `"${updated.name}" ${updated.is_active ? 'enabled' : 'disabled'}.` });
  };

  const deleteRule = (rule) => {
    setConfirm({
      message: `Delete "${rule.name}"? This cannot be undone.`,
      label: 'Delete',
      action: async () => {
        await api(`/api/automation/${rule.id}`, { method: 'DELETE' });
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
        setBanner({ type: 'success', text: `"${rule.name}" deleted.` });
        setConfirm(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/users" className="hover:text-slate-800">Users</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Automation</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Administration</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Automation Rules</h1>
            <p className="mt-1 text-slate-600">
              Auto-route, prioritise, and triage work orders. Rules run in order on create or update;
              the first matching rule with “stop” halts the rest.
            </p>
          </div>
          <button onClick={() => setEditTarget('new')} className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto">
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New rule
          </button>
        </section>

        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total" value={counts.total} tone="brand" />
          <Stat label="Enabled" value={counts.active} tone="accent" />
          <Stat label="Disabled" value={counts.inactive} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Th className="w-12 text-center">#</Th>
                  <Th>Rule</Th>
                  <Th className="w-56">Trigger</Th>
                  <Th>Then</Th>
                  <Th className="w-24">Status</Th>
                  <Th className="w-32 text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Loading rules…</td></tr>
                ) : rules.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                    No automation rules yet. Click “New rule” to create one.
                  </td></tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 align-top">
                      <td className="px-5 py-3 text-center text-slate-500 tabular-nums">{r.priority}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{r.name}</div>
                        {r.description && <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>}
                        <div className="text-[11px] text-slate-400 mt-1">{summarizeConditions(r.conditions)}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{TRIGGER_LABELS[r.trigger_event] || r.trigger_event}</td>
                      <td className="px-5 py-3 text-slate-700">{summarizeActions(r.actions)}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive(r)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                            r.is_active
                              ? 'bg-accent-50 text-accent-700 ring-accent-200'
                              : 'bg-slate-100 text-slate-600 ring-slate-200'
                          }`}
                          title="Toggle enabled"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${r.is_active ? 'bg-accent-500' : 'bg-slate-400'}`} />
                          {r.is_active ? 'Enabled' : 'Disabled'}
                        </button>
                        {!!r.stop_on_match && (
                          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Stops</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn label="Edit" onClick={() => setEditTarget(r)}>
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" /></svg>
                          </IconBtn>
                          <IconBtn label="Delete" onClick={() => deleteRule(r)} tone="rose">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {editTarget && meta && (
        <RuleFormModal target={editTarget} meta={meta} onClose={() => setEditTarget(null)} onSave={handleSave} />
      )}
      {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// ---- Summaries for the list ----

function summarizeConditions(conditions) {
  const c = parse(conditions);
  const rules = c?.rules || [];
  if (!rules.length) return '';
  const joiner = c.match === 'any' ? ' OR ' : ' AND ';
  return 'If ' + rules.map((r) => {
    const op = OP_LABELS[r.op] || r.op;
    if (VALUELESS_OPS.has(r.op)) return `${humanize(r.field)} ${op}`;
    const v = Array.isArray(r.value) ? r.value.join(', ') : r.value;
    return `${humanize(r.field)} ${op} "${v}"`;
  }).join(joiner);
}

function summarizeActions(actions) {
  const list = parse(actions) || [];
  if (!Array.isArray(list) || !list.length) return '—';
  return list.map((a) => {
    if (a.type === 'set_field') return `Set ${humanize(a.field)} → ${a.value ?? '(clear)'}`;
    if (a.type === 'add_note') return `Add note`;
    return a.type;
  }).join('; ');
}

function parse(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// ---- Builder modal ----

function RuleFormModal({ target, meta, onClose, onSave }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name || '');
  const [description, setDescription] = useState(init?.description || '');
  const [trigger, setTrigger] = useState(init?.trigger_event || 'ticket.created');
  const [priority, setPriority] = useState(init?.priority ?? 0);
  const [isActive, setIsActive] = useState(isNew ? true : !!init.is_active);
  const [stopOnMatch, setStopOnMatch] = useState(isNew ? false : !!init.stop_on_match);
  const [idleMinutes, setIdleMinutes] = useState(init?.idle_minutes || 1440);

  const initConds = parse(init?.conditions);
  const [match, setMatch] = useState(initConds?.match === 'any' ? 'any' : 'all');
  const [conditions, setConditions] = useState(
    initConds?.rules?.length
      ? initConds.rules.map((r) => ({ field: r.field, op: r.op, value: Array.isArray(r.value) ? r.value.join(', ') : (r.value ?? '') }))
      : [{ field: meta.conditionFields[0], op: 'eq', value: '' }]
  );
  const initActions = parse(init?.actions);
  const [actions, setActions] = useState(
    initActions?.length
      ? initActions.map((a) => ({ type: a.type, field: a.field || 'priority', value: a.value ?? '' }))
      : [{ type: 'set_field', field: 'priority', value: '' }]
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const valueOptions = (field) => {
    if (field === 'category') return meta.categories || [];
    const enumVals = meta.settableFields?.[field];
    return Array.isArray(enumVals) ? enumVals : null;
  };

  const updateCond = (i, patch) => setConditions((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updateAction = (i, patch) => setActions((p) => p.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }

    const condRules = conditions
      .filter((c) => c.field && c.op)
      .map((c) => {
        if (VALUELESS_OPS.has(c.op)) return { field: c.field, op: c.op };
        if (c.op === 'in') {
          return { field: c.field, op: c.op, value: String(c.value).split(',').map((s) => s.trim()).filter(Boolean) };
        }
        return { field: c.field, op: c.op, value: c.value };
      });

    const actionList = actions
      .filter((a) => a.type)
      .map((a) => (a.type === 'add_note'
        ? { type: 'add_note', value: a.value }
        : { type: 'set_field', field: a.field, value: a.value }));

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_event: trigger,
      priority: Number(priority) || 0,
      is_active: isActive,
      stop_on_match: stopOnMatch,
      conditions: { match, rules: condRules },
      actions: actionList
    };
    if (trigger === 'ticket.idle') payload.idle_minutes = Number(idleMinutes) || null;

    setSubmitting(true);
    try {
      await onSave(payload, isNew);
    } catch (err) {
      setError(err.message || 'Could not save the rule.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'New automation rule' : `Edit ${init.name}`} size="lg">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls()} autoFocus placeholder="e.g. Route Network → IT" />
          </Field>
          <Field label="Priority" hint="Lower runs first.">
            <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls()} />
          </Field>
        </div>
        <Field label="Description" hint="Optional.">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls()} placeholder="What this rule does" />
        </Field>

        <Field label="Trigger (when)">
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={inputCls()}>
            {meta.triggers.map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t] || t}</option>)}
          </select>
        </Field>
        {trigger === 'ticket.idle' && (
          <Field label="Idle for (minutes)" hint="Fires once a work order goes untouched this long (checked every ~15 min). 1440 = 1 day.">
            <input type="number" min="1" value={idleMinutes} onChange={(e) => setIdleMinutes(e.target.value)} className={inputCls()} />
          </Field>
        )}

        {/* Conditions */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Conditions (if)</span>
            <select value={match} onChange={(e) => setMatch(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
              <option value="all">Match ALL</option>
              <option value="any">Match ANY</option>
            </select>
          </div>
          {conditions.map((c, i) => {
            const opts = valueOptions(c.field);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={c.field} onChange={(e) => updateCond(i, { field: e.target.value, value: '' })} className={miniCls()}>
                  {meta.conditionFields.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
                </select>
                <select value={c.op} onChange={(e) => updateCond(i, { op: e.target.value })} className={miniCls()}>
                  {meta.conditionOps.map((o) => <option key={o} value={o}>{OP_LABELS[o] || o}</option>)}
                </select>
                {!VALUELESS_OPS.has(c.op) && (
                  opts && c.op !== 'in' ? (
                    <select value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} className={`${miniCls()} flex-1 min-w-[8rem]`}>
                      <option value="">Select…</option>
                      {opts.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
                    </select>
                  ) : (
                    <input
                      value={c.value}
                      onChange={(e) => updateCond(i, { value: e.target.value })}
                      placeholder={c.op === 'in' ? 'comma,separated,values' : 'value'}
                      className={`${miniCls()} flex-1 min-w-[8rem]`}
                    />
                  )
                )}
                <button type="button" onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600 text-xs px-1" title="Remove">✕</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setConditions((p) => [...p, { field: meta.conditionFields[0], op: 'eq', value: '' }])} className="text-xs font-semibold text-accent-700 hover:text-accent-800">+ Add condition</button>
        </div>

        {/* Actions */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Actions (then)</span>
          {actions.map((a, i) => {
            const opts = a.type === 'set_field' ? valueOptions(a.field) : null;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value })} className={miniCls()}>
                  <option value="set_field">Set field</option>
                  <option value="add_note">Add note</option>
                </select>
                {a.type === 'set_field' ? (
                  <>
                    <select value={a.field} onChange={(e) => updateAction(i, { field: e.target.value, value: '' })} className={miniCls()}>
                      {Object.keys(meta.settableFields).map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
                    </select>
                    {opts ? (
                      <select value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} className={`${miniCls()} flex-1 min-w-[8rem]`}>
                        <option value="">Select…</option>
                        {opts.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
                      </select>
                    ) : (
                      <input value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} placeholder="value (blank clears)" className={`${miniCls()} flex-1 min-w-[8rem]`} />
                    )}
                  </>
                ) : (
                  <input value={a.value} onChange={(e) => updateAction(i, { value: e.target.value })} placeholder="Note text" className={`${miniCls()} flex-1 min-w-[12rem]`} />
                )}
                <button type="button" onClick={() => setActions((p) => p.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600 text-xs px-1" title="Remove">✕</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setActions((p) => [...p, { type: 'set_field', field: 'priority', value: '' }])} className="text-xs font-semibold text-accent-700 hover:text-accent-800">+ Add action</button>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={stopOnMatch} onChange={(e) => setStopOnMatch(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
            Stop processing later rules if this matches
          </label>
        </div>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {submitting ? 'Saving…' : isNew ? 'Create rule' : 'Save changes'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ConfirmModal({ message, label, action, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message || 'Action failed.'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onCancel} title="Confirm" size="sm">
      <p className="text-sm text-slate-700">{message}</p>
      {error && <div className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <footer className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
        <button type="button" onClick={run} disabled={busy} className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white shadow-sm bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:opacity-60">
          {busy ? 'Working…' : label}
        </button>
      </footer>
    </Modal>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';
}
function miniCls() {
  return 'rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';
}
function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}
function Stat({ label, value, tone }) {
  const tones = {
    brand: 'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    slate: 'text-slate-700 ring-slate-200 bg-slate-100'
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ring-1 ring-inset ${tones[tone]}`}>{value}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </div>
  );
}
function IconBtn({ children, label, onClick, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 hover:text-brand-900 hover:bg-slate-100',
    rose: 'text-slate-500 hover:text-rose-700 hover:bg-rose-50'
  };
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
}
