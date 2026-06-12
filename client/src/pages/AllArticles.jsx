import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api, getUser } from '../lib/auth.js';

export default function AllArticles() {
  const me = getUser();
  const navigate = useNavigate();
  const canEdit = me?.role === 'admin' || me?.role === 'agent';

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [pubFilter, setPubFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [arts, cats] = await Promise.all([
        api('/api/kb'),
        api('/api/kb/meta/categories')
      ]);
      setArticles(arts);
      setCategories(cats);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (catFilter !== 'all' && a.category !== catFilter) return false;
      if (pubFilter === 'published' && !a.published) return false;
      if (pubFilter === 'draft' && a.published) return false;
      if (!q) return true;
      return (
        a.title?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q) ||
        a.author?.toLowerCase().includes(q)
      );
    });
  }, [articles, query, catFilter, pubFilter]);

  const counts = useMemo(() => ({
    total: articles.length,
    published: articles.filter((a) => a.published).length,
    drafts: articles.filter((a) => !a.published).length,
    cats: new Set(articles.map((a) => a.category).filter(Boolean)).size
  }), [articles]);

  const handleTogglePublish = async (article) => {
    try {
      const updated = await api(`/api/kb/${article.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !article.published })
      });
      setArticles((prev) => prev.map((a) => (a.slug === article.slug ? updated : a)));
      setBanner({ text: `"${updated.title}" ${updated.published ? 'published' : 'moved to draft'}.` });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/kb/${deleteTarget.slug}`, { method: 'DELETE' });
      setArticles((prev) => prev.filter((a) => a.slug !== deleteTarget.slug));
      setBanner({ text: `"${deleteTarget.title}" deleted.` });
      setDeleteTarget(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <main className="container-app py-10 space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-slate-700 dark:text-slate-300">Knowledge Base</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700">All Articles</span>
        </nav>

        {/* Header */}
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Knowledge Base</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 dark:text-white">All Articles</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">Internal documentation, written once.</p>
          </div>
          {canEdit && (
            <Link to="/kb/new" className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto inline-flex items-center">
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Article
            </Link>
          )}
        </section>

        {/* Banner */}
        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800 dark:bg-accent-500/10 dark:ring-accent-500/30 dark:text-accent-200">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs dark:text-accent-300 dark:hover:text-accent-100">Dismiss</button>
          </div>
        )}
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</div>}

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total articles" value={counts.total} tone="brand" icon="total" />
          <StatCard label="Published"      value={counts.published} tone="accent" icon="published" />
          <StatCard label="Drafts"         value={counts.drafts} tone="amber" icon="drafts" />
          <StatCard label="Categories"     value={counts.cats} tone="sky" icon="cats" />
        </section>

        {/* Table */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center dark:border-slate-800">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category, or author…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {canEdit && (
                <select value={pubFilter} onChange={(e) => setPubFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <option value="all">Published &amp; drafts</option>
                  <option value="published">Published only</option>
                  <option value="draft">Drafts only</option>
                </select>
              )}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400">Loading articles…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3 dark:bg-slate-800 dark:text-slate-500">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M4 16a4 4 0 0 1 4-4h12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No articles found</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {articles.length === 0 ? 'Publish your first guide to help the team self-serve.' : 'Try adjusting your filters.'}
              </p>
              {canEdit && articles.length === 0 && (
                <Link to="/kb/new" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200">
                  Write the first article →
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((a) => (
                <li key={a.slug} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60 group dark:hover:bg-slate-800/40">
                  <span className={`mt-0.5 flex-none inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${articleGradient(a.category)} text-white shadow-sm`}>
                    <CategoryIcon category={a.category} />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/kb/${a.slug}`} className="text-sm font-semibold text-brand-900 hover:text-accent-700 truncate dark:text-white dark:hover:text-accent-300">
                        {a.title}
                      </Link>
                      {isNewArticle(a) && (
                        <span className="inline-flex items-center rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          New
                        </span>
                      )}
                      {!a.published && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-[10px] font-semibold dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {a.category && <CategoryPill category={a.category} />}
                      {a.author && <span>by {a.author}</span>}
                      <span>Updated {relativeTime(a.updated_at)}</span>
                      <LinkCount count={a.link_count} />
                    </div>
                  </div>

                  {canEdit ? (
                    <div className="flex-none flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconBtn label="Edit" onClick={() => navigate(`/kb/edit/${a.slug}`)}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                      </IconBtn>
                      <IconBtn label={a.published ? 'Unpublish' : 'Publish'} tone={a.published ? 'amber' : 'accent'} onClick={() => handleTogglePublish(a)}>
                        {a.published ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M1 1l22 22" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </IconBtn>
                      <IconBtn label="Delete" tone="rose" onClick={() => setDeleteTarget(a)}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                        </svg>
                      </IconBtn>
                    </div>
                  ) : (
                    <Link to={`/kb/${a.slug}`} className="flex-none text-xs font-semibold text-accent-700 hover:text-accent-800 self-center dark:text-accent-300 dark:hover:text-accent-200">
                      Read →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete article" size="sm">
          <p className="text-sm text-slate-700">
            Permanently delete <span className="font-semibold">"{deleteTarget.title}"</span>? This cannot be undone.
          </p>
          <footer className="flex justify-end gap-2 pt-4">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-60 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

/* ─── Small components ─── */

// Deterministic gradient per category so each article badge gets a stable,
// colorful tile instead of flat navy (matches the Spaces badge treatment).
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

// A recognizable icon per knowledge-base category (matched loosely so both the
// KB and ticket category names resolve). Falls back to a book for anything else.
function CategoryIcon({ category }) {
  const k = String(category || '').toLowerCase();
  let body;
  if (k.includes('account') || k.includes('access')) {
    body = <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>;
  } else if (k.includes('network') || k.includes('connectivity')) {
    body = <><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><path d="M12 20h.01" /></>;
  } else if (k.includes('software')) {
    body = <><path d="M16 18l6-6-6-6" /><path d="M8 6l-6 6 6 6" /></>;
  } else if (k.includes('hardware')) {
    body = <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></>;
  } else if (k.includes('security')) {
    body = <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
  } else if (k.includes('email') || k.includes('mail') || k.includes('communication')) {
    body = <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" /></>;
  } else if (k.includes('print') || k.includes('peripheral')) {
    body = <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>;
  } else if (k.includes('trouble')) {
    body = <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.4-.6-.6-2.4 2.1-2.1z" />;
  } else if (k.includes('faq') || k.includes('question')) {
    body = <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>;
  } else if (k.includes('polic')) {
    body = <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h5" /></>;
  } else {
    body = <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>;
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {body}
    </svg>
  );
}

// A published article counts as "new" for a week after it was created.
const NEW_ARTICLE_DAYS = 7;
function isNewArticle(a) {
  if (!a?.published) return false;
  const t = a.created_at ? new Date(a.created_at).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= NEW_ARTICLE_DAYS * 86400000;
}

// Tinted icon chip + subtle card gradient, matching the Spaces stat cards.
const STAT_TONES = {
  brand:  { chip: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30',    glow: 'from-brand-50/70' },
  accent: { chip: 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30', glow: 'from-accent-50/70' },
  amber:  { chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',    glow: 'from-amber-50/70' },
  sky:    { chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',          glow: 'from-sky-50/70' }
};

const STAT_ICONS = {
  total:     'M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z M4 16a4 4 0 0 1 4-4h12',
  published: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  drafts:    'M12 20h9 M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z',
  cats:      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'
};

function StatCard({ label, value, tone, icon }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br ${t.glow} to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`}>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${t.chip}`}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {STAT_ICONS[icon].trim().split(' M').map((d, i) => <path key={i} d={(i === 0 ? d : 'M' + d)} />)}
        </svg>
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-brand-900 tabular-nums dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function LinkCount({ count }) {
  const n = Number(count) || 0;
  return (
    <span
      className={`inline-flex items-center gap-1 ${n > 0 ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}
      title={`Linked to ${n} work order${n === 1 ? '' : 's'}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {n === 0 ? 'Not linked' : `${n} work order${n === 1 ? '' : 's'}`}
    </span>
  );
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${colors[idx]}`}>
      {category}
    </span>
  );
}

function IconBtn({ children, label, onClick, tone = 'slate' }) {
  const tones = {
    slate:  'text-slate-500 hover:text-brand-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800',
    rose:   'text-slate-500 hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/15',
    accent: 'text-slate-500 hover:text-accent-700 hover:bg-accent-50 dark:text-slate-400 dark:hover:text-accent-300 dark:hover:bg-accent-500/15',
    amber:  'text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-300 dark:hover:bg-amber-500/15'
  };
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
