import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' }
];
const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' }
];
const REQUEST_TYPES = [
  { key: 'incident', label: 'Incident' },
  { key: 'service_request', label: 'Service Request' },
  { key: 'question', label: 'Question / How-to' },
  { key: 'change', label: 'Change Request' }
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

const SLA_DAYS = { low: 7, normal: 3, high: 2, urgent: 1 };
const RESOLVED_STATUSES = new Set(['resolved', 'closed']);

const DRAFT_FIELDS = [
  'description', 'status', 'priority', 'request_type',
  'category', 'requester', 'assignee'
];

function makeDraft(ticket) {
  return DRAFT_FIELDS.reduce((acc, f) => {
    acc[f] = ticket?.[f] ?? '';
    return acc;
  }, {});
}

export default function TicketDetail() {
  const { id } = useParams();
  const me = getUser();
  const isStaff = me?.role === 'admin' || me?.role === 'agent';

  const [ticket, setTicket] = useState(null);
  const [draft, setDraft] = useState({});
  const [activity, setActivity] = useState([]);
  const [kbLinks, setKbLinks] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reloadActivity = async () => {
    try {
      const list = await api(`/api/tickets/${id}/activity`);
      setActivity(list);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api(`/api/tickets/${id}`),
      api(`/api/tickets/${id}/activity`).catch(() => []),
      api(`/api/tickets/${id}/kb`).catch(() => []),
      api('/api/users/assignable').catch(() => [])
    ])
      .then(([t, acts, kb, users]) => {
        if (!active) return;
        setTicket(t);
        setDraft(makeDraft(t));
        setActivity(acts);
        setKbLinks(kb);
        setAssignableUsers(users);
        setError('');
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const setField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const dirtyFields = useMemo(() => {
    if (!ticket) return [];
    const changed = [];
    for (const f of DRAFT_FIELDS) {
      const a = (ticket[f] ?? '') === null ? '' : ticket[f] ?? '';
      const b = draft[f] ?? '';
      if (String(a) !== String(b)) changed.push(f);
    }
    return changed;
  }, [ticket, draft]);

  const isDirty = dirtyFields.length > 0;

  const save = async () => {
    if (!isDirty || saving) return;
    const patch = {};
    for (const f of dirtyFields) {
      const v = draft[f];
      patch[f] = v === '' ? null : v;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await api(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      const merged = { ...ticket, ...updated };
      setTicket(merged);
      setDraft(makeDraft(merged));
      reloadActivity();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!ticket) return;
    setDraft(makeDraft(ticket));
    setError('');
  };

  const addNote = async (body, file) => {
    const fd = new FormData();
    if (body) fd.append('body', body);
    if (file) fd.append('attachment', file);
    const note = await api(`/api/tickets/${id}/activity`, {
      method: 'POST',
      body: fd
    });
    setActivity((prev) => [note, ...prev.filter((a) => !a.synthetic)]);
    if (file) {
      api(`/api/tickets/${id}`).then(setTicket).catch(() => {});
    }
  };

  const linkArticle = async (articleId) => {
    const link = await api(`/api/tickets/${id}/kb`, {
      method: 'POST',
      body: JSON.stringify({ article_id: articleId })
    });
    setKbLinks((prev) => [link, ...prev]);
    reloadActivity();
  };

  const unlinkArticle = async (articleId) => {
    await api(`/api/tickets/${id}/kb/${articleId}`, { method: 'DELETE' });
    setKbLinks((prev) => prev.filter((a) => a.id !== articleId));
    reloadActivity();
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
          <span className="text-accent-700">T-{String(id).padStart(4, '0')}</span>
        </nav>

        {loading && (
          <div className="py-24 text-center text-sm text-slate-500">Loading ticket…</div>
        )}

        {error && !loading && !ticket && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <Link to="/tickets/all" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
              ← Back to all tickets
            </Link>
          </div>
        )}

        {ticket && (
          <>
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">
                    T-{String(ticket.id).padStart(4, '0')}
                  </span>
                  <StatusPill status={ticket.status} />
                  <PriorityPill priority={ticket.priority} />
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-900">
                  {ticket.title}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Opened {formatDateTime(ticket.created_at)} · Updated {formatDateTime(ticket.updated_at)}
                </p>
              </div>
              <Link to="/tickets/all" className="btn-ghost !px-3.5 !py-2 text-xs self-start">
                ← All tickets
              </Link>
            </header>

            <SlaBanner ticket={ticket} />

            {error && (
              <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {/* LEFT: editable ticket fields */}
              <div className="lg:col-span-2 space-y-6">
                <Card title="Ticket details">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      label="Status"
                      value={draft.status}
                      options={STATUSES}
                      onChange={(v) => setField('status', v)}
                      disabled={!isStaff}
                    />
                    <SelectField
                      label="Priority"
                      value={draft.priority}
                      options={PRIORITIES}
                      onChange={(v) => setField('priority', v)}
                      disabled={!isStaff}
                    />
                    <SelectField
                      label="Request type"
                      value={draft.request_type}
                      options={REQUEST_TYPES}
                      onChange={(v) => setField('request_type', v)}
                      disabled={!isStaff}
                    />
                    <SelectField
                      label="Category"
                      value={draft.category || ''}
                      options={[
                        { key: '', label: '— None —' },
                        ...CATEGORIES.map((c) => ({ key: c, label: c }))
                      ]}
                      onChange={(v) => setField('category', v)}
                      disabled={!isStaff}
                    />
                  </div>

                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={draft.description || ''}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="Describe the issue, steps to reproduce, expected behavior, error messages…"
                    rows={10}
                    disabled={!isStaff}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-700 resize-y"
                  />
                </Card>

                <Card title="People">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Requester</FieldLabel>
                      <input
                        value={draft.requester || ''}
                        onChange={(e) => setField('requester', e.target.value)}
                        disabled={!isStaff}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50 disabled:text-slate-700"
                      />
                    </div>
                    <div>
                      <FieldLabel>Assignee</FieldLabel>
                      <AssigneePicker
                        value={draft.assignee || ''}
                        users={assignableUsers}
                        onChange={(v) => setField('assignee', v)}
                        disabled={!isStaff}
                      />
                    </div>
                  </div>
                </Card>

                <Card
                  title="Attachments"
                  subtitle={
                    ticket.attachments?.length
                      ? `${ticket.attachments.length} file${ticket.attachments.length === 1 ? '' : 's'}`
                      : 'No files attached'
                  }
                >
                  {ticket.attachments?.length ? (
                    <ul className="space-y-2">
                      {ticket.attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 pr-3"
                        >
                          <AttachmentThumb attachment={a} />
                          <div className="min-w-0 flex-1">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-sm font-medium text-accent-700 hover:text-accent-800 truncate"
                            >
                              {a.filename}
                            </a>
                            <div className="text-[11px] text-slate-500">
                              {formatSize(a.size_bytes)} · {a.mime_type}
                              {a.uploaded_by ? ` · uploaded by ${a.uploaded_by}` : ''}
                            </div>
                          </div>
                          <a
                            href={a.url}
                            download={a.filename}
                            className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                          >
                            Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm italic text-slate-400">No attachments. Use the activity panel to attach files.</p>
                  )}
                </Card>

                {ticket.asset && (
                  <Card title="Linked asset">
                    <p className="font-mono text-xs text-slate-500">{ticket.asset.asset_tag}</p>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">
                      {ticket.asset.type}
                      {ticket.asset.model ? ` · ${ticket.asset.model}` : ''}
                    </p>
                    {ticket.asset.assignee && (
                      <p className="text-xs text-slate-500 mt-1">
                        Assigned to <span className="text-slate-700">{ticket.asset.assignee}</span>
                      </p>
                    )}
                    {ticket.asset.location && (
                      <p className="text-xs text-slate-500">Location: {ticket.asset.location}</p>
                    )}
                  </Card>
                )}
              </div>

              {/* RIGHT */}
              <aside className="space-y-6">
                <KbLinkPanel
                  links={kbLinks}
                  canEdit={isStaff}
                  onLink={linkArticle}
                  onUnlink={unlinkArticle}
                />

                <ActivityPanel
                  activity={activity}
                  canPost={!!me}
                  onAddNote={addNote}
                  ticketId={ticket.id}
                />

                <SavePanel
                  isDirty={isDirty}
                  dirtyFields={dirtyFields}
                  saving={saving}
                  onSave={save}
                  onDiscard={discard}
                  visible={isStaff}
                />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* -------- Save panel -------- */

function SavePanel({ isDirty, dirtyFields, saving, onSave, onDiscard, visible }) {
  if (!visible) return null;
  return (
    <section
      className={`rounded-lg border shadow-card transition-colors ${
        isDirty ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-brand-900">
              {isDirty ? 'Unsaved changes' : 'No pending changes'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {isDirty
                ? `${dirtyFields.length} field${dirtyFields.length === 1 ? '' : 's'} edited: ${dirtyFields.map(labelForField).join(', ')}.`
                : 'Edit fields on the left, then click Save to apply.'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || saving}
            className="btn-primary !px-3.5 !py-2 text-xs flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={!isDirty || saving}
            className="btn-ghost !px-3.5 !py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Discard
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------- KB link panel -------- */

function KbLinkPanel({ links, canEdit, onLink, onUnlink }) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!picking) return;
    setSearching(true);
    const handle = setTimeout(() => {
      const url = query.trim() ? `/api/kb?q=${encodeURIComponent(query.trim())}` : '/api/kb';
      api(url)
        .then(setResults)
        .catch((e) => setErr(e.message))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [picking, query]);

  const handleLink = async (article) => {
    setErr('');
    try {
      await onLink(article.id);
      setPicking(false);
      setQuery('');
    } catch (e) {
      setErr(e.message);
    }
  };

  const linkedIds = new Set(links.map((l) => l.id));

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">Knowledge base</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {links.length
              ? `${links.length} article${links.length === 1 ? '' : 's'} linked`
              : 'No articles linked'}
          </p>
        </div>
        {canEdit && !picking && (
          <button
            type="button"
            onClick={() => { setPicking(true); setErr(''); }}
            className="btn-secondary !px-2.5 !py-1.5 text-[11px]"
          >
            + Link article
          </button>
        )}
      </header>

      {picking && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 space-y-2">
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or body…"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {searching ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs italic text-slate-400">No articles found.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {results.map((a) => {
                  const already = linkedIds.has(a.id);
                  return (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {a.category || 'Uncategorized'}{!a.published ? ' · draft' : ''}
                        </p>
                      </div>
                      {already ? (
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Linked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLink(a)}
                          className="btn-primary !px-2.5 !py-1 text-[11px]"
                        >
                          Link
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setPicking(false); setQuery(''); setErr(''); }}
              className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="p-5">
        {links.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            Link knowledge base articles to give the requester self-serve answers.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded-md border border-slate-200 p-2"
              >
                <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/kb/${a.slug}`}
                    className="block truncate text-sm font-medium text-accent-700 hover:text-accent-800"
                  >
                    {a.title}
                  </Link>
                  <p className="text-[11px] text-slate-500">
                    {a.category || 'Uncategorized'}
                    {a.linked_by ? ` · linked by ${a.linked_by}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onUnlink(a.id)}
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Unlink"
                    title="Unlink"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------- SLA -------- */

function SlaBanner({ ticket }) {
  const sla = useMemo(() => computeSla(ticket), [ticket]);
  if (!sla) return null;

  const tone = sla.resolved
    ? 'accent'
    : sla.percent >= 100
      ? 'rose'
      : sla.percent >= 75
        ? 'amber'
        : 'brand';

  const toneRing = {
    accent: 'border-accent-200 bg-accent-50',
    brand: 'border-brand-200 bg-brand-50/60',
    amber: 'border-amber-200 bg-amber-50',
    rose: 'border-rose-200 bg-rose-50'
  }[tone];

  const barFill = {
    accent: 'bg-accent-500',
    brand: 'bg-brand-700',
    amber: 'bg-amber-500',
    rose: 'bg-rose-600'
  }[tone];

  const headline = sla.resolved
    ? `Resolved within SLA · ${SLA_DAYS[ticket.priority]}-day target`
    : sla.overdue
      ? `Overdue by ${formatDuration(-sla.remainingMs)}`
      : `${formatDuration(sla.remainingMs)} remaining`;

  return (
    <section className={`rounded-lg border ${toneRing} p-4 shadow-card`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            SLA · {ticket.priority?.toUpperCase()} · {SLA_DAYS[ticket.priority]}-day target
          </p>
          <p className="mt-0.5 text-sm font-semibold text-brand-900">{headline}</p>
        </div>
        <p className="text-xs text-slate-600">
          Due <span className="font-medium text-slate-800">{formatDateTime(sla.dueAt)}</span>
        </p>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
        <div
          className={`h-full ${barFill} transition-all`}
          style={{ width: `${Math.min(100, Math.max(2, sla.percent))}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>Opened {formatDateTime(ticket.created_at)}</span>
        <span className="tabular-nums">{Math.min(100, Math.round(sla.percent))}%</span>
      </div>
    </section>
  );
}

function computeSla(ticket) {
  const days = SLA_DAYS[ticket.priority];
  if (!days || !ticket.created_at) return null;
  const opened = new Date(ticket.created_at).getTime();
  const dueAt = opened + days * 24 * 60 * 60 * 1000;
  const totalMs = dueAt - opened;
  const resolved = RESOLVED_STATUSES.has(ticket.status);
  const referencePoint = resolved ? new Date(ticket.updated_at).getTime() : Date.now();
  const elapsed = referencePoint - opened;
  const percent = (elapsed / totalMs) * 100;
  const remainingMs = dueAt - referencePoint;
  return {
    dueAt: new Date(dueAt),
    percent,
    remainingMs,
    overdue: remainingMs < 0,
    resolved
  };
}

function formatDuration(ms) {
  const abs = Math.max(0, Math.abs(ms));
  const totalMinutes = Math.floor(abs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/* -------- Activity panel -------- */

function ActivityPanel({ activity, canPost, onAddNote, ticketId }) {
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim() && !file) return;
    setPosting(true);
    setErr('');
    try {
      await onAddNote(draft.trim(), file);
      setDraft('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setErr(e.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-brand-900">Activity & notes</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every change to this ticket is logged here.
        </p>
      </header>

      {canPost && (
        <form onSubmit={submit} className="px-5 py-4 border-b border-slate-100 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Add a note for the team…"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />

          {file && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span className="flex-1 truncate text-xs text-slate-700">{file.name}</span>
              <span className="text-[10px] text-slate-500">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove file"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {err && <p className="text-xs text-rose-700">{err}</p>}

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-accent-700 hover:text-accent-800">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05L12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83L14.7 6.3" />
              </svg>
              Attach file
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      setErr('File is larger than 10 MB.');
                      e.target.value = '';
                      return;
                    }
                    setErr('');
                    setFile(f);
                  }
                }}
                className="hidden"
              />
            </label>
            <button
              type="submit"
              disabled={(!draft.trim() && !file) || posting}
              className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? 'Posting…' : 'Post note'}
            </button>
          </div>
        </form>
      )}

      <div className="max-h-[36rem] overflow-y-auto">
        {activity.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs italic text-slate-400">
            No activity yet for T-{String(ticketId).padStart(4, '0')}.
          </p>
        ) : (
          <ol className="relative px-5 py-4 space-y-4">
            {activity.map((a) => (
              <ActivityItem key={a.id} item={a} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ActivityItem({ item }) {
  const isNote = item.type === 'note';
  const isCreation = item.type === 'change' && item.field === 'created';
  const isKbLink = item.type === 'change' && (item.field === 'kb_link' || item.field === 'kb_unlink');

  let icon;
  let iconWrap;
  if (isNote) {
    iconWrap = 'bg-accent-50 text-accent-700 ring-accent-200';
    icon = (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  } else if (isCreation) {
    iconWrap = 'bg-brand-50 text-brand-700 ring-brand-200';
    icon = (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  } else if (isKbLink) {
    iconWrap = 'bg-brand-50 text-brand-700 ring-brand-200';
    icon = (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  } else {
    iconWrap = 'bg-slate-100 text-slate-600 ring-slate-200';
    icon = (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    );
  }

  const fullDate = formatDateTime(item.created_at);

  return (
    <li className="flex gap-3">
      <div className="flex-none">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset ${iconWrap}`}>
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold text-slate-800">{item.actor || 'system'}</span>
          <span className="text-slate-400" title={fullDate}>{relativeTime(item.created_at)}</span>
        </div>

        {isNote && item.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 leading-snug">{item.body}</p>
        )}

        {item.attachment && (
          <NoteAttachment attachment={item.attachment} />
        )}

        {isCreation && (
          <p className="mt-1 text-xs text-slate-600 leading-snug">
            opened the ticket
            {item.new_value && (
              <>{' '}<ChangeValue value={item.new_value} field="title" highlight /></>
            )}
          </p>
        )}

        {isKbLink && item.field === 'kb_link' && (
          <p className="mt-1 text-xs text-slate-600 leading-snug">
            linked KB article <ChangeValue value={item.new_value} field="title" highlight />
          </p>
        )}

        {isKbLink && item.field === 'kb_unlink' && (
          <p className="mt-1 text-xs text-slate-600 leading-snug">
            unlinked KB article <ChangeValue value={item.old_value} field="title" />
          </p>
        )}

        {!isNote && !isCreation && !isKbLink && (
          <p className="mt-1 text-xs text-slate-600 leading-snug">
            changed <span className="font-semibold text-slate-800">{labelForField(item.field)}</span>
            {' '}from{' '}
            <ChangeValue value={item.old_value} field={item.field} />
            {' '}to{' '}
            <ChangeValue value={item.new_value} field={item.field} highlight />
          </p>
        )}

        <p className="mt-1 text-[10px] text-slate-400 tabular-nums">{fullDate}</p>
      </div>
    </li>
  );
}

function NoteAttachment({ attachment }) {
  const isImage = attachment.mime_type?.startsWith('image/');
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 hover:bg-slate-100 transition-colors max-w-full"
    >
      {isImage ? (
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="h-10 w-10 rounded object-cover ring-1 ring-slate-200 flex-none"
        />
      ) : (
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded bg-white ring-1 ring-slate-200 text-slate-500">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-accent-700">{attachment.filename}</span>
        <span className="block text-[10px] text-slate-500">{formatSize(attachment.size_bytes)}</span>
      </span>
    </a>
  );
}

function ChangeValue({ value, field, highlight }) {
  if (value == null || value === '') {
    return <em className="text-slate-400">empty</em>;
  }
  const display =
    field === 'status' || field === 'priority' || field === 'request_type'
      ? String(value).replace('_', ' ')
      : String(value).length > 60
        ? String(value).slice(0, 60) + '…'
        : String(value);
  return (
    <code
      className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 align-middle text-[11px] font-mono ${
        highlight ? 'bg-accent-50 text-accent-800 ring-1 ring-accent-200' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {display}
    </code>
  );
}

function labelForField(field) {
  const map = {
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    request_type: 'request type',
    category: 'category',
    requester: 'requester',
    assignee: 'assignee',
    asset_id: 'linked asset',
    created: 'creation',
    kb_link: 'KB link',
    kb_unlink: 'KB link'
  };
  return map[field] || field;
}

/* -------- Field primitives -------- */

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1 mt-4 first:mt-0">
      {children}
    </label>
  );
}

function SelectField({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-60 capitalize"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function AssigneePicker({ value, users, onChange, disabled }) {
  const matchesUser = users.some((u) => u.name === value || u.email === value);
  const selectValue = value === '' ? '__none__' : matchesUser ? value : '__custom__';

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === '__none__') return onChange('');
          if (e.target.value === '__custom__') return; // keep current text
          onChange(e.target.value);
        }}
        disabled={disabled}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-60"
      >
        <option value="__none__">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name} · {u.role}{u.department ? ` · ${u.department}` : ''}
          </option>
        ))}
        <option value="__custom__">Custom name…</option>
      </select>
      {selectValue === '__custom__' && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Type a name or username"
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-slate-50"
        />
      )}
    </div>
  );
}

/* -------- Cards & helpers -------- */

function Card({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AttachmentThumb({ attachment }) {
  if (attachment.mime_type?.startsWith('image/')) {
    return (
      <img
        src={attachment.url}
        alt={attachment.filename}
        className="h-10 w-10 rounded object-cover ring-1 ring-slate-200"
      />
    );
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

function StatusPill({ status }) {
  const map = {
    open: 'bg-amber-50 text-amber-700 ring-amber-200',
    in_progress: 'bg-brand-50 text-brand-800 ring-brand-200',
    on_hold: 'bg-slate-100 text-slate-700 ring-slate-200',
    resolved: 'bg-accent-50 text-accent-700 ring-accent-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200'
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${map[status] || map.open}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function PriorityPill({ priority }) {
  const map = {
    low: 'text-slate-600 bg-slate-100 ring-slate-200',
    normal: 'text-slate-700 bg-slate-50 ring-slate-200',
    high: 'text-amber-700 bg-amber-50 ring-amber-200',
    urgent: 'text-rose-700 bg-rose-50 ring-rose-200'
  };
  if (!priority) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize ${map[priority] || map.normal}`}>
      {priority}
    </span>
  );
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
