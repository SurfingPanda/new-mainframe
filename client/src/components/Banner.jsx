export default function Banner() {
  return (
    <div className="bg-brand-950 text-brand-100 text-xs border-b border-white/10">
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-2 font-medium">
          <svg className="h-3.5 w-3.5 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>Eljin Corp internal system — authorized personnel only</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-brand-200">
          <span className="font-mono">v1.0.0</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            All services operational
          </span>
        </div>
      </div>
    </div>
  );
}
