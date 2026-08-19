import { useState } from 'react';
import { api } from '../lib/auth.js';
import Modal from './Modal.jsx';
import UserPicker from './UserPicker.jsx';

// Shared bulk-action bar for ticket list views (My Queue, All Tickets). Posts
// to POST /api/tickets/bulk, which authorizes and applies each ticket
// independently — a selection that mixes editable and non-editable tickets
// comes back as a partial success, reported here rather than silently dropped.
export default function BulkTicketActionBar({ selectedIds, onClear, onApplied, statuses, priorities, assignableUsers }) {
  const [modal, setModal] = useState(null); // 'status' | 'priority' | 'assignee' | null
  const [statusValue, setStatusValue] = useState(statuses?.[0]?.key || '');
  const [priorityValue, setPriorityValue] = useState(priorities?.[0] || '');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const count = selectedIds.size;
  if (count === 0) return null;

  const apply = async (field, value) => {
    setBusy(true);
    setErr('');
    try {
      const res = await api('/api/tickets/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          field,
          value: value === '' ? null : value
        })
      });
      setModal(null);
      setResult(res);
      onApplied();
      onClear();
      setTimeout(() => setResult(null), 6000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-200 bg-accent-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-accent-900">{count} selected</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setErr(''); setModal('status'); }} className="btn-secondary !px-3 !py-1.5 text-xs">
              Set status
            </button>
            <button type="button" onClick={() => { setErr(''); setModal('priority'); }} className="btn-secondary !px-3 !py-1.5 text-xs">
              Set priority
            </button>
            <button type="button" onClick={() => { setErr(''); setModal('assignee'); }} className="btn-secondary !px-3 !py-1.5 text-xs">
              Reassign
            </button>
          </div>
          <button type="button" onClick={onClear} className="ml-auto text-xs font-semibold text-accent-800 hover:text-accent-900">
            Clear selection
          </button>
        </div>
        {result && (
          <p className="text-xs text-slate-500">
            {result.updated.length} updated
            {result.skipped.length ? ` · ${result.skipped.length} skipped (no edit access, or already set)` : ''}
          </p>
        )}
      </div>

      <Modal open={modal === 'status'} onClose={() => setModal(null)} title={`Set status for ${count} work order${count === 1 ? '' : 's'}`} size="sm">
        <div className="space-y-3">
          <select
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost !px-3 !py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply('status', statusValue)}
              className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
            >
              Apply
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'priority'} onClose={() => setModal(null)} title={`Set priority for ${count} work order${count === 1 ? '' : 's'}`} size="sm">
        <div className="space-y-3">
          <select
            value={priorityValue}
            onChange={(e) => setPriorityValue(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm capitalize focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            {priorities.map((p) => <option key={p} value={p} className="capitalize">{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost !px-3 !py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply('priority', priorityValue)}
              className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
            >
              Apply
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'assignee'} onClose={() => setModal(null)} title={`Reassign ${count} work order${count === 1 ? '' : 's'}`} size="sm">
        <div className="space-y-3">
          <UserPicker value={assigneeValue} users={assignableUsers} onChange={setAssigneeValue} placeholder="Type to search users…" />
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => apply('assignee', '')} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-60">
              Unassign
            </button>
            <button type="button" onClick={() => setModal(null)} className="btn-ghost !px-3 !py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={busy || !assigneeValue}
              onClick={() => apply('assignee', assigneeValue)}
              className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
            >
              Apply
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
