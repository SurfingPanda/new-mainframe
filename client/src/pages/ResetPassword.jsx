import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/auth.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is missing its token. Please request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password })
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reset your password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="relative hidden lg:flex lg:w-5/12 flex-col justify-between bg-brand-950 text-slate-100 p-12 overflow-hidden">
        <div className="absolute inset-0 bg-grid-dark mask-fade-radial opacity-80" />
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-brand-700/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full bg-accent-700/30 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent-500/40 to-transparent" />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-3">
            <img src="/images/logo.png" alt="Eljin Corp" className="h-9 w-auto" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            Eljin Corp · IT Portal
          </span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white leading-tight">
            Set a new <span className="text-accent-400">password</span>
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed">
            Choose a strong password you don't use anywhere else. This link works once and expires an hour after it was sent.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Eljin Corp</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono">Mainframe v1.0.0</span>
        </div>
      </aside>

      <main className="relative flex-1 bg-slate-50 overflow-y-auto overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid mask-fade-radial opacity-60" />
        <div className="pointer-events-none absolute -z-10 -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-brand-100/70 blur-3xl" />

        <div className="min-h-full flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-8 flex items-center justify-between">
              <Link to="/" className="inline-flex items-center gap-3">
                <img src="/images/logo.png" alt="Eljin Corp" className="h-9 w-auto" />
              </Link>
              <Link to="/signin" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                ← Sign in
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-elevated p-7 sm:p-9">
              {done ? (
                <div>
                  <span className="eyebrow">Password updated</span>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                    You're all set
                  </h2>
                  <div className="mt-5 flex items-start gap-3 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-3">
                    <svg className="h-5 w-5 flex-none text-accent-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12l3 3 5-6" />
                    </svg>
                    <p className="text-sm text-accent-800 leading-relaxed">
                      Your password has been changed. Sign in with your new password.
                    </p>
                  </div>
                  <div className="mt-7 pt-5 border-t border-slate-100">
                    <Link to="/signin" className="btn-primary w-full">Go to sign in</Link>
                  </div>
                </div>
              ) : !token ? (
                <div>
                  <span className="eyebrow">Invalid link</span>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                    This link looks incomplete
                  </h2>
                  <p className="mt-3 text-sm text-slate-600">
                    The reset link is missing its token. Request a fresh one and use the latest email.
                  </p>
                  <div className="mt-7 pt-5 border-t border-slate-100">
                    <Link to="/forgot-password" className="btn-primary w-full">Request a new link</Link>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="eyebrow">Reset password</span>
                    <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                      Choose a new password
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-600">
                      At least 8 characters. You'll use this to sign in.
                    </p>
                  </div>

                  {error && (
                    <div role="alert" className="mt-5 flex items-start gap-2 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
                      <svg className="h-4 w-4 flex-none mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                    <div>
                      <label htmlFor="password" className="text-xs font-semibold text-slate-700">New password</label>
                      <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm" className="text-xs font-semibold text-slate-700">Confirm password</label>
                      <input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Re-enter the password"
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary w-full disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          Updating…
                        </>
                      ) : (
                        'Set new password'
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                    <Link to="/signin" className="text-sm font-semibold text-accent-700 hover:text-accent-800">
                      Back to sign in →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
