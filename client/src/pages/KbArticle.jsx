import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

export default function KbArticle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const canEdit = me?.role === 'admin' || me?.role === 'agent';

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api(`/api/kb/${slug}`)
      .then((data) => { setArticle(data); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-8">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/kb/all" className="hover:text-slate-800">Knowledge Base</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700 truncate max-w-xs">{article?.title || slug}</span>
        </nav>

        {loading && (
          <div className="py-24 text-center text-sm text-slate-500">Loading article…</div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <Link to="/kb/all" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
              ← Back to all articles
            </Link>
          </div>
        )}

        {article && !loading && (
          <div className="max-w-3xl mx-auto">
            {/* Article card */}
            <article className="rounded-xl border border-slate-200 bg-white shadow-card overflow-hidden">
              {/* Header */}
              <div className="px-8 pt-8 pb-6 border-b border-slate-100">
                <div className="flex flex-wrap items-start gap-3 mb-4">
                  {article.category && <CategoryPill category={article.category} />}
                  {!article.published && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                      Draft
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-brand-900">{article.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {article.author && <span>By <span className="font-medium text-slate-700">{article.author}</span></span>}
                  <span>Updated {new Date(article.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

              {/* Body */}
              <div className="px-8 py-7">
                <MarkdownBody body={article.body} />
              </div>
            </article>

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
                <Link to="/kb/all" className="text-xs font-semibold text-accent-700 hover:text-accent-800">
                  ← Back to all articles
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
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
      elements.push(<h3 key={i} className="mt-6 mb-2 text-base font-semibold text-brand-900">{inlineFormat(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="mt-7 mb-2 text-lg font-bold text-brand-900">{inlineFormat(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="mt-8 mb-3 text-xl font-bold text-brand-900">{inlineFormat(line.slice(2))}</h1>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-5 border-slate-200" />);
      i++; continue;
    }

    // Unordered list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} className="ml-4 list-disc text-slate-700">{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-3 space-y-1 text-sm">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} className="ml-4 list-decimal text-slate-700">{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>);
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
        <pre key={i} className="my-4 rounded-lg bg-slate-900 text-slate-100 px-4 py-3 text-xs overflow-x-auto font-mono leading-relaxed">
          {codeLines.join('\n')}
        </pre>
      );
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="my-3 border-l-4 border-accent-300 pl-4 text-sm italic text-slate-600">
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
      <p key={i} className="my-3 text-sm leading-relaxed text-slate-700">{inlineFormat(line)}</p>
    );
    i++;
  }

  return <div className="prose-like">{elements}</div>;
}

function inlineFormat(text) {
  // Bold **text**, italic *text*, inline code `code`
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-rose-600">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
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
