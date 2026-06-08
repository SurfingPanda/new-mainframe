import SignInButton from './SignInButton.jsx';

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white via-brand-50/30 to-slate-50">
      <div className="absolute inset-0 -z-10 bg-grid mask-fade-radial" />
      <div className="absolute -z-10 -top-40 right-0 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-brand-200/60 to-accent-200/40 blur-3xl" />
      <div className="absolute -z-10 top-44 -left-32 h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-violet-200/40 to-accent-100/50 blur-3xl" />

      <div className="container-page py-16 sm:py-24 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50/80 px-3 py-1 text-xs font-semibold text-accent-700 shadow-sm backdrop-blur">
            <span className="relative flex h-1.5 w-1.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-accent-500" />
            </span>
            New · Spaces for team collaboration
          </span>

          <h1 className="mt-5 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-brand-900">
            <span className="bg-gradient-to-br from-brand-900 via-brand-700 to-accent-600 bg-clip-text text-transparent">Hubly</span>
          </h1>
          <p className="mt-3 text-xl sm:text-2xl font-semibold text-slate-700">
            All your team's work, in one hub.
          </p>
          <p className="mt-4 text-lg text-slate-600 max-w-xl leading-relaxed">
            The internal portal for every team at Eljin Corp. Submit and track requests, collaborate in
            project spaces, and reference shared documentation — together in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SignInButton className="btn-primary !px-5 !py-3 text-base">
              Sign in with Eljin account
              <svg className="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </SignInButton>
            <a href="#modules" className="btn-ghost !px-5 !py-3 text-base">View modules</a>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 max-w-lg border-t border-slate-200 pt-6">
            <Stat label="Open work orders" value="42" tone="text-brand-700" />
            <Stat label="Project spaces" value="18" tone="text-violet-600" />
            <Stat label="KB articles" value="317" tone="text-accent-600" />
          </dl>
        </div>

        <div className="lg:col-span-6">
          <div className="relative">
            {/* glow */}
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-accent-500/25 via-violet-400/15 to-brand-500/25 blur-2xl" aria-hidden />

            {/* main app window */}
            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-elevated overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-300" />
                </div>
                <span className="text-xs font-mono text-slate-400">hubly.eljin.local</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recent work orders</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                    <TicketRow id="WO00001042" title="Outlook prompts for credentials" priority="Normal" tone="amber" />
                    <TicketRow id="WO00001041" title="Replace dock — monitor flicker" priority="Low" tone="slate" />
                    <TicketRow id="WO00001039" title="VPN client install — Sales team" priority="High" tone="rose" />
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-accent-50 px-3 py-2.5 ring-1 ring-inset ring-accent-100">
                    <p className="text-[11px] font-medium text-accent-700">Avg. resolution</p>
                    <p className="mt-0.5 font-mono text-base font-semibold text-accent-900">4h 12m</p>
                  </div>
                  <div className="rounded-xl bg-violet-50 px-3 py-2.5 ring-1 ring-inset ring-violet-100">
                    <p className="flex items-center gap-1 text-[11px] font-medium text-violet-700">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4" /></svg>
                      Active spaces
                    </p>
                    <p className="mt-0.5 font-mono text-base font-semibold text-violet-900">18</p>
                  </div>
                </div>
              </div>
            </div>

            {/* floating chip — top right */}
            <div className="absolute -top-4 -right-3 hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-elevated backdrop-blur">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500 text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-brand-900">WO resolved</p>
                <p className="text-[10px] text-slate-500">SLA met · 2m ago</p>
              </div>
            </div>

            {/* floating chip — bottom left */}
            <div className="absolute -bottom-4 -left-3 hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-elevated backdrop-blur">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-brand-900">3 teammates</p>
                <p className="text-[10px] text-slate-500">active in Spaces</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = 'text-brand-900' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${tone}`}>{value}</dd>
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
