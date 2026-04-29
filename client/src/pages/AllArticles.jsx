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
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Knowledge Base</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">All Articles</span>
        </nav>

        {/* Header */}
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Knowledge Base</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">All Articles</h1>
            <p className="mt-1 text-slate-600">Internal documentation, written once.</p>
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
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total articles" value={counts.total} tone="brand" />
          <StatCard label="Published"      value={counts.published} tone="accent" />
          <StatCard label="Drafts"         value={counts.drafts} tone="amber" />
          <StatCard label="Categories"     value={counts.cats} tone="slate" />
        </section>

        {/* Table */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category, or author…"
                className="block w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {canEdit && (
                <select value={pubFilter} onChange={(e) => setPubFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                  <option value="all">Published &amp; drafts</option>
                  <option value="published">Published only</option>
                  <option value="draft">Drafts only</option>
                </select>
              )}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Loading articles…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M4 16a4 4 0 0 1 4-4h12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">No articles found</p>
              <p className="mt-1 text-xs text-slate-500">
                {articles.length === 0 ? 'Publish your first guide to help the team self-serve.' : 'Try adjusting your filters.'}
              </p>
              {canEdit && articles.length === 0 && (
                <Link to="/kb/new" className="mt-4 inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800">
                  Write the first article →
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((a) => (
                <li key={a.slug} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/60 group">
                  <span className="mt-0.5 flex-none inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-white">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M4 16a4 4 0 0 1 4-4h12" />
                    </svg>
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/kb/${a.slug}`} className="text-sm font-semibold text-brand-900 hover:text-accent-700 truncate">
                        {a.title}
                      </Link>
                      {!a.published && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {a.category && <CategoryPill category={a.category} />}
                      {a.author && <span>by {a.author}</span>}
                      <span>Updated {relativeTime(a.updated_at)}</span>
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
                    <Link to={`/kb/${a.slug}`} className="flex-none text-xs font-semibold text-accent-700 hover:text-accent-800 self-center">
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

function StatCard({ label, value, tone }) {
  const tones = {
    brand: 'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber:  'text-amber-700 ring-amber-200 bg-amber-50',
    slate:  'text-slate-700 ring-slate-200 bg-slate-100'
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ring-1 ring-inset ${tones[tone]}`}>{value}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </div>
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
    slate:  'text-slate-500 hover:text-brand-900 hover:bg-slate-100',
    rose:   'text-slate-500 hover:text-rose-700 hover:bg-rose-50',
    accent: 'text-slate-500 hover:text-accent-700 hover:bg-accent-50',
    amber:  'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
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
