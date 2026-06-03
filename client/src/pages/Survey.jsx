import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';

const ASPECTS = [
  { key: 'satisfaction', label: 'Overall satisfaction', hint: 'How happy are you with the resolution?' },
  { key: 'timeliness', label: 'Timeliness', hint: 'Was it handled in good time?' },
  { key: 'professionalism', label: 'Professionalism', hint: 'How professional was your technician?' }
];

export default function Survey() {
  const { ticketId } = useParams();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [ratings, setRatings] = useState({ satisfaction: 0, timeliness: 0, professionalism: 0 });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/api/surveys/${ticketId}`)
      .then((data) => { if (active) setSurvey(data); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId]);

  const setRating = (key, value) => setRatings((r) => ({ ...r, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    for (const a of ASPECTS) {
      if (!ratings[a.key]) { setError(`Please rate "${a.label}".`); return; }
    }
    setSubmitting(true);
    try {
      const updated = await api(`/api/surveys/${ticketId}`, {
        method: 'POST',
        body: JSON.stringify({ ...ratings, comment: comment.trim() })
      });
      setSurvey(updated);
    } catch (err) {
      setError(err.message || 'Could not submit the survey.');
    } finally {
      setSubmitting(false);
    }
  };

  const completed = survey?.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/mailbox" className="hover:text-slate-800">Mailbox</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Survey</span>
        </nav>

        <div className="mx-auto mt-6 max-w-xl">
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-card">Loading…</div>
          ) : error && !survey ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-card">
              <p className="text-sm font-semibold text-slate-700">Survey unavailable</p>
              <p className="mt-1 text-xs text-slate-500">{error}</p>
              <Link to="/mailbox" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-900">← Back to Mailbox</Link>
            </div>
          ) : (
            <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
              <header className="border-b border-slate-100 px-5 py-4">
                <span className="eyebrow">Technician feedback</span>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-brand-900">
                  {completed ? 'Thanks for your feedback' : 'Rate your technician'}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Work order <span className="font-mono text-slate-700">{formatTicketId(Number(ticketId))}</span>
                  {survey?.ticket_title ? <> · {survey.ticket_title}</> : null}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Technician: <span className="font-medium text-slate-800">{survey?.technician || '—'}</span>
                </p>
              </header>

              {completed ? (
                <div className="px-5 py-5 space-y-4">
                  <p className="rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
                    Your ratings have been recorded. We appreciate you taking the time.
                  </p>
                  <dl className="space-y-3">
                    {ASPECTS.map((a) => (
                      <div key={a.key} className="flex items-center justify-between gap-4">
                        <dt className="text-sm text-slate-600">{a.label}</dt>
                        <dd><Stars value={survey[a.key]} readOnly /></dd>
                      </div>
                    ))}
                  </dl>
                  {survey.comment && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Your comment</div>
                      <p className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap break-words">{survey.comment}</p>
                    </div>
                  )}
                  <Link to="/mailbox" className="inline-flex text-xs font-semibold text-accent-700 hover:text-accent-900">← Back to Mailbox</Link>
                </div>
              ) : (
                <form onSubmit={submit} className="px-5 py-5 space-y-5">
                  {ASPECTS.map((a) => (
                    <div key={a.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{a.label}</div>
                        <div className="text-xs text-slate-500">{a.hint}</div>
                      </div>
                      <Stars value={ratings[a.key]} onChange={(v) => setRating(a.key, v)} />
                    </div>
                  ))}

                  <label className="block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Comment (optional)</span>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={4}
                      maxLength={1000}
                      placeholder="Anything you'd like to add…"
                      className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </label>

                  {error && <p className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>}

                  <div className="flex justify-end gap-2">
                    <Link to="/mailbox" className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</Link>
                    <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-50">
                      {submitting ? 'Submitting…' : 'Submit rating'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Stars({ value = 0, onChange, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        const star = (
          <svg
            className={`h-6 w-6 ${filled ? 'text-amber-400' : 'text-slate-300'}`}
            viewBox="0 0 24 24"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
          </svg>
        );
        if (readOnly) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="rounded focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
