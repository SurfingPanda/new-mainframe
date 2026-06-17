import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';

// The four work-order priorities and how they read in the UI. "Medium" is the
// system's `normal` priority — labeled here to match the rest of the app.
const PRIORITIES = [
  { key: 'low', label: 'Low', desc: 'Minor inconvenience, no business impact.', tone: 'slate' },
  { key: 'normal', label: 'Normal', desc: 'Standard request, response within a day.', tone: 'brand' },
  { key: 'high', label: 'High', desc: 'Affects productivity, needs same-day attention.', tone: 'amber' },
  { key: 'urgent', label: 'Urgent', desc: 'Outage or security issue, page on-call.', tone: 'rose' }
];

const DOT = {
  slate: 'bg-slate-400',
  brand: 'bg-brand-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500'
};

export default function SlaSettings() {
  const [days, setDays] = useState({ low: '', normal: '', high: '', urgent: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    api('/api/settings/sla')
      .then((d) => setDays({ low: d.low, normal: d.normal, high: d.high, urgent: d.urgent }))
      .catch((e) => setError(e.message || 'Could not load SLA settings.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const invalid = useMemo(() => {
    const bad = {};
    for (const p of PRIORITIES) {
      const n = Number(days[p.key]);
      if (!Number.isInteger(n) || n < 1 || n > 365) bad[p.key] = true;
    }
    return bad;
  }, [days]);

  const canSave = !loading && !saving && Object.keys(invalid).length === 0;

  const setDay = (key, val) => setDays((d) => ({ ...d, [key]: val.replace(/[^\d]/g, '') }));

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) {
      setError('Each priority needs a whole number of days between 1 and 365.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        low: Number(days.low),
        normal: Number(days.normal),
        high: Number(days.high),
        urgent: Number(days.urgent)
      };
      const saved = await api('/api/settings/sla', { method: 'PUT', body: JSON.stringify(payload) });
      setDays({ low: saved.low, normal: saved.normal, high: saved.high, urgent: saved.urgent });
      setBanner('SLA targets saved. New work orders and SLA standings use these values.');
    } catch (err) {
      setError(err.message || 'Could not save SLA settings.');
    } finally {
      setSaving(false);
    }
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
          <span className="text-accent-700">SLA Settings</span>
        </nav>

        <section>
          <span className="eyebrow">Users</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">SLA Settings</h1>
          <p className="mt-1 text-slate-600">
            Set the resolution time target (in days) for each work order priority. The SLA clock
            pauses while a work order is on hold, pending, or resolved.
          </p>
        </section>

        <div className="flex items-start gap-2.5 rounded-md bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-800">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <div>
            <p className="font-semibold">Changing these targets affects all work orders.</p>
            <p className="mt-0.5">
              SLA standing is recalculated from these values, so existing open work orders may
              immediately flip to on-track, due soon, or overdue. Lowering a target can mark
              work orders as breached right away. Changes apply going forward and don't alter
              past resolution times.
            </p>
          </div>
        </div>

        {banner && (
          <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
            {banner}
          </div>
        )}

        <form onSubmit={save} className="max-w-2xl rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Resolution targets</h2>
            <p className="text-xs text-slate-500 mt-0.5">Whole number of days, 1–365.</p>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {PRIORITIES.map((p) => (
                <Row key={p.key} priority={p} value={days[p.key]} invalid={!!invalid[p.key]} onChange={(v) => setDay(p.key, v)} />
              ))}
            </div>
          )}

          {error && (
            <div role="alert" className="mx-5 my-4 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <button type="submit" disabled={!canSave} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        <SlaPolicies />
        <SlaCalendars />
      </main>
    </div>
  );
}

// ── Scoped SLA policies (response + resolution targets, in minutes) ──

const SCOPE_FIELDS = [
  { key: 'priority', label: 'Priority' },
  { key: 'request_type', label: 'Type' },
  { key: 'category', label: 'Category' },
  { key: 'department', label: 'Department' }
];

