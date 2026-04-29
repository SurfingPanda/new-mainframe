import { Link } from 'react-router-dom';

export default function AccessCTA() {
  return (
    <section id="signin" className="relative py-20 sm:py-28 overflow-hidden bg-brand-950 text-slate-100">
      <div className="absolute inset-0 -z-10 bg-grid-dark mask-fade-radial" />
      <div className="absolute -z-10 top-0 left-1/3 h-[420px] w-[420px] rounded-full bg-brand-700/40 blur-3xl" />
      <div className="absolute -z-10 bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-accent-700/30 blur-3xl" />

      <div className="container-page" id="support">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            Get started
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to access Mainframe?
          </h2>
          <p className="mt-4 text-slate-300 leading-relaxed">
            Sign in with your Eljin Corp account to open the IT portal. If you do not yet have access,
            reach out to the IT Helpdesk and we'll get you provisioned.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signin" className="btn-accent">
              Sign in to Mainframe
              <svg className="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <a
              href="mailto:it-helpdesk@eljin.corp"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Contact IT Helpdesk
            </a>
          </div>

          <p className="mt-10 text-xs text-slate-400">
            Authorized personnel only. All activity is logged for audit purposes.
          </p>
        </div>
      </div>
    </section>
  );
}
