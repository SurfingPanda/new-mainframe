import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/auth.js';
import { isPasswordValid } from '../lib/passwordPolicy.js';
import PasswordChecklist from './PasswordChecklist.jsx';

// Shared account cards used by both the Profile page (identity + access) and the
// Settings page (security). Extracted from the original Settings page so the two
// views can reuse the same building blocks without duplication.

const PERMISSION_MODULES = [
  { key: 'tickets', label: 'Work Orders', actions: ['view', 'create'] },
  { key: 'assets',  label: 'Assets',  actions: ['view', 'manage'] },
  { key: 'kb',      label: 'Knowledge base', actions: ['view', 'manage'] },
  { key: 'users',   label: 'User management', actions: ['manage'] }
];

const ACTION_LABELS = {
  view: 'View',
  create: 'Create / edit',
  manage: 'Manage'
};

/* -------- Profile (name, job title + photo editable) -------- */

export function ProfileCard({ me, onUpdated }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);

  const patchMe = async (patch) => {
    const updated = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
    onUpdated(updated);
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoError(''); setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const { avatar_url } = await api('/api/auth/me/avatar', { method: 'POST', body: fd });
      onUpdated({ ...me, avatar_url });
    } catch (e) {
      setPhotoError(e.message || 'Could not upload the picture.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    setPhotoError(''); setPhotoBusy(true);
    try {
      await api('/api/auth/me/avatar', { method: 'DELETE' });
      onUpdated({ ...me, avatar_url: null });
    } catch (e) {
      setPhotoError(e.message || 'Could not remove the picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Profile</h2>
        <p className="text-xs text-slate-500 mt-0.5">Update your name, job title, and photo. Email, role, and department are managed by an admin.</p>
      </header>

      <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100">
        <Avatar name={me?.name} src={me?.avatar_url} size="h-16 w-16" textClass="text-lg" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className={`btn-secondary !px-3 !py-1.5 text-xs ${photoBusy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
              {photoBusy ? 'Working…' : me?.avatar_url ? 'Change photo' : 'Upload photo'}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/heic"
                className="hidden"
                onChange={(e) => uploadPhoto(e.target.files?.[0])}
              />
            </label>
            {me?.avatar_url && (
              <button type="button" onClick={removePhoto} disabled={photoBusy} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">PNG, JPEG, GIF, WebP, or HEIC · up to 5 MB.</p>
          {photoError && <p className="text-[11px] text-rose-600">{photoError}</p>}
        </div>
      </div>

      <dl className="divide-y divide-slate-100">
        <EditableRow
          label="Full name"
          value={me?.name}
          onSave={(v) => patchMe({ name: v })}
        />
        <EditableRow
          label="Job title"
          value={me?.job_title}
          placeholder="e.g. IT Support Specialist"
          allowEmpty
          onSave={(v) => patchMe({ job_title: v })}
        />
        <Row label="Email" value={me?.email || '—'} mono />
        <Row label="Role" value={<span className="capitalize">{me?.role || 'user'}</span>} />
        <Row label="Department" value={me?.department || '—'} />
      </dl>
    </section>
  );
}

// Inline-editable text row: shows the value with an Edit affordance and swaps
// to an input + Save/Cancel while editing. `onSave(trimmedValue)` should throw
// on failure; an empty value is rejected unless `allowEmpty` (clears the field).
function EditableRow({ label, value, placeholder, allowEmpty = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);

  const start = () => { setDraft(value || ''); setError(''); setEditing(true); };
  const cancel = () => { setEditing(false); setError(''); };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed && !allowEmpty) { setError(`${label} cannot be empty.`); return; }
    setSaving(true); setError('');
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      setError(e.message || `Could not update ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-4 px-5 py-3">
      <dt className="w-40 flex-none text-xs font-semibold uppercase tracking-wider text-slate-500 pt-1.5">{label}</dt>
      <dd className="flex-1 text-sm text-slate-800">
        {editing ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                className="block w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <button type="button" onClick={save} disabled={saving} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={cancel} disabled={saving} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
                Cancel
              </button>
            </div>
            {error && <p className="text-[11px] text-rose-600">{error}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1.5">
            <span className={value ? '' : 'text-slate-400'}>{value || '—'}</span>
            <button type="button" onClick={start} className="text-xs font-semibold text-accent-700 hover:text-accent-900">
              Edit
            </button>
          </div>
        )}
      </dd>
    </div>
  );
}

/* -------- E-signature (draw or upload) -------- */

const SIG_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/avif';

export function SignatureCard({ me, onUpdated }) {
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Strokes are kept as point lists so we can undo the last one by redrawing.
  const strokes = useRef([]);
  const current = useRef(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const hasDrawing = strokeCount > 0;
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drawing = useRef(false);

  const ctx = () => canvasRef.current?.getContext('2d');

  const pointFromEvent = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const strokeStyle = (g) => { g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a'; };

  // Repaint the whole canvas from the stored strokes (used after undo).
  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    strokeStyle(g);
    for (const st of strokes.current) {
      if (!st.length) continue;
      g.beginPath();
      g.moveTo(st[0].x, st[0].y);
      if (st.length === 1) g.lineTo(st[0].x + 0.1, st[0].y + 0.1); // a tap = a dot
      else for (let i = 1; i < st.length; i++) g.lineTo(st[i].x, st[i].y);
      g.stroke();
    }
  };

  const onDown = (e) => {
    drawing.current = true;
    current.current = [pointFromEvent(e)];
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = ctx();
    const p = pointFromEvent(e);
    const st = current.current;
    strokeStyle(g);
    g.beginPath();
    g.moveTo(st[st.length - 1].x, st[st.length - 1].y);
    g.lineTo(p.x, p.y);
    g.stroke();
    st.push(p);
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current?.length) {
      strokes.current.push(current.current);
      setStrokeCount(strokes.current.length);
    }
    current.current = null;
  };

  const undo = () => {
    if (!strokes.current.length) return;
    strokes.current.pop();
    setStrokeCount(strokes.current.length);
    redraw();
  };

  const clearCanvas = () => {
    strokes.current = [];
    current.current = null;
    setStrokeCount(0);
    const c = canvasRef.current;
    if (c) ctx().clearRect(0, 0, c.width, c.height);
  };

  // Ctrl/⌘+Z undoes the last stroke while drawing (ignored when typing in a field).
  useEffect(() => {
    if (mode !== 'draw') return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const upload = async (fileOrBlob, name) => {
    setError(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('signature', fileOrBlob, name);
      const { signature_url } = await api('/api/auth/me/signature', { method: 'POST', body: fd });
      onUpdated({ ...me, signature_url });
      clearCanvas();
    } catch (e) {
      setError(e.message || 'Could not save the signature.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveDrawn = () => {
    const c = canvasRef.current;
    if (!c || !hasDrawing) return;
    c.toBlob((blob) => { if (blob) upload(blob, 'signature.png'); }, 'image/png');
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image is larger than 5 MB.'); e.target.value = ''; return; }
    upload(f, f.name);
  };

  const remove = async () => {
    setError(''); setBusy(true);
    try {
      await api('/api/auth/me/signature', { method: 'DELETE' });
      onUpdated({ ...me, signature_url: null });
    } catch (e) {
      setError(e.message || 'Could not remove the signature.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">E-signature</h2>
        <p className="text-xs text-slate-500 mt-0.5">Draw or upload a signature to use when signing off on work orders.</p>
      </header>

      <div className="px-5 py-4 space-y-4">
        {me?.signature_url && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,#fff_25%,#fff_75%,#f1f5f9_75%)] [background-size:14px_14px] [background-position:0_0,7px_7px] p-3">
            <img src={me.signature_url} alt="Your signature" className="max-h-16 max-w-[220px] object-contain" />
            <button type="button" onClick={remove} disabled={busy} className="ml-auto text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50">
              Remove
            </button>
          </div>
        )}

        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
          {['draw', 'upload'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); }}
              className={`rounded-md px-3 py-1 capitalize transition-colors ${mode === m ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="w-full touch-none rounded-md border border-dashed border-slate-300 bg-white"
              style={{ aspectRatio: '3 / 1', cursor: 'crosshair' }}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button type="button" onClick={undo} disabled={!hasDrawing || busy} title="Undo (Ctrl+Z)" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                  Undo
                </button>
                <button type="button" onClick={clearCanvas} disabled={!hasDrawing || busy} className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40">
                  Clear
                </button>
              </div>
              <button type="button" onClick={saveDrawn} disabled={!hasDrawing || busy} className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-50">
                {busy ? 'Saving…' : 'Save signature'}
              </button>
            </div>
          </div>
        ) : (
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 py-8 text-center hover:border-accent-300 hover:bg-accent-50/30 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
            <span className="text-sm font-medium text-slate-700">{busy ? 'Uploading…' : 'Click to upload a signature image'}</span>
            <span className="text-[11px] text-slate-500">PNG with transparent background works best · up to 5 MB</span>
            <input ref={fileRef} type="file" accept={SIG_ACCEPT} onChange={onPickFile} className="hidden" />
          </label>
        )}

        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </section>
  );
}

/* -------- Change password -------- */

export function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!current || !next || !confirm) {
      setError('All fields are required.');
      return;
    }
    if (!isPasswordValid(next)) {
      setError('New password does not meet the security requirements below.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (next === current) {
      setError('New password must be different from your current password.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next })
      });
      // The server re-issues the token in a fresh httpOnly cookie, so this
      // device stays signed in while other sessions are invalidated.
      setSuccess('Password updated. You’ve been signed out on other devices.');
      reset();
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
        <p className="text-xs text-slate-500 mt-0.5">Meet all the requirements below. You'll stay signed in on this device.</p>
      </header>
      <form onSubmit={submit} className="px-5 py-4 space-y-3">
        <PwField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PwField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        {next && (
          <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2.5">
            <PasswordChecklist password={next} />
          </div>
        )}
        <PwField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

        {error && (
          <p className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
        {success && (
          <p className="rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-xs text-accent-800">{success}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { reset(); setError(''); setSuccess(''); }}
            disabled={submitting}
            className="btn-ghost !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={submitting || !current || !isPasswordValid(next) || next !== confirm}
            className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PwField({ label, value, onChange, autoComplete }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      />
    </label>
  );
}

/* -------- Performance (technician scorecard) -------- */

export function PerformanceCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/api/auth/me/stats')
      .then((data) => active && setStats(data))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const rating = stats?.rating;
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Performance</h2>
        <p className="text-xs text-slate-500 mt-0.5">Your work orders and technician rating.</p>
      </header>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
        <Metric label="On hold" value={loading ? '—' : stats?.onHold ?? 0} tone="slate" />
        <Metric label="Resolved" value={loading ? '—' : stats?.resolved ?? 0} tone="accent" />
        <Metric label="SLA breaches" value={loading ? '—' : stats?.breached ?? 0} tone="rose" />
        <div className="px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rating</div>
          {loading ? (
            <div className="mt-1.5 text-2xl font-bold text-slate-400 tabular-nums">—</div>
          ) : rating?.count ? (
            <div className="mt-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{rating.average.toFixed(1)}</span>
                <span className="text-xs text-slate-400">/ 5</span>
              </div>
              <RatingStars value={rating.average} />
              <div className="mt-0.5 text-[11px] text-slate-500">
                {rating.count} {rating.count === 1 ? 'rating' : 'ratings'}
              </div>
            </div>
          ) : (
            <div className="mt-1.5">
              <RatingStars value={0} />
              <div className="mt-0.5 text-[11px] text-slate-500">No ratings yet</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    accent: 'text-accent-700',
    rose: 'text-rose-600'
  };
  return (
    <div className="px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${tones[tone] || tones.slate}`}>{value}</div>
    </div>
  );
}

// Five stars filled to the nearest half for the given 1–5 average.
function RatingStars({ value = 0 }) {
  return (
    <div className="mt-1 flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1))); // 0, partial, or 1
        return (
          <span key={n} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-slate-200" filled />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="h-4 w-4 text-amber-400" filled />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Star({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

/* -------- Account activity -------- */

export function ActivityCard({ me, loading }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Account activity</h2>
        <p className="text-xs text-slate-500 mt-0.5">Recent activity and milestones.</p>
      </header>
      <dl className="divide-y divide-slate-100">
        <Row label="Last sign-in" value={loading ? 'Loading…' : formatDateTime(me?.last_login_at)} />
        <Row label="Member since" value={loading ? 'Loading…' : formatDateTime(me?.created_at)} />
        <Row label="Status" value={<StatusDot active />} />
      </dl>
    </section>
  );
}

function StatusDot({ active }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent-500' : 'bg-slate-300'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/* -------- Access overview -------- */

export function PermissionsCard({ me }) {
  const perms = me?.permissions || {};
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Access</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          What you can do, based on your <span className="capitalize font-medium text-slate-700">{me?.role || 'user'}</span> role.
        </p>
      </header>
      <ul className="divide-y divide-slate-100">
        {PERMISSION_MODULES.map((mod) => (
          <li key={mod.key} className="px-5 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{mod.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {mod.actions.map((act) => {
                const allowed = perms[mod.key]?.[act] === true;
                return (
                  <span
                    key={act}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                      allowed
                        ? 'bg-accent-50 text-accent-800 ring-accent-200'
                        : 'bg-slate-50 text-slate-500 ring-slate-200'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${allowed ? 'bg-accent-500' : 'bg-slate-300'}`} />
                    {ACTION_LABELS[act] || act}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------- Notification Preferences -------- */

const NOTIF_OPTIONS = [
  { key: 'email_assigned',      label: 'Work order assigned to me',     desc: 'Get notified when a work order is assigned to you.' },
  { key: 'email_status_change', label: 'Status changes',                desc: 'Get notified when a work order you\'re involved in changes status.' },
  { key: 'email_new_comment',   label: 'New comments or notes',         desc: 'Get notified when someone adds a comment to your work order.' },
  { key: 'email_hr_approval',   label: 'HR approval requests',          desc: 'Get notified when an HR concern needs your approval.' }
];

export function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/auth/me/preferences')
      .then((data) => setPrefs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key) => {
    const current = prefs?.notifications?.[key] ?? true;
    setSaving(true);
    try {
      const updated = await api('/api/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ notifications: { [key]: !current } })
      });
      setPrefs(updated);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Notification preferences</h2>
        <p className="text-xs text-slate-500 mt-0.5">Choose which email notifications you receive.</p>
      </header>
      <ul className="divide-y divide-slate-100">
        {NOTIF_OPTIONS.map((opt) => {
          const checked = prefs?.notifications?.[opt.key] ?? true;
          return (
            <li key={opt.key} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                <div className="text-xs text-slate-500">{opt.desc}</div>
              </div>
              <ToggleSwitch
                checked={checked}
                disabled={loading || saving}
                onChange={() => toggle(opt.key)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------- Sessions & Security -------- */

export function SessionsSecurityCard({ me, loading: meLoading }) {
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const invalidateSessions = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api('/api/auth/me/invalidate-sessions', { method: 'POST' });
      setSuccess('All other sessions have been signed out.');
    } catch (e) {
      setError(e.message || 'Could not invalidate sessions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Sessions & security</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manage your active sessions and account security.</p>
      </header>

      <dl className="divide-y divide-slate-100">
        <Row label="Last sign-in" value={meLoading ? 'Loading...' : formatDateTime(me?.last_login_at)} />
        <Row label="Member since" value={meLoading ? 'Loading...' : formatDateTime(me?.created_at)} />
        <Row label="Status" value={<StatusDot active />} />
      </dl>

      <div className="border-t border-slate-100 px-5 py-4 space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-800">Sign out other devices</div>
          <p className="text-xs text-slate-500 mt-0.5">
            Invalidate all other active sessions. You'll stay signed in on this device.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
        {success && (
          <p className="rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-xs text-accent-800">{success}</p>
        )}

        <button
          type="button"
          onClick={invalidateSessions}
          disabled={busy}
          className="btn-secondary !px-3.5 !py-2 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50"
        >
          {busy ? 'Signing out...' : 'Sign out all other devices'}
        </button>
      </div>
    </section>
  );
}

/* -------- Chat Preferences -------- */

const CHAT_OPTIONS = [
  { key: 'sound_enabled', label: 'Notification sound',   desc: 'Play a sound when you receive a new chat message.' },
  { key: 'enter_to_send', label: 'Enter to send',        desc: 'Press Enter to send messages. When off, use Shift+Enter to send.' }
];

export function ChatPreferencesCard() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/auth/me/preferences')
      .then((data) => setPrefs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key) => {
    const current = prefs?.chat?.[key] ?? true;
    setSaving(true);
    try {
      const updated = await api('/api/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ chat: { [key]: !current } })
      });
      setPrefs(updated);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Chat preferences</h2>
        <p className="text-xs text-slate-500 mt-0.5">Customize your chat experience.</p>
      </header>
      <ul className="divide-y divide-slate-100">
        {CHAT_OPTIONS.map((opt) => {
          const checked = prefs?.chat?.[opt.key] ?? true;
          return (
            <li key={opt.key} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                <div className="text-xs text-slate-500">{opt.desc}</div>
              </div>
              <ToggleSwitch
                checked={checked}
                disabled={loading || saving}
                onChange={() => toggle(opt.key)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------- Toggle Switch -------- */

function ToggleSwitch({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-accent-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/* -------- Helpers -------- */

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <dt className="w-40 flex-none text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
