import { useState } from 'react';
import { Link } from 'react-router-dom';

const links = [
  { href: '#modules', label: 'Modules' },
  { href: '#status', label: 'System status' },
  { href: '#support', label: 'Support' }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
      <nav className="container-page flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-3">
          <img src="/images/logo.png" alt="Eljin Corp" className="h-9 w-auto" />
          <span className="hidden sm:inline-flex items-center gap-2 pl-3 border-l border-slate-200">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mainframe</span>
            <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-200">
              IT Portal
            </span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/signin" className="btn-primary">Sign in</Link>
        </div>

        <button
          aria-label="Toggle menu"
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100"
          onClick={() => setOpen(!open)}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="container-page py-3 flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2 text-slate-700 font-medium">
                {l.label}
              </a>
            ))}
            <Link to="/signin" onClick={() => setOpen(false)} className="btn-primary mt-3 self-start">Sign in</Link>
          </div>
        </div>
      )}
    </header>
  );
}
