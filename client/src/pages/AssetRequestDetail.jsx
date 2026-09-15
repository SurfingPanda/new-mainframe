import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';
import { parseApiDate } from '../lib/datetime.js';

const STATUSES = {
  pending:   { label: 'Pending', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved:  { label: 'Approved', tone: 'bg-accent-50 text-accent-700 ring-accent-200' },
  denied:    { label: 'Denied', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  fulfilled: { label: 'Fulfilled', tone: 'bg-brand-50 text-brand-800 ring-brand-200' },
};

const URGENCIES = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent'
};

function requestNumber(id) {
  return `R-${String(id).padStart(4, '0')}`;
}

function parseNotes(value) {
  if (!value?.trim()) return [];
  return value.trim()
    .split(/\n\n(?=\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] )/)
    .map((entry) => {
      const match = entry.match(/^\[([^\]]+)] ([^\n]+)\n([\s\S]*)$/);
      return match
        ? { timestamp: match[1], author: match[2], body: match[3] }
        : { timestamp: '', author: 'IT note', body: entry };
    })
    .reverse();
}

export default function AssetRequestDetail() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [status, setStatus] = useState('pending');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  useEffect(() => {
    let active = true;
    api(`/api/asset-requests/${id}`)
      .then((data) => {
        if (!active) return;
        setRequest(data);
        setStatus(data.status);
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(''), 5000);
    return () => clearTimeout(timer);
  }, [banner]);

  const notes = useMemo(() => parseNotes(request?.admin_notes), [request?.admin_notes]);

  const saveStatus = async () => {
    setSavingStatus(true);
    setError('');
    try {
      const updated = await api(`/api/asset-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setRequest(updated);
      setBanner('Request status updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const addNote = async (event) => {
    event.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    setError('');
    try {
      const updated = await api(`/api/asset-requests/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: note.trim() })
      });
      setRequest(updated);
      setNote('');
      setBanner('Follow-up note added.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingNote(false);
    }
  };

  const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app space-y-5 py-7 sm:py-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/assets/request" className="hover:text-slate-800">Asset Requests</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">{request ? requestNumber(request.id) : 'Request'}</span>
        </nav>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">Loading request...</div>
        ) : error && !request ? (
          <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
        ) : request && (
          <>
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="eyebrow">Asset Inventory · IT</span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">Asset Request {requestNumber(request.id)}</h1>
                  <StatusPill status={request.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">Submitted by <span className="font-medium text-slate-700">{request.requester_name}</span></p>
              </div>
              <Link to="/assets/request" className="group inline-flex self-start items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-brand-900 hover:shadow-sm sm:self-auto">
                <svg className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to Requests
              </Link>
            </section>

            {banner && <div className="rounded-md bg-accent-50 px-4 py-3 text-sm text-accent-800 ring-1 ring-accent-200">{banner}</div>}
            {error && <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

            <div className="grid items-start gap-5 md:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(320px,1fr)]">
                <section className="order-1 self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card md:col-start-1 md:row-span-2 md:row-start-1">
                  <div className="border-b border-slate-100 px-6 py-4">
                    <h2 className="text-sm font-semibold text-brand-900">Request details</h2>
                  </div>
                  <dl className="grid gap-x-10 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
                    <Detail label="Requester" value={request.requester_name} />
                    <Detail label="Department" value={request.department || 'Not specified'} />
                    <Detail label="Asset Type" value={request.asset_type} />
                    <Detail label="Quantity" value={request.quantity} />
                    <Detail label="Urgency" value={URGENCIES[request.urgency] || request.urgency} />
                    <Detail label="Submitted" value={request.created_at ? parseApiDate(request.created_at).toLocaleString() : '—'} />
                    <div className="border-t border-slate-100 pt-5 sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Justification</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{request.justification}</dd>
                    </div>
                  </dl>
                </section>

                <section className="order-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card md:order-2 md:col-start-2 md:row-start-1">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-sm font-semibold text-brand-900">Follow-up notes</h2>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">Add updates, questions, or actions needed.</p>
                    </div>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-500">
                      {notes.length}
                    </span>
                  </div>
                  <form onSubmit={addNote} className="border-b border-slate-100 p-5">
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Add a follow-up note..."
                      className={`${inputClass} min-h-[88px] resize-y placeholder:text-slate-400`}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] tabular-nums text-slate-400">{note.length}/2000</span>
                      <button type="submit" disabled={savingNote || !note.trim()} className="btn-primary !min-h-9 !px-4 !py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45">
                        {savingNote ? 'Adding...' : 'Add Note'}
                      </button>
                    </div>
                  </form>
                  <div className="divide-y divide-slate-100">
                    {notes.length === 0 ? (
                      <div className="px-5 py-7 text-center">
                        <span className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                          </svg>
                        </span>
                        <p className="mt-2 text-sm font-medium text-slate-600">No follow-up notes yet</p>
                        <p className="mt-0.5 text-xs text-slate-400">Updates added by IT will appear here.</p>
                      </div>
                    ) : notes.map((entry, index) => (
                      <article key={`${entry.timestamp}-${entry.author}-${index}`} className="px-5 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="text-xs font-semibold text-brand-900">{entry.author}</span>
                          {entry.timestamp && (
                            <time className="text-[10px] tabular-nums text-slate-400" title={`${entry.timestamp} UTC`}>
                              {parseApiDate(entry.timestamp).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit'
                              })}
                            </time>
                          )}
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">{entry.body}</p>
                      </article>
                    ))}
                  </div>
                </section>

              <aside className="order-2 h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-card md:order-3 md:col-start-2 md:row-start-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-brand-900">Update status</h2>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">Move this request through the IT workflow.</p>
                  </div>
                  {status !== request.status && (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Unsaved
                    </span>
                  )}
                </div>
                <label className="mt-4 block text-xs font-semibold text-slate-700">Status</label>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} mt-1.5`}>
                  {Object.entries(STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
                <button onClick={saveStatus} disabled={savingStatus || status === request.status} className="btn-primary mt-4 w-full !min-h-10 !py-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45">
                  {savingStatus ? 'Saving...' : 'Save Status'}
                </button>
                {request.reviewed_by && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
                    Last reviewed by <span className="font-semibold text-slate-700">{request.reviewed_by}</span>
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUSES[status] || STATUSES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${meta.tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {meta.label}
    </span>
  );
}
