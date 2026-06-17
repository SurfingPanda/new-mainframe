import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';
import { safeUrl } from '../lib/url.js';

export default function KbArticle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const canEdit = me?.role === 'admin' || me?.role === 'agent';

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkedTickets, setLinkedTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/api/kb/${slug}`)
      .then((data) => { setArticle(data); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Which tickets link to this article (shown to all signed-in users).
  useEffect(() => {
    setTicketsLoading(true);
    api(`/api/kb/${slug}/tickets`)
      .then((list) => setLinkedTickets(Array.isArray(list) ? list : []))
      .catch(() => setLinkedTickets([]))
      .finally(() => setTicketsLoading(false));
  }, [slug]);

  const handleTogglePublish = async () => {
    try {
      const updated = await api(`/api/kb/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !article.published })
      });
      setArticle(updated);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-8 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <Link to="/kb/all" className="hover:text-slate-800 dark:hover:text-slate-200">Knowledge Base</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700 truncate max-w-xs">{article?.title || slug}</span>
        </nav>

        {loading && (
          <div className="py-24 text-center text-sm text-slate-500 dark:text-slate-400">Loading article…</div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-white p-12 text-center dark:border-rose-500/30 dark:bg-slate-900">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
            <Link to="/kb/all" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200">
              ← Back to all articles
            </Link>
          </div>
        )}

        {article && !loading && (
          <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-3 items-start">
            <div className="lg:col-span-2">
            {/* Article card */}
            <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
              {/* Header */}
              <div className="relative px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${articleGradient(article.category || article.title)}`} />
                <div className="flex flex-wrap items-start gap-3 mb-4">
                  {article.category && <CategoryPill category={article.category} />}
                  {!article.published && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-[10px] font-semibold dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                      Draft
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{article.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {article.author && <span>By <span className="font-medium text-slate-700 dark:text-slate-200">{article.author}</span></span>}
                  <span>Updated {new Date(article.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

              {/* Body */}
              <div className="px-8 py-7">
                <MarkdownBody body={article.body} />
              </div>
            </article>

            {/* Reader feedback */}
            <ArticleFeedback key={article.id} slug={slug} article={article} />

            {/* Admin actions */}
            {canEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  to="/kb/all"
                  className="btn-ghost !px-3.5 !py-2 text-xs"
                >
                  ← All articles
                </Link>
                <button
                  onClick={handleTogglePublish}
                  className="btn-secondary !px-3.5 !py-2 text-xs"
                >
                  {article.published ? 'Move to draft' : 'Publish'}
                </button>
              </div>
            )}

            {!canEdit && (
              <div className="mt-4">
                <Link to="/kb/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200">
                  ← Back to all articles
                </Link>
              </div>
            )}
            </div>

            <aside className="lg:col-span-1">
              <LinkedTickets tickets={linkedTickets} loading={ticketsLoading} />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

// "Was this helpful?" widget. One revisable vote per user; a 👎 reveals an
// optional comment box so editors learn what was missing.
function ArticleFeedback({ slug, article }) {
  const [vote, setVote] = useState(article.my_vote); // 1 | 0 | null
  const [counts, setCounts] = useState({
    helpful: article.helpful_count || 0,
    notHelpful: article.not_helpful_count || 0
  });
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [commentSaved, setCommentSaved] = useState(false);

  const send = async (helpful, withComment = false) => {
    setBusy(true); setErr('');
    try {
      const body = { helpful };
      if (withComment) body.comment = comment.trim();
      const res = await api(`/api/kb/${slug}/feedback`, { method: 'POST', body: JSON.stringify(body) });
      setCounts({ helpful: res.helpful_count, notHelpful: res.not_helpful_count });
      setVote(res.my_vote);
      if (withComment) { setCommentSaved(true); setShowComment(false); }
      else setShowComment(helpful === false); // offer the comment box on a 👎
    } catch (e) {
      setErr(e.message || 'Could not save your feedback.');
    } finally {
      setBusy(false);
    }
  };

  const voted = vote === 0 || vote === 1;

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-semibold text-brand-900 dark:text-white">
          {voted ? 'Thanks for your feedback!' : 'Was this article helpful?'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => send(true)}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-50 ${
              vote === 1
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L14 4a2.5 2.5 0 0 1 1 1.88z" /></svg>
            Yes
            {counts.helpful > 0 && <span className="tabular-nums opacity-70">{counts.helpful}</span>}
          </button>
          <button
            type="button"
            onClick={() => send(false)}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-50 ${
              vote === 0
                ? 'bg-rose-50 text-rose-700 ring-rose-300 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L10 20a2.5 2.5 0 0 1-1-1.88z" /></svg>
            No
            {counts.notHelpful > 0 && <span className="tabular-nums opacity-70">{counts.notHelpful}</span>}
          </button>
        </div>
      </div>

      {err && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{err}</p>}

      {showComment && !commentSaved && (
        <div className="mt-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="What was missing or unclear? (optional)"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowComment(false)} className="btn-ghost !px-3 !py-1.5 text-xs">Skip</button>
            <button type="button" onClick={() => send(false, true)} disabled={busy || !comment.trim()} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </div>
      )}

      {commentSaved && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your note was sent to the team — thank you.</p>
      )}
    </section>
  );
}

// Minimal markdown-to-JSX renderer (no external deps)
function MarkdownBody({ body }) {
  if (!body) return null;

  const lines = body.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1–H3
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="mt-6 mb-2 text-base font-semibold text-brand-900 dark:text-white">{inlineFormat(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="mt-7 mb-2 text-lg font-bold text-brand-900 dark:text-white">{inlineFormat(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="mt-8 mb-3 text-xl font-bold text-brand-900 dark:text-white">{inlineFormat(line.slice(2))}</h1>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-5 border-slate-200 dark:border-slate-700" />);
      i++; continue;
    }

    // Unordered list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} className="ml-4 list-disc text-slate-700 dark:text-slate-300">{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-3 space-y-1 text-sm">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} className="ml-4 list-decimal text-slate-700 dark:text-slate-300">{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="my-3 space-y-1 text-sm">{items}</ol>);
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="my-4 rounded-lg bg-slate-900 text-slate-100 px-4 py-3 text-xs overflow-x-auto font-mono leading-relaxed ring-1 ring-inset ring-black/5 dark:ring-white/10">
          {codeLines.join('\n')}
        </pre>
      );
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="my-3 border-l-4 border-accent-300 pl-4 text-sm italic text-slate-600 dark:border-accent-500/50 dark:text-slate-300">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="my-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{inlineFormat(line)}</p>
    );
    i++;
  }

  return <div className="prose-like">{elements}</div>;
}

function inlineFormat(text) {
  // Bold, italic, strikethrough, inline code, images ![alt](url), links [text](url)
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|!\[(.*?)\]\((.+?)\)|\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900 dark:text-white">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<del key={key++} className="line-through text-slate-400 dark:text-slate-500">{m[4]}</del>);
    else if (m[5]) parts.push(<code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-rose-600 dark:bg-slate-800 dark:text-rose-400">{m[5]}</code>);
    else if (m[7] !== undefined) parts.push(
      <a key={key++} href={safeUrl(m[7])} target="_blank" rel="noreferrer" className="inline-block my-3" title="Click to view full size">
        <img src={safeUrl(m[7])} alt={m[6] || ''} className="max-h-72 w-auto max-w-xs rounded-lg border border-slate-200 dark:border-slate-700" />
      </a>
    );
    else if (m[9] !== undefined) parts.push(<a key={key++} href={safeUrl(m[9])} className="text-accent-700 underline underline-offset-2 hover:text-accent-900 dark:text-accent-300 dark:hover:text-accent-200" target="_blank" rel="noreferrer">{m[8]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

const TICKET_STATUS_META = {
  open: { label: 'Open', dot: 'bg-sky-500' },
  in_progress: { label: 'In Progress', dot: 'bg-amber-500' },
  on_hold: { label: 'On Hold', dot: 'bg-slate-400' },
  pending: { label: 'Pending', dot: 'bg-violet-500' },
  resolved: { label: 'Resolved', dot: 'bg-emerald-500' },
  closed: { label: 'Closed', dot: 'bg-slate-500' }
};

const TICKET_PRIORITY_TONE = {
  low: 'text-slate-500',
  normal: 'text-brand-700',
  high: 'text-amber-600',
  urgent: 'text-rose-600'
};

function LinkedTickets({ tickets, loading }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden lg:sticky lg:top-6 dark:border-slate-800 dark:bg-slate-900">
      <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-brand-900 dark:text-white">Linked work orders</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {loading
            ? 'Loading…'
            : `${tickets.length} work order${tickets.length === 1 ? '' : 's'} reference this article`}
        </p>
      </header>
      {loading ? (
        <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          No work orders are linked to this article yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-[30rem] overflow-y-auto dark:divide-slate-800">
          {tickets.map((t) => {
            const status = TICKET_STATUS_META[t.status] || { label: t.status, dot: 'bg-slate-400' };
            return (
              <li key={t.id}>
                <Link to={`/tickets/${t.id}`} className="block px-4 py-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                      {formatTicketId(t.id)}
                    </span>
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{status.label}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-brand-900 dark:text-white">{t.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={`font-semibold uppercase tracking-wide ${TICKET_PRIORITY_TONE[t.priority] || 'text-slate-500'}`}>
                      {t.priority}
                    </span>
                    <span>·</span>
                    <span>linked {new Date(t.linked_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Deterministic gradient per article (keyed off category/title) for the header
// accent bar — matches the Spaces / All Articles badge treatment.
const ARTICLE_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-brand-700 to-brand-900'
];
function articleGradient(key = '') {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ARTICLE_GRADIENTS[h % ARTICLE_GRADIENTS.length];
}

function CategoryPill({ category }) {
  const colors = [
    'bg-brand-50 text-brand-800 ring-brand-200',
    'bg-accent-50 text-accent-700 ring-accent-200',
    'bg-amber-50 text-amber-700 ring-amber-200',
    'bg-violet-50 text-violet-700 ring-violet-200',
    'bg-sky-50 text-sky-700 ring-sky-200',
    'bg-rose-50 text-rose-700 ring-rose-200',
    'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'bg-orange-50 text-orange-700 ring-orange-200',
  ];
  const idx = Math.abs(category.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${colors[idx]}`}>
      {category}
    </span>
  );
}
