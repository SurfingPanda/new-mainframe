import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const TITLE_MAX = 200;
const DESC_MAX = 4000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.heic,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip,image/*';

const REQUEST_TYPES = [
  { key: 'incident', label: 'Incident', desc: 'Something is broken or not working as expected.' },
  { key: 'service_request', label: 'Service Request', desc: 'Need access, equipment, or a setup.' },
  { key: 'question', label: 'Question / How-to', desc: 'You need information or guidance.' },
  { key: 'change', label: 'Change Request', desc: 'Request a configuration or system change.' }
];

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

const PRIORITY_OPTIONS = [
  { key: 'low', label: 'Low', desc: 'Minor inconvenience, no business impact.', tone: 'slate' },
  { key: 'normal', label: 'Normal', desc: 'Standard request, response within a day.', tone: 'brand' },
  { key: 'high', label: 'High', desc: 'Affects productivity, needs same-day attention.', tone: 'amber' },
  { key: 'urgent', label: 'Urgent', desc: 'Outage or security issue, page on-call.', tone: 'rose' }
];

export default function CreateTicket() {
  const navigate = useNavigate();
  const user = getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'agent';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('service_request');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requester, setRequester] = useState(user?.email || '');
  const [assignee, setAssignee] = useState('');
  const [assetId, setAssetId] = useState('');
  const [files, setFiles] = useState([]);

  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/assets').then(setAssets).catch(() => setAssets([]));
  }, []);

  const titleCount = title.length;
  const descCount = description.length;
  const titleTooLong = titleCount > TITLE_MAX;
  const descTooLong = descCount > DESC_MAX;

  const canSubmit = useMemo(
    () => title.trim().length >= 4 && requester.trim() && !titleTooLong && !descTooLong && !submitting,
    [title, requester, titleTooLong, descTooLong, submitting]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Add a title (at least 4 characters) and confirm the requester before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('priority', priority);
      fd.append('request_type', requestType);
      if (category) fd.append('category', category);
      fd.append('requester', requester.trim());
      if (assignee.trim()) fd.append('assignee', assignee.trim());
      if (assetId) fd.append('asset_id', assetId);
      for (const f of files) fd.append('attachments', f);

      const created = await api('/api/tickets', { method: 'POST', body: fd });
      navigate('/tickets/all', {
        state: {
          banner: {
            type: 'success',
            text: `Ticket T-${String(created.id).padStart(4, '0')} created${
              files.length ? ` with ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''
            }.`
          }
        }
      });
    } catch (err) {
      setError(err.message || 'Could not create the ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/tickets/all" className="hover:text-slate-800">Tickets</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Create New Ticket</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Ticketing</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Create New Ticket</h1>
            <p className="mt-1 text-slate-600">
              Describe the issue or request. The IT team will triage and respond based on priority.
            </p>
          </div>
          <Link to="/tickets/all" className="btn-ghost !px-3 !py-2 text-xs self-start md:self-auto">
            Cancel
          </Link>
        </section>

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Issue details">
              <Field
                label="Title"
                hint="A short summary of the issue. Be specific."
                required
                trailing={<CharCount value={titleCount} max={TITLE_MAX} />}
              >
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Outlook keeps asking for credentials"
                  maxLength={TITLE_MAX + 50}
                  className={inputCls(titleTooLong)}
                  autoFocus
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Request Type" hint="What kind of ticket is this?" required>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className={inputCls(false)}
                  >
                    {REQUEST_TYPES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {REQUEST_TYPES.find((r) => r.key === requestType)?.desc}
                  </p>
                </Field>

                <Field label="Category" hint="Helps route the ticket to the right team.">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputCls(false)}
                  >
                    <option value="">Select a category…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label="Description"
                hint="Steps to reproduce, error messages, screenshot links — anything that helps."
                trailing={<CharCount value={descCount} max={DESC_MAX} />}
              >
                <textarea
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descPlaceholder}
                  className={`${inputCls(descTooLong)} resize-y leading-relaxed`}
                />
              </Field>
            </Card>

            <Card title="Attachments" subtitle={`Up to ${MAX_FILES} files · 10 MB each · images, PDFs, Office docs, ZIP`}>
              <FileDropzone files={files} setFiles={setFiles} setError={setError} />
            </Card>

            <Card title="Linked asset" subtitle="Optional — attach if the ticket is about a specific device.">
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className={inputCls(false)}
              >
                <option value="">No asset linked</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} — {a.type}{a.model ? ` · ${a.model}` : ''}{a.assignee ? ` · ${a.assignee}` : ''}
                  </option>
                ))}
              </select>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Priority" subtitle="How quickly does this need attention?">
              <div className="grid gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <PriorityRadio
                    key={p.key}
                    option={p}
                    checked={priority === p.key}
                    onChange={() => setPriority(p.key)}
                  />
                ))}
              </div>
            </Card>

            <Card title="People">
              <Field label="Requester" hint="Person reporting the issue." required>
                <input
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  placeholder="username or email"
                  className={inputCls(false)}
                  readOnly={!isStaff}
                />
                {!isStaff && (
                  <p className="mt-1 text-[11px] text-slate-500">Requester is locked to your account.</p>
                )}
              </Field>

              <Field
                label="Assignee"
                hint={isStaff ? 'Leave blank to triage later.' : 'IT will assign someone.'}
              >
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder={isStaff ? 'username (optional)' : 'unassigned'}
                  className={inputCls(false)}
                  disabled={!isStaff}
                />
              </Field>
            </Card>

            {error && (
              <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 lg:sticky lg:top-20">
              <button type="submit" disabled={!canSubmit} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Creating ticket…
                  </>
                ) : (
                  'Create ticket'
                )}
              </button>
              <Link to="/tickets/all" className="btn-secondary w-full text-center">
                Cancel
              </Link>
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

const descPlaceholder = `What happened?
What did you expect to happen instead?
Steps to reproduce:
1. ...
2. ...

Any error messages?`;

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

function PriorityRadio({ option, checked, onChange }) {
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
      <input
        type="radio"
        name="priority"
        value={option.key}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className={`mt-0.5 inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${tones[option.tone]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotTones[option.tone]}`} />
        {option.label}
      </span>
      <span className="flex-1 text-xs text-slate-600 leading-snug">{option.desc}</span>
      {checked && (
        <svg className="h-4 w-4 text-accent-600 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </label>
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
          PNG, JPG, PDF, DOC, XLS, ZIP — up to 10 MB
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
            <li
              key={`${f.name}-${idx}`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 pr-3"
            >
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
