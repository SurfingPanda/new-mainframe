import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';

const INPUT =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export default function Spaces() {
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api('/api/spaces')
      .then((data) => { setSpaces(data); setError(''); })
      .catch((e) => setError(e.message || 'Failed to load spaces'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />
      <main className="container-app py-10 space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-accent-700">Spaces</span>
        </nav>

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Spaces</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 dark:text-white">Spaces</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Create a space, add members, and track work on a board.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create space
          </button>
        </section>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
            <button onClick={load} className="ml-3 font-semibold underline">Retry</button>
          </div>
        ) : spaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-brand-900 dark:text-white">No spaces yet</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Create your first space to start planning work.</p>
            <button type="button" className="btn-primary mt-5" onClick={() => setCreateOpen(true)}>Create space</button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((s) => (
              <Link
                key={s.id}
                to={`/spaces/${s.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900 text-xs font-bold tracking-wider text-white dark:bg-brand-600">
                    {s.space_key}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-brand-900 group-hover:text-accent-700 dark:text-white">{s.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Owner · {s.owner_name}</p>
                  </div>
                </div>
                {s.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{s.description}</p>
                )}
                <div className="mt-4 flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>{s.member_count} member{s.member_count === 1 ? '' : 's'}</span>
                  <span>{s.item_count} item{s.item_count === 1 ? '' : 's'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {createOpen && (
        <CreateSpaceModal
          onClose={() => setCreateOpen(false)}
          onCreated={(space) => { setCreateOpen(false); navigate(`/spaces/${space.id}`); }}
        />
      )}
    </div>
  );
}

function CreateSpaceModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const space = await api('/api/spaces', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() }) });
      onCreated(space);
    } catch (err) {
      setError(err.message || 'Failed to create space');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create space" size="md">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Revamp" maxLength={120} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Description <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea className={`${INPUT} min-h-[90px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this space for?" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs" disabled={saving}>{saving ? 'Creating…' : 'Create space'}</button>
        </div>
      </form>
    </Modal>
  );
}
