import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const TITLE_MAX = 200;
const TEXT_MAX = 2000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.heic,.pdf,.txt,.log,.doc,.docx,.xls,.xlsx,.zip,image/*';

const CATEGORIES = [
  'Hardware',
  'Software',
  'Network & Connectivity',
  'Account & Access',
  'Email & Communication',
  'Security',
  'Printing & Peripherals',
  'Other'
];

const AFFECTED_SERVICES = [
  'Email / Outlook',
  'VPN / Remote Access',
  'File Shares',
  'ERP / Business Apps',
  'Internet / Network',
  'Phone / Voice',
  'Printing',
  'Authentication / SSO',
  'Workstation',
  'Other'
];

const SEVERITIES = [
  { key: 'sev1', label: 'SEV-1', desc: 'Critical outage. Production service down or major data loss.', tone: 'rose' },
  { key: 'sev2', label: 'SEV-2', desc: 'Severe degradation. Significant function impaired, no full workaround.', tone: 'amber' },
  { key: 'sev3', label: 'SEV-3', desc: 'Moderate impact. Workaround exists, fix can be scheduled.', tone: 'brand' },
  { key: 'sev4', label: 'SEV-4', desc: 'Minor issue. Cosmetic or small annoyance.', tone: 'slate' }
];

const IMPACT_OPTIONS = [
  { key: 'organization', label: 'Organization-wide', score: 4, desc: 'All users / all sites affected.' },
  { key: 'multi_dept', label: 'Multiple departments', score: 3, desc: 'Several teams or sites affected.' },
  { key: 'department', label: 'Single department', score: 2, desc: 'One team or office affected.' },
  { key: 'individual', label: 'Single user', score: 1, desc: 'One person affected.' }
];

const URGENCY_OPTIONS = [
  { key: 'critical', label: 'Critical', score: 4, desc: 'Work is fully blocked. Needs immediate attention.' },
  { key: 'high', label: 'High', score: 3, desc: 'Major impact on productivity. Same-day fix needed.' },
  { key: 'normal', label: 'Normal', score: 2, desc: 'Inconvenient but workable. Address within a day.' },
  { key: 'low', label: 'Low', score: 1, desc: 'Can wait. No timeline pressure.' }
];

const PRIORITY_OPTIONS = [
  { key: 'urgent', label: 'Urgent', desc: 'Outage or security issue, page on-call.', tone: 'rose' },
  { key: 'high', label: 'High', desc: 'Affects productivity, needs same-day attention.', tone: 'amber' },
  { key: 'normal', label: 'Normal', desc: 'Standard incident, response within a day.', tone: 'brand' },
  { key: 'low', label: 'Low', desc: 'Minor incident, no business impact.', tone: 'slate' }
];

const DETECTION_SOURCES = [
  'User report',
  'Self-detected',
  'Monitoring / alert',
  'Vendor / third-party',
  'Help desk call',
  'Other'
];

function suggestPriority(impactKey, urgencyKey) {
  const i = IMPACT_OPTIONS.find((x) => x.key === impactKey)?.score || 0;
  const u = URGENCY_OPTIONS.find((x) => x.key === urgencyKey)?.score || 0;
  const sum = i + u;
  if (sum >= 7) return 'urgent';
  if (sum >= 5) return 'high';
  if (sum >= 3) return 'normal';
  return 'low';
}

function localNowForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CreateIncident() {
  const navigate = useNavigate();
  const user = getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'agent';

  // Core fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [affectedService, setAffectedService] = useState('');

  // Triage
  const [severity, setSeverity] = useState('sev3');
  const [impact, setImpact] = useState('individual');
  const [urgency, setUrgency] = useState('normal');
  const [priority, setPriority] = useState('normal');
  const [priorityTouched, setPriorityTouched] = useState(false);

  // Detection
  const [detectedAt, setDetectedAt] = useState(localNowForInput());
  const [detectionSource, setDetectionSource] = useState('User report');
  const [usersAffected, setUsersAffected] = useState('');

  // Narrative
  const [symptoms, setSymptoms] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [businessImpact, setBusinessImpact] = useState('');
  const [hasWorkaround, setHasWorkaround] = useState('no');
  const [workaround, setWorkaround] = useState('');

  // People & links
  const [requester, setRequester] = useState(user?.name || user?.email || '');
  const [assignee, setAssignee] = useState('');
  const [assetId, setAssetId] = useState('');

  // Attachments
  const [files, setFiles] = useState([]);

  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/assets').then(setAssets).catch(() => setAssets([]));
    api('/api/users/assignable').then(setUsers).catch(() => setUsers([]));
  }, []);

  // Auto-suggest priority from impact × urgency until the user manually picks one.
  useEffect(() => {
    if (!priorityTouched) setPriority(suggestPriority(impact, urgency));
  }, [impact, urgency, priorityTouched]);

  const titleCount = title.length;
  const symptomsCount = symptoms.length;
  const titleTooLong = titleCount > TITLE_MAX;
  const symptomsTooLong = symptomsCount > TEXT_MAX;

  const canSubmit = useMemo(() => (
    title.trim().length >= 4 &&
    requester.trim() &&
    symptoms.trim().length >= 10 &&
    category &&
    !titleTooLong &&
    !symptomsTooLong &&
    !submitting
  ), [title, requester, symptoms, category, titleTooLong, symptomsTooLong, submitting]);

  const composeDescription = () => {
    const sevLabel = SEVERITIES.find((s) => s.key === severity)?.label || severity;
    const impactLabel = IMPACT_OPTIONS.find((x) => x.key === impact)?.label || impact;
    const urgencyLabel = URGENCY_OPTIONS.find((x) => x.key === urgency)?.label || urgency;
    const detected = detectedAt ? new Date(detectedAt).toLocaleString() : 'Not specified';

    const lines = [];
    lines.push('## Incident summary');
    lines.push(`- **Severity:** ${sevLabel}`);
    lines.push(`- **Impact:** ${impactLabel}`);
    lines.push(`- **Urgency:** ${urgencyLabel}`);
    if (affectedService) lines.push(`- **Affected service:** ${affectedService}`);
    if (usersAffected) lines.push(`- **Users affected:** ${usersAffected}`);
    lines.push(`- **Detected at:** ${detected}`);
    lines.push(`- **Detected by:** ${detectionSource}`);
    lines.push('');
    lines.push('## Symptoms');
    lines.push(symptoms.trim());
    if (stepsToReproduce.trim()) {
      lines.push('');
      lines.push('## Steps to reproduce');
      lines.push(stepsToReproduce.trim());
    }
    if (businessImpact.trim()) {
      lines.push('');
      lines.push('## Business impact');
      lines.push(businessImpact.trim());
    }
    lines.push('');
    lines.push('## Workaround');
    if (hasWorkaround === 'yes' && workaround.trim()) {
      lines.push(workaround.trim());
    } else if (hasWorkaround === 'yes') {
      lines.push('Yes — details to follow.');
    } else {
      lines.push('No workaround available.');
    }
    return lines.join('\n');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Fill in title, category, symptoms, and the requester before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', composeDescription());
      fd.append('priority', priority);
      fd.append('request_type', 'incident');
      fd.append('category', category);
      fd.append('requester', requester.trim());
      if (assignee.trim()) fd.append('assignee', assignee.trim());
      if (assetId) fd.append('asset_id', assetId);
      for (const f of files) fd.append('attachments', f);

      const created = await api('/api/tickets', { method: 'POST', body: fd });
      navigate('/tickets/all', {
        state: {
          banner: {
            type: 'success',
            text: `Incident T-${String(created.id).padStart(4, '0')} reported${
              files.length ? ` with ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''
            }.`
          }
        }
      });
    } catch (err) {
      setError(err.message || 'Could not create the incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const suggested = suggestPriority(impact, urgency);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/tickets/all" className="hover:text-slate-800">Tickets</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Report Incident</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Incident management</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 flex items-center gap-2">
              <svg className="h-7 w-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l9 16H3L12 3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              Report an Incident
            </h1>
            <p className="mt-1 text-slate-600">
              Capture what's broken, who's affected, and how urgent it is. The IT team will triage immediately.
            </p>
          </div>
          <Link to="/tickets/all" className="btn-ghost !px-3 !py-2 text-xs self-start md:self-auto">Cancel</Link>
        </section>

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Incident summary" subtitle="A short, specific title makes triage faster.">
              <Field label="Title" required trailing={<CharCount value={titleCount} max={TITLE_MAX} />}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Email server unreachable for HQ office"
                  maxLength={TITLE_MAX + 50}
                  className={inputCls(titleTooLong)}
                  autoFocus
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category" hint="Helps route the ticket to the right team." required>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls(false)}>
                    <option value="">Select a category…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Affected service / system" hint="Which application or system is impacted?">
                  <select value={affectedService} onChange={(e) => setAffectedService(e.target.value)} className={inputCls(false)}>
                    <option value="">Select if known…</option>
                    {AFFECTED_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            </Card>

            <Card title="Triage" subtitle="Severity, impact, and urgency drive the priority and SLA.">
              <Field label="Severity" hint="Technical severity of the issue itself." required>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SEVERITIES.map((s) => (
                    <RadioCard
                      key={s.key}
                      name="severity"
                      option={s}
                      checked={severity === s.key}
                      onChange={() => setSeverity(s.key)}
                    />
                  ))}
                </div>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Impact" hint="How many people or teams are affected?" required>
                  <div className="space-y-2">
                    {IMPACT_OPTIONS.map((o) => (
                      <SimpleRadio
                        key={o.key}
                        name="impact"
                        label={o.label}
                        desc={o.desc}
                        checked={impact === o.key}
                        onChange={() => setImpact(o.key)}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="Urgency" hint="How time-critical is the fix?" required>
                  <div className="space-y-2">
                    {URGENCY_OPTIONS.map((o) => (
                      <SimpleRadio
                        key={o.key}
                        name="urgency"
                        label={o.label}
                        desc={o.desc}
                        checked={urgency === o.key}
                        onChange={() => setUrgency(o.key)}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            </Card>

            <Card title="What's happening" subtitle="Be specific so the responder doesn't have to guess.">
              <Field
                label="Symptoms"
                hint="What is the user seeing? Error messages, unexpected behavior."
                required
                trailing={<CharCount value={symptomsCount} max={TEXT_MAX} />}
              >
                <textarea
                  rows={5}
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder={'e.g. Outlook displays "Cannot connect to server" when launching. The status bar shows Disconnected. Error code 0x800CCC0E.'}
                  className={`${inputCls(symptomsTooLong)} resize-y leading-relaxed`}
                />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Steps to reproduce" hint="Optional. Helps responders confirm the problem.">
                  <textarea
                    rows={4}
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    placeholder={'1. Open Outlook\n2. Wait 5–10 seconds\n3. Error appears'}
                    className={`${inputCls(false)} resize-y leading-relaxed font-mono text-[13px]`}
                  />
                </Field>

                <Field label="Business impact" hint="What work is blocked or delayed because of this?">
                  <textarea
                    rows={4}
                    value={businessImpact}
                    onChange={(e) => setBusinessImpact(e.target.value)}
                    placeholder="e.g. Sales team can't send quotes; deal closes blocked until resolved."
                    className={`${inputCls(false)} resize-y leading-relaxed`}
                  />
                </Field>
              </div>

              <Field label="Workaround available?">
                <div className="flex gap-2">
                  <YesNoPill checked={hasWorkaround === 'yes'} onClick={() => setHasWorkaround('yes')}>Yes</YesNoPill>
                  <YesNoPill checked={hasWorkaround === 'no'} onClick={() => setHasWorkaround('no')}>No</YesNoPill>
                </div>
                {hasWorkaround === 'yes' && (
                  <textarea
                    rows={2}
                    value={workaround}
                    onChange={(e) => setWorkaround(e.target.value)}
                    placeholder="Describe the workaround so others can use it while the fix is in flight."
                    className={`${inputCls(false)} mt-2 resize-y leading-relaxed`}
                  />
                )}
              </Field>
            </Card>

            <Card title="Attachments" subtitle={`Up to ${MAX_FILES} files · 10 MB each · screenshots, logs, error reports`}>
              <FileDropzone files={files} setFiles={setFiles} setError={setError} />
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Priority" subtitle={`Suggested from impact × urgency: ${PRIORITY_OPTIONS.find((p) => p.key === suggested)?.label}.`}>
              <div className="grid gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <PriorityRadio
                    key={p.key}
                    option={p}
                    checked={priority === p.key}
                    suggested={suggested === p.key && !priorityTouched}
                    onChange={() => { setPriority(p.key); setPriorityTouched(true); }}
                  />
                ))}
              </div>
              {priorityTouched && (
                <button
                  type="button"
                  onClick={() => { setPriorityTouched(false); setPriority(suggested); }}
                  className="mt-2 text-[11px] font-semibold text-accent-700 hover:text-accent-800"
                >
                  Reset to suggested ({PRIORITY_OPTIONS.find((p) => p.key === suggested)?.label})
                </button>
              )}
            </Card>

            <Card title="Detection" subtitle="When and how was the incident discovered?">
              <Field label="Detected at" hint="When was it first observed?">
                <input
                  type="datetime-local"
                  value={detectedAt}
                  onChange={(e) => setDetectedAt(e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
              <Field label="Detected by" hint="Source of the report.">
                <select value={detectionSource} onChange={(e) => setDetectionSource(e.target.value)} className={inputCls(false)}>
                  {DETECTION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Users affected" hint="Estimate if known.">
                <input
                  type="number"
                  min="0"
                  value={usersAffected}
                  onChange={(e) => setUsersAffected(e.target.value)}
                  placeholder="e.g. 25"
                  className={inputCls(false)}
                />
              </Field>
            </Card>

            <Card title="People">
              <Field label="Requester" hint="Person reporting the incident." required>
                <input
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  placeholder="username or email"
                  className={inputCls(false)}
                  readOnly={!isStaff}
                />
                {!isStaff && <p className="mt-1 text-[11px] text-slate-500">Requester is locked to your account.</p>}
              </Field>

              <Field label="Assignee" hint={isStaff ? 'Search and pick a responder, or leave for triage.' : 'IT will assign someone.'}>
                <AssigneePicker value={assignee} users={users} onChange={setAssignee} disabled={!isStaff} />
              </Field>
            </Card>

            <Card title="Linked asset" subtitle="Optional — attach if the incident involves a specific device.">
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inputCls(false)}>
                <option value="">No asset linked</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} — {a.type}{a.model ? ` · ${a.model}` : ''}{a.assignee ? ` · ${a.assignee}` : ''}
                  </option>
                ))}
              </select>
            </Card>

            {error && (
              <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            <div className="flex flex-col gap-2 lg:sticky lg:top-20">
              <button type="submit" disabled={!canSubmit} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Reporting incident…
                  </>
                ) : (
                  'Report incident'
                )}
              </button>
              <Link to="/tickets/all" className="btn-secondary w-full text-center">Cancel</Link>
              <p className="text-[11px] text-slate-500 text-center mt-1">
                You'll be redirected to the ticket list after submission.
              </p>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}

/* -------- helpers -------- */

