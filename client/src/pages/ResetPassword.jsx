import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/auth.js';
import { isPasswordValid } from '../lib/passwordPolicy.js';
import PasswordChecklist from '../components/PasswordChecklist.jsx';

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
    if (!isPasswordValid(password)) {
      setError('Your password does not meet the security requirements below.');
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
      <aside className="relative hidden lg:flex lg:w-5/12 flex-col justify-between overflow-hidden p-12 text-slate-800 bg-gradient-to-br from-white via-sky-50 to-blue-100">
        <div className="absolute inset-0 bg-grid mask-fade-radial opacity-70" />
        <div className="signin-blob-1 absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-sky-300/40 blur-3xl" />
        <div className="signin-blob-2 absolute -bottom-32 -right-24 h-[460px] w-[460px] rounded-full bg-blue-400/30 blur-3xl" />
        <div className="absolute -bottom-12 -left-10 h-[300px] w-[300px] rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-300/70 to-transparent" />

        <svg className="pointer-events-none absolute -right-4 top-8 h-64 w-64 text-blue-400/25" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 44h54a12 12 0 0 1 12 12v34a12 12 0 0 0 12 12h106" />
          <path d="M22 128h36a12 12 0 0 0 12-12V72" />
          <path d="M120 8v40a12 12 0 0 0 12 12h60" />
          <circle cx="8" cy="44" r="3.5" fill="currentColor" />
          <circle cx="74" cy="72" r="3.5" fill="currentColor" />
          <circle cx="22" cy="128" r="3.5" fill="currentColor" />
          <circle cx="120" cy="8" r="3.5" fill="currentColor" />
        </svg>

        <div className="relative">
          <Link to="/" className="inline-flex">
            <img src="/12a-removebg-preview.png" alt="Hubly" className="h-28 w-auto" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Hubly · Internal Portal
          </span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-900 leading-tight">
            Set a new{' '}
            <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">password</span>
          </h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Choose a strong password you don't use anywhere else. This link works once and expires an hour after it was sent.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Hubly</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono">Hubly v1.0.0</span>
        </div>
      </aside>

      <main className="relative flex-1 bg-slate-50 overflow-y-auto overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid mask-fade-radial opacity-60" />
        <div className="pointer-events-none absolute -z-10 -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-brand-100/70 blur-3xl" />

        <div className="min-h-full flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-8 flex items-center justify-between">
              <Link to="/" className="inline-flex items-center gap-3">
                <img src="/12a-removebg-preview.png" alt="Hubly" className="h-10 w-auto" />
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
                  <div className="mt-5 flex items-start gap-3 rounded-md bg-blue-50 ring-1 ring-blue-200 px-3 py-3">
                    <svg className="h-5 w-5 flex-none text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12l3 3 5-6" />
                    </svg>
                    <p className="text-sm text-blue-800 leading-relaxed">
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
                      Create a strong password that meets all the requirements below.
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
                        placeholder="Create a strong password"
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="mt-3 rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2.5">
                        <PasswordChecklist password={password} />
                      </div>
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
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {confirm && confirm !== password && (
                        <p className="mt-1.5 text-xs text-rose-600">Passwords don't match yet.</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !isPasswordValid(password) || password !== confirm}
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
                    <Link to="/signin" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
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
