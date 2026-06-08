const modules = [
  {
    id: 'ticketing',
    name: 'Work Orders',
    summary: 'Submit, triage, and resolve support requests.',
    tone: 'from-sky-500 to-brand-700',
    accent: 'text-sky-600',
    points: [
      'Single intake from email and the portal',
      'SLA timers with automatic escalation',
      'Internal notes, attachments, and audit history'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
        <path d="M9 5v14" strokeDasharray="2 2" />
      </svg>
    )
  },
  {
    id: 'spaces',
    name: 'Spaces',
    summary: 'Plan and track team projects on a board.',
    tone: 'from-violet-500 to-indigo-600',
    accent: 'text-violet-600',
    points: [
      'Board, list, calendar, and timeline views',
      'Goals, documents, and per-item activity',
      'Private to members — separate from IT work orders'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
      </svg>
    )
  },
  {
    id: 'kb',
    name: 'Knowledge Base',
    summary: 'Internal documentation, written once.',
    tone: 'from-emerald-500 to-teal-600',
    accent: 'text-emerald-600',
    points: [
      'Markdown editor with versioning',
      'Categorized and full-text searchable',
      'Linked directly from related work orders'
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </svg>
    )
  }
];

export default function Modules() {
  return (
    <section id="modules" className="relative py-16 sm:py-24 bg-slate-50 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-dots opacity-60 mask-fade-radial" />

      <div className="container-page">
        <div className="max-w-2xl">
          <span className="eyebrow">Modules</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-brand-900">
            Three connected services
          </h2>
          <p className="mt-3 text-slate-600">
            Each module is part of the same platform. Work orders, project spaces, and articles all live
            together — linked from wherever they apply.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {modules.map((m, i) => (
            <article
              key={m.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-elevated"
            >
              <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.tone}`} />
              <div className="flex items-start justify-between">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${m.tone} text-white shadow-sm`}>
                  <div className="h-5 w-5">{m.icon}</div>
                </div>
                <span className={`font-mono text-xs font-semibold ${m.accent}`}>0{i + 1}</span>
              </div>

              <h3 className="mt-5 text-lg font-semibold text-brand-900">{m.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{m.summary}</p>

              <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                {m.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                    <svg className={`mt-0.5 h-4 w-4 flex-none ${m.accent}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
