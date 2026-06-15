import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
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
      </main>
    </div>
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