function fmtMinutes(m) {
  if (m == null) return '—';
  if (m % 1440 === 0) return `${m / 1440}d`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${m}m`;
}

function scopeText(p) {
  const parts = SCOPE_FIELDS.filter((f) => p[f.key]).map((f) => `${f.label}: ${p[f.key]}`);
  return parts.length ? parts.join(' · ') : 'Any work order';
}

function SlaPolicies() {
  const [policies, setPolicies] = useState([]);
  const [meta, setMeta] = useState({ priorities: [], requestTypes: [], categories: [], departments: [] });
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState(null); // null | 'new' | policy

  const load = () => {
    setLoading(true);
    api('/api/sla/policies')
      .then((rows) => { setPolicies(Array.isArray(rows) ? rows : []); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { api('/api/sla/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api('/api/sla/calendars').then((c) => setCalendars(Array.isArray(c) ? c : [])).catch(() => {}); }, []);
  const calName = (id) => calendars.find((c) => c.id === id)?.name || '24/7';

  const save = async (payload, isNew) => {
    if (isNew) {
      await api('/api/sla/policies', { method: 'POST', body: JSON.stringify(payload) });
    } else {
      await api(`/api/sla/policies/${editTarget.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    }
    setEditTarget(null);
    load();
  };

  const remove = async (p) => {
    if (!confirm(`Delete policy "${p.name}"?`)) return;
    await api(`/api/sla/policies/${p.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <section className="max-w-4xl rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">SLA policies</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scoped response + resolution targets. The most specific active policy applies; otherwise the per-priority default above is used. Targets are pinned to each work order at creation.
          </p>
        </div>
        <button onClick={() => setEditTarget('new')} className="btn-primary !px-3 !py-1.5 text-xs">New policy</button>
      </div>

      {error && <div className="mx-5 my-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-2.5 text-left">Policy</th>
              <th className="px-5 py-2.5 text-left">Applies to</th>
              <th className="px-5 py-2.5 text-left w-24">Response</th>
              <th className="px-5 py-2.5 text-left w-24">Resolution</th>
              <th className="px-5 py-2.5 text-left w-32">Hours</th>
              <th className="px-5 py-2.5 text-right w-28 pr-5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">Loading…</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">No policies yet.</td></tr>
            ) : (
              policies.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50/60 ${p.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    {!p.is_active && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Disabled</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{scopeText(p)}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">{fmtMinutes(p.response_minutes)}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">{fmtMinutes(p.resolution_minutes)}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{calName(p.calendar_id)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setEditTarget(p)} className="text-xs font-semibold text-accent-700 hover:text-accent-900 mr-3">Edit</button>
                    <button onClick={() => remove(p)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <PolicyModal target={editTarget} meta={meta} calendars={calendars} onClose={() => setEditTarget(null)} onSave={save} />
      )}
    </section>
  );
}

// ── Business-hours calendars ──

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

function hoursSummary(hours) {
  const open = DAYS.filter(([k]) => (hours?.[k] || []).length);
  if (!open.length) return 'Closed';
  // Collapse contiguous identical days into ranges for a compact label.
  const label = (k) => DAYS.find((d) => d[0] === k)[1];
  const w = (k) => hours[k][0];
  return open.map(([k]) => `${label(k)} ${w(k)[0]}–${w(k)[1]}`).join(', ');
}

function SlaCalendars() {
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState(null);

  const load = () => {
    setLoading(true);
    api('/api/sla/calendars')
      .then((rows) => { setCalendars(Array.isArray(rows) ? rows : []); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const remove = async (c) => {
    if (!confirm(`Delete calendar "${c.name}"? Policies using it will revert to 24/7.`)) return;
    await api(`/api/sla/calendars/${c.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <section className="max-w-4xl rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Business-hours calendars</h2>
          <p className="text-xs text-slate-500 mt-0.5">Weekly working hours + holidays. Assign a calendar to a policy so its SLA clock only runs during those hours.</p>
        </div>
        <button onClick={() => setEditTarget('new')} className="btn-primary !px-3 !py-1.5 text-xs">New calendar</button>
      </div>

      {error && <div className="mx-5 my-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : calendars.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">No calendars yet.</div>
        ) : (
          calendars.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/60">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">{c.name}</div>
                <div className="text-xs text-slate-500">{c.timezone} · {hoursSummary(typeof c.hours === 'string' ? JSON.parse(c.hours) : c.hours)}</div>
                {c.holidays?.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5">{c.holidays.length} holiday{c.holidays.length === 1 ? '' : 's'}</div>}
              </div>
              <button onClick={() => setEditTarget(c)} className="text-xs font-semibold text-accent-700 hover:text-accent-900">Edit</button>
              <button onClick={() => remove(c)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
            </div>
          ))
        )}
      </div>

      {editTarget && (
        <CalendarModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
    </section>
  );
}

function CalendarModal({ target, onClose, onSaved }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const initHours = init ? (typeof init.hours === 'string' ? JSON.parse(init.hours) : init.hours) : {};
  const [name, setName] = useState(init?.name || '');
  const [timezone, setTimezone] = useState(init?.timezone || 'Asia/Manila');
  const [days, setDays] = useState(() => Object.fromEntries(DAYS.map(([k]) => {
    const w = (initHours?.[k] || [])[0];
    const isWeekday = !['sat', 'sun'].includes(k);
    return [k, w ? { open: true, start: w[0], end: w[1] } : { open: isNew ? isWeekday : false, start: '09:00', end: '18:00' }];
  })));
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setDay = (k, patch) => setDays((d) => ({ ...d, [k]: { ...d[k], ...patch } }));

  const toHours = () => Object.fromEntries(DAYS.map(([k]) => {
    const d = days[k];
    return [k, d.open && d.start < d.end ? [[d.start, d.end]] : []];
  }));

  const save = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true);
    try {
      const payload = { name: name.trim(), timezone: timezone.trim(), hours: toHours() };
      if (isNew) await api('/api/sla/calendars', { method: 'POST', body: JSON.stringify(payload) });
      else await api(`/api/sla/calendars/${init.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save calendar.');
    } finally {
      setBusy(false);
    }
  };

  const addHoliday = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) { setError('Holiday date must be YYYY-MM-DD.'); return; }
    try {
      await api(`/api/sla/calendars/${init.id}/holidays`, { method: 'POST', body: JSON.stringify({ holiday_date: holidayDate, label: holidayLabel || null }) });
      setHolidayDate(''); setHolidayLabel('');
      onSaved(); // refresh list; modal stays via reopen — simplest is to close on save instead
    } catch (e) { setError(e.message); }
  };

  const fld = 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';
  const lbl = 'block text-xs font-semibold text-slate-700 mb-1';

  return (
    <Modal open onClose={onClose} title={isNew ? 'New calendar' : `Edit ${init.name}`} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fld} autoFocus placeholder="e.g. Support hours" />
          </div>
          <div>
            <label className={lbl}>Timezone</label>
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={fld} placeholder="Asia/Manila" />
          </div>
        </div>

        <div>
          <p className={lbl}>Weekly hours</p>
          <div className="space-y-1.5">
            {DAYS.map(([k, label]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 w-20 text-sm text-slate-700 cursor-pointer select-none">
                  <input type="checkbox" checked={days[k].open} onChange={(e) => setDay(k, { open: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
                  {label}
                </label>
                {days[k].open ? (
                  <>
                    <input type="time" value={days[k].start} onChange={(e) => setDay(k, { start: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    <span className="text-slate-400 text-xs">to</span>
                    <input type="time" value={days[k].end} onChange={(e) => setDay(k, { end: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
                  </>
                ) : <span className="text-xs text-slate-400">Closed</span>}
              </div>
            ))}
          </div>
        </div>

        {!isNew && (
          <div>
            <p className={lbl}>Holidays</p>
            {(init.holidays || []).length > 0 && (
              <ul className="mb-2 space-y-1">
                {init.holidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{String(h.holiday_date).slice(0, 10)}{h.label ? ` — ${h.label}` : ''}</span>
                    <button
                      onClick={async () => { await api(`/api/sla/calendars/${init.id}/holidays/${h.id}`, { method: 'DELETE' }); onSaved(); }}
                      className="text-xs text-rose-600 hover:text-rose-800"
                    >Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <input value={holidayLabel} onChange={(e) => setHolidayLabel(e.target.value)} placeholder="Label (optional)" className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <button type="button" onClick={addHoliday} className="btn-secondary !px-3 !py-1.5 text-xs">Add</button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Adding/removing a holiday saves immediately and closes the dialog.</p>
          </div>
        )}

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {busy ? 'Saving…' : isNew ? 'Create calendar' : 'Save changes'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function PolicyModal({ target, meta, calendars, onClose, onSave }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name || '');
  const [priority, setPriority] = useState(init?.priority || '');
  const [requestType, setRequestType] = useState(init?.request_type || '');
  const [category, setCategory] = useState(init?.category || '');
  const [department, setDepartment] = useState(init?.department || '');
  const [responseMin, setResponseMin] = useState(init?.response_minutes ?? '');
  const [resolutionMin, setResolutionMin] = useState(init?.resolution_minutes ?? '');
  const [rank, setRank] = useState(init?.rank ?? 0);
  const [calendarId, setCalendarId] = useState(init?.calendar_id ? String(init.calendar_id) : '');
  const [isActive, setIsActive] = useState(isNew ? true : !!init.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const res = Number(resolutionMin);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!Number.isInteger(res) || res <= 0) { setError('Resolution must be a positive number of minutes.'); return; }
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        priority: priority || null,
        request_type: requestType || null,
        category: category || null,
        department: department || null,
        response_minutes: responseMin === '' ? null : Number(responseMin),
        resolution_minutes: res,
        calendar_id: calendarId === '' ? null : Number(calendarId),
        rank: Number(rank) || 0,
        is_active: isActive
      }, isNew);
    } catch (err) {
      setError(err.message || 'Could not save policy.');
    } finally {
      setBusy(false);
    }
  };

  const fld = 'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';
  const lbl = 'block text-xs font-semibold text-slate-700 mb-1';

  return (
    <Modal open onClose={onClose} title={isNew ? 'New SLA policy' : `Edit ${init.name}`} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={lbl}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fld} autoFocus placeholder="e.g. Urgent security incidents" />
        </div>

        <div>
          <p className={lbl}>Applies to <span className="font-normal text-slate-400">(leave blank = any)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={fld}>
              <option value="">Any priority</option>
              {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className={fld}>
              <option value="">Any type</option>
              {meta.requestTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={fld}>
              <option value="">Any category</option>
              {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={fld}>
              <option value="">Any department</option>
              {meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Response target (minutes)</label>
            <input inputMode="numeric" value={responseMin} onChange={(e) => setResponseMin(e.target.value.replace(/[^\d]/g, ''))} className={fld} placeholder="optional" />
            <p className="mt-1 text-[11px] text-slate-400">{responseMin ? fmtMinutes(Number(responseMin)) : 'No response target'}</p>
          </div>
          <div>
            <label className={lbl}>Resolution target (minutes)</label>
            <input inputMode="numeric" value={resolutionMin} onChange={(e) => setResolutionMin(e.target.value.replace(/[^\d]/g, ''))} className={fld} placeholder="e.g. 1440" />
            <p className="mt-1 text-[11px] text-slate-400">{resolutionMin ? fmtMinutes(Number(resolutionMin)) : 'Required'}</p>
          </div>
        </div>

        <div>
          <label className={lbl}>Business hours</label>
          <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className={fld}>
            <option value="">24/7 (round-the-clock)</option>
            {(calendars || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">The SLA clock only runs during these hours (excluding holidays).</p>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className={lbl}>Rank <span className="font-normal text-slate-400">(higher wins ties)</span></label>
            <input inputMode="numeric" value={rank} onChange={(e) => setRank(e.target.value.replace(/[^\d-]/g, ''))} className={fld} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none pb-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
            Active
          </label>
        </div>

        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <footer className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60">
            {busy ? 'Saving…' : isNew ? 'Create policy' : 'Save changes'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function Row({ priority, value, invalid, onChange }) {
  const id = useId();
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOT[priority.tone] || DOT.slate}`} />
          <label htmlFor={id} className="text-sm font-semibold text-slate-800">{priority.label}</label>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{priority.desc}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`w-20 rounded-md border px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 ${
            invalid ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-300 focus:ring-accent-200'
          }`}
          aria-invalid={invalid}
        />
        <span className="text-sm text-slate-500 w-10">days</span>
      </div>
    </div>
  );
}
