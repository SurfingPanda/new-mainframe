import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-white via-brand-50/40 to-white">
      <div className="absolute inset-0 -z-10 bg-grid mask-fade-radial" />
      <div className="absolute -z-10 -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-brand-100/70 blur-3xl" />
      <div className="absolute -z-10 top-40 -left-24 h-[360px] w-[360px] rounded-full bg-accent-100/60 blur-3xl" />

      <div className="container-page py-16 sm:py-24 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7">
          <span className="eyebrow">Eljin Corp · Internal IT Portal</span>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-brand-900">
            Mainframe
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl leading-relaxed">
            The IT department's operations portal. Submit and track support tickets, manage the corporate
            asset inventory, and reference internal documentation — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signin" className="btn-primary">
              Sign in with Eljin account
              <svg className="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <a href="#modules" className="btn-ghost">View modules</a>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 max-w-lg border-t border-slate-200 pt-6">
            <Stat label="Open tickets" value="42" />
            <Stat label="Assets tracked" value="1,284" />
            <Stat label="KB articles" value="317" />
          </dl>
        </div>

        <div className="lg:col-span-5">
          <div className="relative">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-accent-500/30 via-transparent to-brand-500/30 blur-lg" aria-hidden />
            <div className="relative rounded-lg border border-slate-200 bg-white shadow-elevated overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>
                <span className="text-xs font-mono text-slate-500">mainframe.eljin.local</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recent tickets</p>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                    <TicketRow id="T-1042" title="Outlook prompts for credentials" priority="Normal" tone="amber" />
                    <TicketRow id="T-1041" title="Replace dock — monitor flicker" priority="Low" tone="slate" />
                    <TicketRow id="T-1039" title="VPN client install — Sales team" priority="High" tone="rose" />
                  </ul>
                </div>
                <div className="flex items-center justify-between rounded-md bg-accent-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-accent-100">
                  <span className="text-accent-800">Avg. resolution this week</span>
                  <span className="font-mono font-semibold text-accent-900">4h 12m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-brand-900">{value}</dd>
    </div>
  );
}

function TicketRow({ id, title, priority, tone }) {
  const tones = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200'
  };
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-xs text-slate-500 shrink-0">{id}</span>
        <span className="truncate text-slate-800">{title}</span>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${tones[tone]}`}>
        {priority}
      </span>
    </li>
  );
}
