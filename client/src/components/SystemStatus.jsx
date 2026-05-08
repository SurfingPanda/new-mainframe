const services = [
  { name: 'Ticketing service', state: 'Operational', detail: 'Last incident: none in 30 days' },
  { name: 'Asset Inventory', state: 'Operational', detail: 'Sync completed 12 min ago' },
  { name: 'Knowledge Base', state: 'Operational', detail: '317 published articles' },
  { name: 'Authentication (SSO)', state: 'Operational', detail: 'Eljin directory sync active' }
];

export default function SystemStatus() {
  return (
    <section id="status" className="relative py-16 sm:py-24 bg-white border-y border-slate-200 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid mask-fade-radial opacity-70" />

      <div className="container-page grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
          <span className="eyebrow">Service status</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-brand-900">
            Live system overview
          </h2>
          <p className="mt-3 text-slate-600">
            Mainframe is hosted on Eljin Corp's internal infrastructure. Status is monitored 24/7 by the
            IT operations team.
          </p>
          <a href="/api/health" className="mt-5 inline-flex items-center text-sm font-semibold text-accent-700 hover:text-accent-800">
            View raw health endpoint
            <svg className="ml-1 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="sm:col-span-6">Service</div>
              <div className="sm:col-span-3">State</div>
              <div className="sm:col-span-3 text-right">Last update</div>
            </div>
            <ul className="divide-y divide-slate-100">
              {services.map((s) => (
                <li key={s.name} className="flex flex-col gap-2 px-5 py-4 sm:grid sm:grid-cols-12 sm:items-center sm:gap-0">
                  <div className="sm:col-span-6">
                    <div className="font-medium text-brand-900">{s.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.detail}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <div className="sm:col-span-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                        {s.state}
                      </span>
                    </div>
                    <div className="sm:col-span-3 sm:text-right text-xs font-mono text-slate-500">just now</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
