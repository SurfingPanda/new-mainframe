import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { getUser } from '../lib/auth.js';
import {
  emptyReport,
  getReport,
  mergeIntoTemplate,
  saveReport,
  TEMPLATE_FIELDS,
} from '../lib/networkReports.js';

const INP = 'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500';

const STATUS_OPTIONS = [
  { value: 'stable',   label: 'Stable',   desc: 'No notable issues',           tone: 'accent' },
  { value: 'degraded', label: 'Degraded', desc: 'Some impact, no outage',      tone: 'amber'  },
  { value: 'incident', label: 'Incident', desc: 'Outage or major disruption',  tone: 'rose'   },
];

const TONE_RING = {
  accent: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30',
  amber:  'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  rose:   'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
};

export default function NetworkReportEditor() {
  const navigate = useNavigate();
  const { date: dateParam } = useParams();
  const isEdit = Boolean(dateParam);
  const user = getUser();

  const [form, setForm] = useState(() => emptyReport(user));
  const [loaded, setLoaded] = useState(!isEdit);
  const [error, setError] = useState('');
  const [overwriteOk, setOverwriteOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    const existing = getReport(dateParam);
    if (!existing) {
      setError(`No report found for ${dateParam}.`);
    } else {
      setForm(mergeIntoTemplate(emptyReport(user), existing));
      setOverwriteOk(true);
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, isEdit]);

  const conflict = useMemo(() => {
    if (isEdit) return null;
    return getReport(form.date);
  }, [form.date, isEdit]);

  const update         = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const updateTemplate = (key, value) => setForm((f) => ({ ...f, template: { ...f.template, [key]: value } }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.date) {
      setError('Please pick a report date.');
      return;
    }
    if (conflict && !overwriteOk) {
      setError(`A report already exists for ${form.date}. Confirm overwrite below to save.`);
      return;
    }

    setSaving(true);
    try {
      saveReport({ ...form, savedAt: new Date().toISOString() });
      navigate('/network/reports', {
        state: { banner: `Report for ${form.date} saved.` },
      });
    } catch (err) {
      setError(err.message || 'Failed to save report.');
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <main className="container-app py-10 text-sm text-slate-500 dark:text-slate-400">Loading…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-6 sm:py-10 space-y-6 sm:space-y-8">
        <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <Link to="/network" className="hover:text-slate-800 dark:hover:text-slate-200">Network</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <Link to="/network/reports" className="hover:text-slate-800 dark:hover:text-slate-200">Daily Reports</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700 dark:text-accent-400">{isEdit ? 'Edit' : 'New'}</span>
        </nav>

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Network operations</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-brand-900 dark:text-slate-100">
              {isEdit ? `Edit report — ${form.date}` : 'Daily network report'}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Capture today's network condition, traffic, and monitoring status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            {isEdit && (
              <Link to={`/network/reports/view/${form.date}`} className="btn-secondary !px-3.5 !py-2 text-xs">
                View
              </Link>
            )}
            <Link to="/network/reports" className="btn-ghost !px-3.5 !py-2 text-xs">
              ← Back
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-900 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="Report header" subtitle="Date, author, and overall status">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Report date" htmlFor="date" required>
                <input
                  id="date"
                  type="date"
                  required
                  disabled={isEdit}
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                  className={INP}
                />
                {isEdit && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Date is fixed when editing.</p>}
                {conflict && !isEdit && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    A report by {conflict.author || 'someone'} already exists for this date.
                  </p>
                )}
              </Field>
              <Field label="Author" htmlFor="author">
                <input
                  id="author"
                  type="text"
                  readOnly
                  value={form.author || '—'}
                  className={`${INP} bg-slate-50 dark:bg-slate-900/60`}
                />
              </Field>
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Overall status</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {STATUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      form.status === opt.value
                        ? 'border-accent-400 bg-accent-50/40 dark:border-accent-500/60 dark:bg-accent-500/10'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={opt.value}
                      checked={form.status === opt.value}
                      onChange={() => update('status', opt.value)}
                      className="mt-0.5 accent-accent-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${TONE_RING[opt.tone]}`}>
                        {opt.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card title="Network status template" subtitle="The daily ten-point network summary">
            <div className="grid gap-5 sm:grid-cols-2">
              {TEMPLATE_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  htmlFor={f.key}
                  className={f.type === 'textarea' ? 'sm:col-span-2' : ''}
                >
                  {f.type === 'select' ? (
                    <select
                      id={f.key}
                      value={form.template[f.key] || ''}
                      onChange={(e) => updateTemplate(f.key, e.target.value)}
                      className={INP}
                    >
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      id={f.key}
                      rows={3}
                      value={form.template[f.key] || ''}
                      onChange={(e) => updateTemplate(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={INP}
                    />
                  ) : (
                    <input
                      id={f.key}
                      type="text"
                      value={form.template[f.key] || ''}
                      onChange={(e) => updateTemplate(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={INP}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>

          {conflict && !isEdit && (
            <label className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
              <input
                type="checkbox"
                checked={overwriteOk}
                onChange={(e) => setOverwriteOk(e.target.checked)}
                className="mt-0.5 accent-amber-600"
              />
              <span>Overwrite the existing report for <span className="font-mono font-semibold">{form.date}</span>.</span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Link to="/network/reports" className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</Link>
            <button type="submit" disabled={saving} className="btn-primary !px-4 !py-2 text-xs">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save report'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, htmlFor, required, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}
