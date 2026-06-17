import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import Modal from '../components/Modal.jsx';
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
  const [changeNote, setChangeNote] = useState(''); // optional "what changed" on edit
  const [historyOpen, setHistoryOpen] = useState(false);

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
      if (!isNew && changeNote.trim()) payload.change_note = changeNote.trim();
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

  // Upload an image/PDF for embedding; MarkdownEditor inserts the result.
  const uploadMedia = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api('/api/kb/upload', { method: 'POST', body: fd });
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <div className="container-app py-20 text-center text-sm text-slate-500 dark:text-slate-400">Loading article…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      {/* Top action bar */}
      <div className="sticky top-16 z-30 bg-white border-b border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <div className="container-app flex items-center justify-between h-14 gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-0 dark:text-slate-400">
            <Link to="/dashboard" className="hover:text-slate-800 shrink-0 dark:hover:text-slate-200">Dashboard</Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <Link to="/kb/all" className="hover:text-slate-800 shrink-0 dark:hover:text-slate-200">Knowledge Base</Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-accent-700 truncate">{isNew ? 'New Article' : `Edit: ${title || editSlug}`}</span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Publish status toggle */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-800">
              <span className={`h-2 w-2 rounded-full ${published ? 'bg-accent-500' : 'bg-amber-400'}`} />
              <span className="font-medium">{published ? 'Published' : 'Draft'}</span>
              <button
                type="button"
                onClick={() => setPublished((p) => !p)}
                className="ml-1 text-accent-700 hover:text-accent-900 font-semibold dark:text-accent-300 dark:hover:text-accent-100"
              >
                Change
              </button>
            </div>

            {!isNew && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="btn-ghost !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
                History
              </button>
            )}

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
          <div className="mb-6 rounded-md bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">
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
                className="block w-full bg-transparent border-0 border-b-2 border-slate-200 px-0 py-3 text-2xl font-bold text-brand-900 placeholder:text-slate-300 focus:border-accent-500 focus:outline-none focus:ring-0 transition-colors dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 dark:text-slate-500">
                URL slug {isNew && <span className="font-normal normal-case">(auto-generated — click to edit)</span>}
              </label>
              <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-accent-400 focus-within:ring-1 focus-within:ring-accent-400 transition-colors dark:border-slate-700 dark:bg-slate-800">
                <span className="flex-none bg-slate-50 border-r border-slate-200 px-3 py-2 text-xs text-slate-400 font-mono select-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500">/kb/</span>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); }}
                  readOnly={!isNew}
                  placeholder="article-url-slug"
                  className="flex-1 px-3 py-2 text-sm font-mono bg-white placeholder:text-slate-300 focus:outline-none read-only:bg-slate-50/50 read-only:text-slate-500 read-only:cursor-default dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-600 dark:read-only:bg-slate-900/50 dark:read-only:text-slate-400"
                />
              </div>
              {!isNew && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Slug is locked after creation — it is used in all article links.</p>}
            </div>

            {/* Editor */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 dark:text-slate-500">
                Content <span className="text-rose-400">*</span>
              </label>
              <MarkdownEditor value={body} onChange={setBody} minRows={24} onUpload={uploadMedia} />
            </div>
          </div>

          {/* ── Right: sidebar ── */}
          <aside className="space-y-4">
            {/* Status */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">Status</h3>
              <button
                type="button"
                onClick={() => setPublished((p) => !p)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors
                  ${published
                    ? 'border-accent-200 bg-accent-50 text-accent-800 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${published ? 'bg-accent-500' : 'bg-amber-400'}`} />
                  <span className="text-sm font-semibold">{published ? 'Published' : 'Draft'}</span>
                </div>
                <span className="text-xs opacity-70">{published ? 'Click to draft' : 'Click to publish'}</span>
              </button>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                {published
                  ? 'Visible to all signed-in users.'
                  : 'Only admins and agents can see this.'}
              </p>
            </div>

            {/* Category */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">Category</h3>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">— None —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Author */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">Author</h3>
              <input
                value={author}
                readOnly
                className="block w-full rounded-md border border-slate-300 bg-slate-50/60 px-3 py-2 text-sm text-slate-500 cursor-default focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
              />
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                {isNew ? 'Set to your account.' : 'Original author — locked.'}
              </p>
            </div>

            {/* Revision note (edit only) */}
            {!isNew && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">Revision note</h3>
                <input
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  maxLength={255}
                  placeholder="What changed? (optional)"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  Saved to the version history when the content changes.
                </p>
              </div>
            )}

            {/* Stats */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">Document</h3>
              <dl className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <dt className="text-slate-400 dark:text-slate-500">Words</dt>
                  <dd className="font-mono font-semibold text-brand-900 dark:text-white">{wordCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400 dark:text-slate-500">Characters</dt>
                  <dd className="font-mono font-semibold text-brand-900 dark:text-white">{body.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400 dark:text-slate-500">Read time</dt>
                  <dd className="font-mono font-semibold text-brand-900 dark:text-white">~{Math.max(1, Math.round(wordCount / 200))} min</dd>
                </div>
                {!isNew && (
                  <div className="flex justify-between">
                    <dt className="text-slate-400 dark:text-slate-500">Mode</dt>
                    <dd className="font-semibold text-amber-700 dark:text-amber-400">Editing</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Tips */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 dark:text-slate-500">Editor tips</h3>
              <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">Ctrl+B</kbd> Bold</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">Ctrl+I</kbd> Italic</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">Ctrl+K</kbd> Insert link</li>
                <li><kbd className="bg-white border border-slate-200 rounded px-1 font-mono dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">Tab</kbd> Indent (2 spaces)</li>
                <li className="pt-1 text-slate-400 dark:text-slate-500">Use the toolbar for headings, lists, code blocks, and more.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {historyOpen && (
        <VersionHistory
          slug={editSlug}
          currentBody={body}
          onClose={() => setHistoryOpen(false)}
          onRestored={(art) => {
            setTitle(art.title || '');
            setCategory(art.category || '');
            setBody(art.body || '');
            setPublished(!!art.published);
            setHistoryOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Version history browser: lists snapshots, diffs a chosen version against the
// current draft, and restores (which writes a new version — non-destructive).
function VersionHistory({ slug, currentBody, onClose, onRestored }) {
  const [list, setList] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // { version, body, ... }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/kb/${slug}/versions`)
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch((e) => { setError(e.message); setList([]); });
  }, [slug]);

  const view = async (version) => {
    setError('');
    try {
      setSelected(await api(`/api/kb/${slug}/versions/${version}`));
    } catch (e) {
      setError(e.message);
    }
  };

  const restore = async (version) => {
    setBusy(true); setError('');
    try {
      const art = await api(`/api/kb/${slug}/versions/${version}/restore`, { method: 'POST' });
      onRestored(art);
    } catch (e) {
      setError(e.message || 'Could not restore.');
    } finally {
      setBusy(false);
    }
  };

  const diff = selected ? lineDiff(selected.body, currentBody) : [];

  return (
    <Modal open onClose={onClose} title="Version history" size="lg">
      {error && <div className="mb-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="max-h-[28rem] overflow-y-auto pr-1 border-r border-slate-100">
          {list === null ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No prior versions yet.</p>
          ) : (
            <ul className="space-y-1">
              {list.map((v, idx) => (
                <li key={v.version}>
                  <button
                    type="button"
                    onClick={() => view(v.version)}
                    className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
                      selected?.version === v.version ? 'bg-accent-50 ring-1 ring-accent-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">v{v.version}</span>
                      {idx === 0 && <span className="rounded-full bg-accent-100 text-accent-700 px-1.5 py-0.5 text-[9px] font-bold uppercase">Current</span>}
                    </div>
                    {v.change_note && <div className="text-[11px] text-slate-600 truncate">{v.change_note}</div>}
                    <div className="text-[10px] text-slate-400">
                      {v.edited_by || '—'} · {new Date(v.created_at).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {!selected ? (
            <p className="text-sm text-slate-500 py-10 text-center">Select a version to see what changed since.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">v{selected.version}</span> → current
                  <span className="ml-2 text-slate-400">(removed since · added since)</span>
                </div>
                <button
                  type="button"
                  onClick={() => restore(selected.version)}
                  disabled={busy}
                  className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
                >
                  {busy ? 'Restoring…' : `Restore v${selected.version}`}
                </button>
              </div>
              <div className="max-h-[24rem] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed">
                {diff.every((d) => d.t === 'same') ? (
                  <p className="text-slate-400 italic font-sans">Identical to the current content.</p>
                ) : (
                  diff.map((d, i) => (
                    <div
                      key={i}
                      className={
                        d.t === 'del' ? 'bg-rose-100 text-rose-800 whitespace-pre-wrap'
                        : d.t === 'add' ? 'bg-emerald-100 text-emerald-800 whitespace-pre-wrap'
                        : 'text-slate-600 whitespace-pre-wrap'
                      }
                    >
                      <span className="select-none text-slate-400">{d.t === 'del' ? '- ' : d.t === 'add' ? '+ ' : '  '}</span>
                      {d.text || ' '}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Minimal LCS line diff (no dependency). Returns [{ t:'same'|'del'|'add', text }],
// where 'del' = in oldText only, 'add' = in newText only.
function lineDiff(oldText, newText) {
  const a = (oldText || '').split('\n');
  const b = (newText || '').split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', text: a[i] }); i++; }
    else { out.push({ t: 'add', text: b[j] }); j++; }
  }
  while (i < n) out.push({ t: 'del', text: a[i++] });
  while (j < m) out.push({ t: 'add', text: b[j++] });
  return out;
}
