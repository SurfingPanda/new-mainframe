export default function Footer() {
  return (
    <footer className="relative bg-brand-950 text-slate-300 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-500/60 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-grid-dark opacity-40 mask-fade-bottom" />

      <div className="container-page py-12 grid gap-10 sm:grid-cols-3">
        <div>
          <div className="inline-flex items-center gap-3">
            <img src="/images/logo.png" alt="Eljin Corp" className="h-9 w-auto" />
          </div>
          <p className="mt-4 text-sm text-slate-400 max-w-xs leading-relaxed">
            <span className="text-white font-semibold">Mainframe</span> — internal IT operations portal.
            For use by Eljin Corp employees and authorized contractors only.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-400">Modules</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="#modules" className="hover:text-white transition-colors">Ticketing</a></li>
            <li><a href="#modules" className="hover:text-white transition-colors">Asset Inventory</a></li>
            <li><a href="#modules" className="hover:text-white transition-colors">Knowledge Base</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-400">Support</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="mailto:it-helpdesk@eljin.corp" className="hover:text-white transition-colors">it-helpdesk@eljin.corp</a></li>
            <li><a href="tel:+10000000000" className="hover:text-white transition-colors">Internal ext. 4357 (HELP)</a></li>
            <li><a href="/api/health" className="hover:text-white transition-colors">API health</a></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-400">
          <div>© {new Date().getFullYear()} Eljin Corp. All rights reserved.</div>
          <div className="font-mono">Mainframe v1.0.0 · build {new Date().toISOString().slice(0, 10)}</div>
        </div>
      </div>
    </footer>
  );
}
