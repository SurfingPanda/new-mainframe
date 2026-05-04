import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import { api, getUser } from '../lib/auth.js';

const CATEGORIES = [
  'Accounts', 'Networking', 'Hardware', 'Software',
  'Security', 'Email & Communication', 'Printing & Peripherals',
  'Troubleshooting', 'FAQ', 'Policies', 'General'
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
}

export default function ArticleEditor() {
  const { slug: editSlug } = useParams(); // present when editing
  const isNew = !editSlug;
  const navigate = useNavigate();
  const me = getUser();
  const [searchParams] = useSearchParams();

  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Form state
  const [title, setTitle]       = useState('');
  const [slug, setSlug]         = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const initialCategory = isNew && CATEGORIES.includes(searchParams.get('category'))
    ? searchParams.get('category')
    : '';
  const [category, setCategory] = useState(initialCategory);
  const [author, setAuthor]     = useState(me?.name || '');
  const [body, setBody]         = useState('');
  const [published, setPublished] = useState(true);

  // Load existing article when editing
  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api(`/api/kb/${editSlug}`)
      .then((data) => {
        setTitle(data.title || '');
        setSlug(data.slug || '');
        setCategory(data.category || '');
        setAuthor(data.author || '');
        setBody(data.body || '');
        setPublished(!!data.published);
        setSlugEdited(true); // lock slug editing on edit
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editSlug, isNew]);

  const handleTitleChange = (val) => {
    setTitle(val);
    if (!slugEdited) setSlug(slugify(val));
  };

  const handleSave = async (publishOverride) => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim())  { setError('Body content is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category: category || null,
        body: body.trim(),
        author: author.trim() || null,
        published: publishOverride ?? published
      };
      if (isNew) {
        const created = await api('/api/kb', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/kb/${created.slug}`, { state: { banner: `"${created.title}" published.` } });
      } else {
        const updated = await api(`/api/kb/${editSlug}`, { method: 'PATCH', body: JSON.stringify(payload) });
        navigate(`/kb/${updated.slug}`, { state: { banner: `"${updated.title}" updated.` } });
      }
    } catch (e) {
      setError(e.message || 'Could not save article.');
    } finally {
      setSaving(false);
    }
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />
        <div className="container-app py-20 text-center text-sm text-slate-500">Loading article…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      {/* Top action bar */}
      <div className="sticky top-16 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="container-app flex items-center justify-between h-14 gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-0">
            <Link to="/dashboard" className="hover:text-slate-800 shrink-0">Dashboard</Link>
            <span className="text-slate-300">/</span>
            <Link to="/kb/all" className="hover:text-slate-800 shrink-0">Knowledge Base</Link>
            <span className="text-slate-300">/</span>
            <span className="text-accent-700 truncate">{isNew ? 'New Article' : `Edit: ${title || editSlug}`}</span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Publish status toggle */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50">
              <span className={`h-2 w-2 rounded-full ${published ? 'bg-accent-500' : 'bg-amber-400'}`} />
              <span className="font-medium">{published ? 'Published' : 'Draft'}</span>
              <button
                type="button"
                onClick={() => setPublished((p) => !p)}
                className="ml-1 text-accent-700 hover:text-accent-900 font-semibold"
              >
                Change
              </button>
            </div>

            <Link to="/kb/all" className="btn-ghost !px-3 !py-1.5 text-xs">
              Discard
            </Link>

            {isNew && (
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-60"
              >
                Save as draft
              </button>
            )}

            <button
              onClick={() => handleSave(published)}
              disabled={saving}
              className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-60"
            >
              {saving ? 'Saving…' : isNew ? (published ? 'Publish article' : 'Save draft') : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <main className="container-app py-8">
        {error && (
          <div className="mb-6 rounded-md bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
          {/* ── Left: main editor ── */}
          <div className="space-y-5 min-w-0">
            {/* Title */}
            <div>
              <input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Article title…"
                autoFocus={isNew}
                className="block w-full bg-transparent border-0 border-b-2 border-slate-200 px-0 py-3 text-2xl font-bold text-brand-900 placeholder:text-slate-300 focus:border-accent-500 focus:outline-none focus:ring-0 transition-colors"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                URL slug {isNew && <span className="font-normal normal-case">(auto-generated — click to edit)</span>}
              </label>
              <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-accent-400 focus-within:ring-1 focus-within:ring-accent-400 transition-colors">
                <span className="flex-none bg-slate-50 border-r border-slate-200 px-3 py-2 text-xs text-slate-400 font-mono select-none">/kb/</span>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); }}
                  readOnly={!isNew}
                  placeholder="article-url-slug"
                  className="flex-1 px-3 py-2 text-sm font-mono bg-white placeholder:text-slate-300 focus:outline-none read-only:bg-slate-50/50 read-only:text-slate-500 read-only:cursor-default"
                />
              </div>
              {!isNew && <p className="mt-1 text-[11px] text-slate-400">Slug is locked after creation — it is used in all article links.</p>}
            </div>

            {/* Editor */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Content <span className="text-rose-400">*</span>
              </label>
              <MarkdownEditor value={body} onChange={setBody} minRows={24} />
            </div>
          </div>

          {/* ── Right: sidebar ── */}
          <aside className="space-y-4">
            {/* Status */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Status</h3>
              <button
                type="button"
                onClick={() => setPublished((p) => !p)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors
                  ${published
                    ? 'border-accent-200 bg-accent-50 text-accent-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${published ? 'bg-accent-500' : 'bg-amber-400'}`} />
                  <span className="text-sm font-semibold">{published ? 'Published' : 'Draft'}</span>
                </div>
                <span className="text-xs opacity-70">{published ? 'Click to draft' : 'Click to publish'}</span>
              </button>
              <p className="mt-2 text-[11px] text-slate-400">
                {published
                  ? 'Visible to all signed-in users.'
                  : 'Only admins and agents can see this.'}
              </p>
            </div>

            {/* Category */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Category</h3>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                <option value="">— None —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Author */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Author</h3>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. IT Team"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            {/* Stats */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Document</h3>
              <dl className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Words</dt>
                  <dd className="font-mono font-semibold text-brand-900">{wordCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Characters</dt>
                  <dd className="font-mono font-semibold text-brand-900">{body.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Read time</dt>
                  <dd className="font-mono font-semibold text-brand-900">~{Math.max(1, Math.round(wordCount / 200))} min</dd>
                </div>
                {!isNew && (
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Mode</dt>
                    <dd className="font-semibold text-amber-700">Editing</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Tips */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Editor tips</h3>
              <ul className="space-y-1.5 text-[11px] text-slate-500">
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Ctrl+B</kbd> Bold</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Ctrl+I</kbd> Italic</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Ctrl+K</kbd> Insert link</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Tab</kbd> Indent (2 spaces)</li>
                <li className="pt-1 text-slate-400">Use the toolbar for headings, lists, code blocks, and more.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
