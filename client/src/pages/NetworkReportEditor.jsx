import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';
import {
  emptyReport,
  getReport,
  HEALTH_OPTIONS,
  mergeIntoTemplate,
  saveReport,
} from '../lib/networkReports.js';

const INP = 'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500';
const INP_SM = 'block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500';

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

const HEALTH_FIELDS = [
  { key: 'internet',  label: 'Internet Connectivity' },
  { key: 'bandwidth', label: 'Bandwidth Usage' },
  { key: 'wireless',  label: 'Wireless Connectivity' },
  { key: 'gateway',   label: 'Gateway Status' },
  { key: 'vlan',      label: 'VLAN Communication' },
];

const PERF_BLOCKS = [
  { key: 'peak',         heading: 'Peak Network Activity',   timeKey: 'time',      timeLabel: 'Time',       tone: 'accent' },
  { key: 'interruption', heading: 'Network Interruption',    timeKey: 'timeRange', timeLabel: 'Time range', tone: 'rose'   },
  { key: 'lowest',       heading: 'Lowest Network Activity', timeKey: 'time',      timeLabel: 'Time',       tone: 'brand'  },
];

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

  const update      = (key, value)               => setForm((f) => ({ ...f, [key]: value }));
  const updatePerf  = (block, key, value)        => setForm((f) => ({ ...f, performance: { ...f.performance, [block]: { ...f.performance[block], [key]: value } } }));
  const updateHealth = (key, value)              => setForm((f) => ({ ...f, health: { ...f.health, [key]: value } }));
  const updateSample = (i, key, value)           => setForm((f) => {
    const next = f.trafficSamples.map((s, idx) => (idx === i ? { ...s, [key]: value } : s));
    return { ...f, trafficSamples: next };
  });
  const addSample    = ()                        => setForm((f) => ({ ...f, trafficSamples: [...f.trafficSamples, { time: '', downloadMbps: 0, uploadMbps: 0 }] }));
  const removeSample = (i)                       => setForm((f) => ({ ...f, trafficSamples: f.trafficSamples.filter((_, idx) => idx !== i) }));
  const replaceSamples = (samples)               => setForm((f) => ({ ...f, trafficSamples: samples }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.date) {
      setError('Please pick a report date.');
      return;
    }
    if (!form.executiveSummary.trim()) {
      setError('Please write the executive summary for the day.');
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
              {isEdit ? `Edit report — ${form.date}` : 'Network data download/upload report'}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Capture today's network performance, health, and incidents.
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

          <Card title="Executive summary" subtitle="A short paragraph framing the day">
            <textarea
              rows={3}
              required
              value={form.executiveSummary}
              onChange={(e) => update('executiveSummary', e.target.value)}
              placeholder="Summarize average throughput, the main events, and the overall health of the network for the day."
              className={INP}
            />
          </Card>

          <Card title="Network performance overview" subtitle="Peak, interruption, and lowest activity windows">
            <div className="grid gap-5 lg:grid-cols-3">
              {PERF_BLOCKS.map((block) => {
                const data = form.performance[block.key];
                return (
                  <div key={block.key} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xs font-bold uppercase tracking-wide ${
                        block.tone === 'accent' ? 'text-accent-700 dark:text-accent-300'
                        : block.tone === 'rose' ? 'text-rose-700 dark:text-rose-300'
                        : 'text-brand-800 dark:text-brand-200'
                      }`}>
                        {block.heading}
                      </h3>
                    </div>
                    <div className="mt-3 space-y-3">
                      <Field label={block.timeLabel} small>
                        <input
                          type="text"
                          value={data[block.timeKey] || ''}
                          onChange={(e) => updatePerf(block.key, block.timeKey, e.target.value)}
                          placeholder={block.key === 'interruption' ? '12:00 PM - 1:00 PM' : '9:20 AM'}
                          className={INP_SM}
                        />
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Clients" small>
                          <input
                            type="number"
                            min={0}
                            value={data.clients}
                            onChange={(e) => updatePerf(block.key, 'clients', Number(e.target.value) || 0)}
                            className={INP_SM}
                          />
                        </Field>
                        <Field label="↓ Mbps" small>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={data.avgDownloadMbps}
                            onChange={(e) => updatePerf(block.key, 'avgDownloadMbps', Number(e.target.value) || 0)}
                            className={INP_SM}
                          />
                        </Field>
                        <Field label="↑ kbps" small>
                          <input
                            type="number"
                            min={0}
                            value={data.avgUploadKbps}
                            onChange={(e) => updatePerf(block.key, 'avgUploadKbps', Number(e.target.value) || 0)}
                            className={INP_SM}
                          />
                        </Field>
                      </div>
                      <Field label="Observation" small>
                        <textarea
                          rows={3}
                          value={data.observation}
                          onChange={(e) => updatePerf(block.key, 'observation', e.target.value)}
                          placeholder="What was happening on the network at this time."
                          className={INP_SM}
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Network health status" subtitle="Status by category">
            <div className="grid gap-4 sm:grid-cols-2">
              {HEALTH_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <select
                    value={form.health[f.key] || ''}
                    onChange={(e) => updateHealth(f.key, e.target.value)}
                    className={INP}
                  >
                    {HEALTH_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </Field>
              ))}
              <div className="sm:col-span-2">
                <Field label="Critical Downtime">
                  <input
                    type="text"
                    value={form.health.criticalDowntime || ''}
                    onChange={(e) => updateHealth('criticalDowntime', e.target.value)}
                    placeholder="e.g. 12:00 PM - 1:00 PM (1 hour) — or “None”"
                    className={INP}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Client and traffic analysis" subtitle="How users and traffic looked today">
            <textarea
              rows={4}
              value={form.trafficAnalysis}
              onChange={(e) => update('trafficAnalysis', e.target.value)}
              placeholder="Number of connected clients, top consumers, traffic patterns, anomalies."
              className={INP}
            />
          </Card>

          <Card title="Network observations" subtitle="What stood out today">
            <textarea
              rows={4}
              value={form.observations}
              onChange={(e) => update('observations', e.target.value)}
              placeholder="Latency trends, packet loss, AP coverage notes, anything unusual."
              className={INP}
            />
          </Card>

          <Card title="Recommendations" subtitle="Actions to consider">
            <textarea
              rows={4}
              value={form.recommendations}
              onChange={(e) => update('recommendations', e.target.value)}
              placeholder="Short-term mitigations and longer-term improvements."
              className={INP}
            />
          </Card>

          <Card title="Incident summary" subtitle="Any incidents and their resolution">
            <textarea
              rows={4}
              value={form.incidentSummary}
              onChange={(e) => update('incidentSummary', e.target.value)}
              placeholder="What broke, when, what caused it, how it was fixed."
              className={INP}
            />
          </Card>

          <Card title="Network traffic overview" subtitle="Sample points for the daily traffic chart">
            <ChartImageUploader onExtracted={replaceSamples} />
            <div className="my-5 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <div className="space-y-2">
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <div className="sm:col-span-3">Time</div>
                <div className="sm:col-span-4">Download (Mbps)</div>
                <div className="sm:col-span-4">Upload (Mbps)</div>
                <div className="sm:col-span-1" />
              </div>
              {form.trafficSamples.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-3">
                    <input
                      type="text"
                      value={s.time}
                      onChange={(e) => updateSample(i, 'time', e.target.value)}
                      placeholder="08:00"
                      className={INP_SM}
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={s.downloadMbps}
                      onChange={(e) => updateSample(i, 'downloadMbps', Number(e.target.value) || 0)}
                      className={INP_SM}
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-4">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={s.uploadMbps}
                      onChange={(e) => updateSample(i, 'uploadMbps', Number(e.target.value) || 0)}
                      className={INP_SM}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeSample(i)}
                      aria-label="Remove sample"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addSample}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-brand-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add sample
              </button>
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

function ChartImageUploader({ onExtracted }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setError('');
    setSuccess('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSelect = (e) => {
    const f = e.target.files?.[0];
    setError('');
    setSuccess('');
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPEG, WebP, GIF).');
      setFile(null);
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError('Image must be 8 MB or smaller.');
      setFile(null);
      return;
    }
    setFile(f);
  };

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api('/api/network/extract-chart', { method: 'POST', body: fd });
      if (!Array.isArray(res?.samples) || res.samples.length === 0) {
        throw new Error('No data points were detected in the image.');
      }
      onExtracted(res.samples);
      setSuccess(`Extracted ${res.samples.length} point${res.samples.length === 1 ? '' : 's'} from your image.`);
    } catch (e) {
      setError(e.message || 'Could not extract data from this image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-md bg-accent-50 ring-1 ring-inset ring-accent-200 text-accent-700 flex-none dark:bg-accent-500/15 dark:ring-accent-500/30 dark:text-accent-300">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-brand-900 dark:text-slate-100">
            Auto-extract from a chart image
            <span className="ml-2 inline-flex items-center rounded-full bg-accent-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30">
              Beta
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Drop a screenshot of a network traffic chart — we'll read the points and fill the samples below.
            <span className="block text-[11px] text-slate-500 mt-0.5">Replaces all sample rows below on success.</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="btn-secondary !px-3.5 !py-2 text-xs cursor-pointer">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
              Choose image
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleSelect}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={extract}
              disabled={!file || busy}
              className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <svg className="h-4 w-4 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                'Extract data'
              )}
            </button>
            {file && !busy && (
              <button type="button" onClick={reset} className="btn-ghost !px-3 !py-2 text-xs">
                Clear
              </button>
            )}
            {file && (
              <span className="text-[11px] text-slate-500 truncate max-w-[200px] dark:text-slate-400" title={file.name}>
                {file.name}
              </span>
            )}
          </div>

          {previewUrl && (
            <div className="mt-3 inline-block rounded-md border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950">
              <img
                src={previewUrl}
                alt="Chart preview"
                className="block max-h-40 max-w-full rounded"
              />
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
              {error}
            </p>
          )}
          {success && !error && (
            <p className="mt-3 rounded-md bg-accent-50 px-2.5 py-1.5 text-xs text-accent-800 ring-1 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30">
              {success}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, required, small, children }) {
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          className={`block font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${
            small ? 'text-[10px] mb-1' : 'text-xs mb-1.5'
          }`}
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}
