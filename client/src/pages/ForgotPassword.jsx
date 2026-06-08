import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/auth.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your work email.');
      return;
    }

    setLoading(true);
    try {
      // Hold the loading state for a perceptible beat — the API responds in
      // ~20ms on localhost, which makes the spinner invisible and the form
      // jump feel like nothing happened.
      await Promise.all([
        api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() })
        }),
        new Promise((r) => setTimeout(r, 800))
      ]);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not send the request. Please try again.');
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
            Eljin Corp · Internal Portal
          </span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white leading-tight">
            Locked out of <span className="text-accent-400">Hubly</span>?
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed">
            Enter your work email and we'll send a secure link to reset your password. The link works once
            and expires after an hour. IT is also notified so they can help if you get stuck.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            <Bullet>A reset link is emailed if an account exists</Bullet>
            <Bullet>The link is single-use and expires in 1 hour</Bullet>
            <Bullet>IT is notified as a fallback if you need a hand</Bullet>
          </ul>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Eljin Corp</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono">Hubly v1.0.0</span>
        </div>
      </aside>

      <main className="relative flex-1 bg-slate-50 overflow-y-auto overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid mask-fade-radial opacity-60" />
        <div className="pointer-events-none absolute -z-10 -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -z-10 -bottom-20 -left-20 h-[260px] w-[260px] rounded-full bg-accent-100/60 blur-3xl" />

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

            <div className="hidden lg:flex justify-end mb-6">
              <Link to="/signin" className="text-sm font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Back to sign in
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-elevated p-7 sm:p-9">
              {submitted ? (
                <div>
                  <span className="eyebrow">Request received</span>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                    Check your inbox
                  </h2>
                  <div className="mt-5 flex items-start gap-3 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-3">
                    <svg className="h-5 w-5 flex-none text-accent-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12l3 3 5-6" />
                    </svg>
                    <p className="text-sm text-accent-800 leading-relaxed">
                      If an account exists for <span className="font-mono">{email.trim()}</span>, we've
                      emailed a password reset link. It's single-use and expires in an hour.
                    </p>
                  </div>

                  <div className="mt-6 space-y-2 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-800">Didn't hear back?</span> Reach the
                      helpdesk directly — they can confirm your identity and issue a reset on the spot.
                    </p>
                    <a
                      href="mailto:it-helpdesk@eljin.corp"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16v16H4z" />
                        <path d="M4 4l8 8 8-8" />
                      </svg>
                      it-helpdesk@eljin.corp
                    </a>
                  </div>

                  <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => { setSubmitted(false); setEmail(''); }}
                      className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Send another request
                    </button>
                    <Link to="/signin" className="btn-primary !px-3.5 !py-2 text-xs">
                      Back to sign in
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="eyebrow">Forgot password</span>
                    <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                      Reset your Hubly password
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-600">
                      Enter your work email and we'll send you a reset link.
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
                      <label htmlFor="email" className="text-xs font-semibold text-slate-700">
                        Work email
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@eljin.corp"
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                      />
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        We'll never reveal whether an account exists — every request gets the same response.
                      </p>
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
                          Sending request…
                        </>
                      ) : (
                        'Request password reset'
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                    <Link
                      to="/signin"
                      className="text-sm font-semibold text-accent-700 hover:text-accent-800"
                    >
                      Remembered it? Sign in →
                    </Link>
                  </div>
                </>
              )}
            </div>

            <p className="mt-6 text-[11px] text-slate-500 leading-relaxed text-center">
              For your security, the reset link is single-use and expires after an hour. Didn't request it?
              You can safely ignore the email — your password won't change.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Bullet({ children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent-500/20 ring-1 ring-inset ring-accent-400/40">
        <svg className="h-3 w-3 text-accent-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
