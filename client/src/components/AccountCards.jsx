import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/auth.js';

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
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
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
        <p className="text-xs text-slate-500 mt-0.5">Use at least 8 characters. You'll stay signed in on this device.</p>
      </header>
      <form onSubmit={submit} className="px-5 py-4 space-y-3">
        <PwField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PwField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
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
            disabled={submitting}
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
