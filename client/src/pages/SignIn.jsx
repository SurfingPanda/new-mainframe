import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../lib/auth.js';

export default function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!email || !password) {
      setError('Please enter your work email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setSession(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Brand panel — desktop only. Light, circuit-themed to match the logo. */}
      <aside className="signin-brand-anim relative hidden lg:flex lg:w-5/12 flex-col justify-between overflow-hidden p-12 text-slate-800 bg-gradient-to-br from-white via-sky-50 to-blue-100">
        {/* circuit grid + brand glows echoing the logo's blue palette */}
        <div className="absolute inset-0 bg-grid mask-fade-radial opacity-70" />
        <div className="signin-blob-1 absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-sky-300/40 blur-3xl" />
        <div className="signin-blob-2 absolute -bottom-32 -right-24 h-[460px] w-[460px] rounded-full bg-blue-400/30 blur-3xl" />
        <div className="absolute -bottom-12 -left-10 h-[300px] w-[300px] rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-300/70 to-transparent" />

        {/* decorative circuit traces nodding to the logo */}
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
            Welcome to{' '}
            <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">Hubly</span>.
          </h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Submit and track support work orders, manage corporate assets, and reference internal documentation —
            all from a single secure portal.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-slate-700">
            <Bullet>Single sign-on with the Hubly corporate directory</Bullet>
            <Bullet>Access scoped to your role and department</Bullet>
            <Bullet>Every action is logged for audit and compliance</Bullet>
          </ul>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Hubly</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono">Hubly v1.0.0</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="signin-form-anim relative flex-1 bg-slate-50 overflow-y-auto overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid mask-fade-radial opacity-60" />
        <div className="pointer-events-none absolute -z-10 -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -z-10 -bottom-20 -left-20 h-[260px] w-[260px] rounded-full bg-sky-100/70 blur-3xl" />

        <div className="min-h-full flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
          {/* Mobile-only header */}
          <div className="lg:hidden mb-8 flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src="/12a-removebg-preview.png" alt="Hubly" className="h-10 w-auto" />
            </Link>
            <Link to="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              ← Home
            </Link>
          </div>

          <div className="hidden lg:flex justify-end mb-6">
            <Link to="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              Back to home
            </Link>
          </div>

          <div className="signin-card-anim rounded-xl border border-slate-200 bg-white shadow-elevated p-7 sm:p-9">
            <div>
              <span className="eyebrow">Sign in</span>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-900 tracking-tight">
                Access your Hubly account
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Use your Hubly work credentials to continue.
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
            {info && (
              <div role="status" className="mt-5 flex items-start gap-2 rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-800">
                <svg className="h-4 w-4 flex-none mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>{info}</span>
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
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 6.1A10 10 0 0 1 22 12s-1.5 3.5-5 5.5" />
                        <path d="M6 7C3.5 8.7 2 12 2 12s4 7.5 10 7.5c1.7 0 3.3-.5 4.7-1.4" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s4-7.5 10-7.5S22 12 22 12s-4 7.5-10 7.5S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Keep me signed in for 7 days
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn-signin w-full disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <a
                href="mailto:it-helpdesk@hubly.app"
                className="text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Need access? Contact IT Helpdesk →
              </a>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate-500 leading-relaxed text-center">
            By signing in you acknowledge that this system is the property of Hubly.
            Unauthorized access is prohibited and may be subject to disciplinary action.
            All activity is monitored and logged.
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
      <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-500/15 ring-1 ring-inset ring-blue-500/30">
        <svg className="h-3 w-3 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