function inputCls(invalid) {
  return `block w-full rounded-md border px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
    invalid
      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
      : 'border-slate-300 focus:border-accent-500 focus:ring-accent-500'
  } disabled:bg-slate-50 disabled:text-slate-400`;
}

function Card({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </header>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, required, trailing, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {trailing}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function CharCount({ value, max }) {
  const over = value > max;
  return (
    <span className={`text-[11px] tabular-nums ${over ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
      {value}/{max}
    </span>
  );
}

function RadioCard({ name, option, checked, onChange }) {
  const tones = {
    slate: 'border-slate-300 bg-slate-50 text-slate-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-800'
  };
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-all ${
        checked
          ? 'border-brand-900 ring-2 ring-brand-900/10 bg-white shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className={`mt-0.5 inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${tones[option.tone]}`}>
        {option.label}
      </span>
      <span className="flex-1 text-xs text-slate-600 leading-snug">{option.desc}</span>
    </label>
  );
}

function SimpleRadio({ name, label, desc, checked, onChange }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors ${
      checked ? 'border-brand-900 bg-brand-50/40' : 'border-slate-200 hover:border-slate-300'
    }`}>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 text-accent-600 focus:ring-accent-500"
      />
      <span className="flex-1">
        <span className="block text-xs font-semibold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500 leading-snug">{desc}</span>
      </span>
    </label>
  );
}

function PriorityRadio({ option, checked, suggested, onChange }) {
  const tones = {
    slate: 'border-slate-300 bg-slate-50 text-slate-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-800'
  };
  const dotTones = {
    slate: 'bg-slate-400',
    brand: 'bg-brand-700',
    amber: 'bg-amber-500',
    rose: 'bg-rose-600'
  };
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-all ${
        checked
          ? 'border-brand-900 ring-2 ring-brand-900/10 bg-white shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <input type="radio" name="priority" checked={checked} onChange={onChange} className="sr-only" />
      <span className={`mt-0.5 inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${tones[option.tone]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotTones[option.tone]}`} />
        {option.label}
      </span>
      <span className="flex-1 text-xs text-slate-600 leading-snug">{option.desc}</span>
      {suggested && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-accent-700 bg-accent-50 ring-1 ring-accent-200 rounded-full px-2 py-0.5">
          Suggested
        </span>
      )}
      {checked && (
        <svg className="h-4 w-4 text-accent-600 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </label>
  );
}

function YesNoPill({ checked, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
        checked
          ? 'bg-brand-900 text-white ring-brand-900'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function AssigneePicker({ value, users, onChange, disabled }) {
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

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (u) => { onChange(u.name); setOpen(false); };

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
        placeholder="Type to search users or enter a name"
        autoComplete="off"
        className={inputCls(false)}
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

function FileDropzone({ files, setFiles, setError }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (incoming) => {
    setError('');
    const next = [...files];
    for (const f of incoming) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" is larger than 10 MB.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (idx) => setFiles(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          drag
            ? 'border-accent-500 bg-accent-50/60'
            : 'border-slate-300 bg-slate-50/60 hover:border-accent-300 hover:bg-accent-50/30'
        }`}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 text-accent-700">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          </svg>
        </span>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-brand-900">Click to upload</span> or drag &amp; drop
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Screenshots, error logs, PDFs, Office docs — up to 10 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 pr-3">
              <FilePreview file={f} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                <div className="text-[11px] text-slate-500">{formatSize(f.size)} · {f.type || 'unknown type'}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${f.name}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilePreview({ file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (src) {
    return <img src={src} alt={file.name} className="h-10 w-10 rounded object-cover ring-1 ring-slate-200" />;
  }
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-slate-100 ring-1 ring-slate-200 text-slate-500">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    </span>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
