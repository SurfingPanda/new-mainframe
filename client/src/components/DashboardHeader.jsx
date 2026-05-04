import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getUser, hasPermission } from '../lib/auth.js';
import NavDropdown from './NavDropdown.jsx';

function ticketsMenu(user) {
  const sections = [
    {
      heading: 'Views',
      items: [
        { to: '/tickets/my-queue', label: 'My Queue', desc: 'Tickets assigned to you', icon: 'queue' },
        { to: '/tickets/all', label: 'All Tickets', desc: 'Every ticket in the system', icon: 'list' }
      ]
    }
  ];
  if (hasPermission('tickets', 'create', user)) {
    sections.push({
      heading: 'Create',
      items: [
        { to: '/tickets/create-incident', label: 'Create Incident', desc: 'Report an outage or service issue', icon: 'alert', tone: 'accent' },
        { to: '/tickets/create', label: 'Create New Ticket', desc: 'Open a standard support request', icon: 'plus', tone: 'accent' }
      ]
    });
  }
  return sections;
}

function assetsMenu(user) {
  const sections = [
    {
      heading: 'Inventory',
      items: [
        { to: '/assets/all', label: 'All Assets', desc: 'Full inventory across departments', icon: 'box' },
        { to: '/assets/assigned', label: 'Assigned Assets', desc: 'Currently issued to employees', icon: 'user-check' },
        { to: '/assets/available', label: 'Available Assets', desc: 'Ready to be issued', icon: 'check-circle' },
        { to: '/assets/maintenance', label: 'Under Maintenance', desc: 'Out for repair or service', icon: 'wrench' },
        { to: '/assets/retired', label: 'Retired Assets', desc: 'Decommissioned hardware', icon: 'archive' }
      ]
    }
  ];
  const actions = [
    { to: '/assets/request', label: 'Asset Request', desc: 'Request equipment for an employee', icon: 'inbox-in', tone: 'accent' }
  ];
  if (hasPermission('assets', 'manage', user)) {
    actions.unshift({ to: '/assets/new', label: 'Add New Asset', desc: 'Register hardware in inventory', icon: 'plus', tone: 'accent' });
  }
  sections.push({ heading: 'Actions', items: actions });
  return sections;
}

const KB_MENU = [
  {
    heading: 'Browse',
    items: [
      { to: '/kb/all', label: 'All Articles', desc: 'Every published article', icon: 'book' },
      { to: '/kb/troubleshooting', label: 'Troubleshooting Guides', desc: 'Step-by-step fixes', icon: 'life-buoy' },
      { to: '/kb/faq', label: "FAQ's", desc: 'Frequently asked questions', icon: 'help' },
      { to: '/kb/policies', label: 'Policies & Procedures', desc: 'Internal policies and SOPs', icon: 'shield' }
    ]
  }
];

export default function DashboardHeader() {
  const navigate = useNavigate();
  const user = getUser();

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const logout = () => {
    clearSession();
    navigate('/signin');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden">
      <div className="container-app flex items-center justify-between h-16">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/images/logo.png" alt="Eljin Corp" className="h-9 w-auto" />
          <span className="hidden sm:inline-flex items-center gap-2 pl-3 border-l border-slate-200">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mainframe</span>
            <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-200">
              Internal
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) =>
              `rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'text-brand-900 bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`
            }
          >
            Overview
          </NavLink>
          {hasPermission('tickets', 'view', user) && (
            <NavDropdown label="Tickets" basePath="/tickets" sections={ticketsMenu(user)} />
          )}
          {hasPermission('assets', 'view', user) && (
            <NavDropdown label="Assets" basePath="/assets" sections={assetsMenu(user)} />
          )}
          {hasPermission('kb', 'view', user) && (
            <NavDropdown label="Knowledge Base" basePath="/kb" sections={KB_MENU} />
          )}
          {hasPermission('users', 'manage', user) && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-brand-900 bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Users
              <span className="ml-0.5 rounded-full bg-accent-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-200">
                Admin
              </span>
            </NavLink>
          )}
        </nav>

        <ProfileMenu user={user} initials={initials} onSignOut={logout} />
      </div>
    </header>
  );
}

function ProfileMenu({ user, initials, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${open ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
      >
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold text-slate-900">{user?.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">{user?.role}</span>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-white text-sm font-bold">
          {initials}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white shadow-elevated ring-1 ring-black/5 overflow-hidden"
        >
          <div className="px-4 pt-3 pb-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <div className="py-1">
            <Link
              to="/settings"
              role="menuitem"
              className="group flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-900"
            >
              <svg className="h-4 w-4 text-slate-500 group-hover:text-brand-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
            <button
              type="button"
              onClick={onSignOut}
              role="menuitem"
              className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
