import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getUser, hasPermission } from '../lib/auth.js';
import { getTheme, toggleTheme } from '../lib/theme.js';
import NavDropdown from './NavDropdown.jsx';
import Modal from './Modal.jsx';

function ticketsMenu(user) {
  const sections = [
    {
      heading: 'Views',
      items: [
        { to: '/tickets/my-queue', label: 'My Queue', desc: 'Tickets assigned to you', icon: 'queue' },
        { to: '/tickets/submitted', label: 'Submitted Tickets', desc: 'Tickets you own or were filed for you', icon: 'submitted' },
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

const NETWORK_MENU = [
  {
    heading: 'Live',
    items: [
      { to: '/network', label: 'Network Monitoring', desc: 'Reachability and latency', icon: 'wifi' }
    ]
  },
  {
    heading: 'Daily reports',
    items: [
      { to: '/network/reports', label: 'All Daily Reports', desc: 'Past network reports', icon: 'clipboard' },
      { to: '/network/reports/new', label: "Today's Report", desc: 'Capture today on the network', icon: 'plus', tone: 'accent' }
    ]
  }
];

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
  const location = useLocation();
  const user = getUser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const requestLogout = () => setConfirmOpen(true);

  const confirmLogout = () => {
    setConfirmOpen(false);
    clearSession();
    navigate('/signin');
  };

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <>
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden dark:bg-slate-900/95 dark:border-slate-800">
      <div className="container-app flex items-center justify-between h-16">
        <Link to="/dashboard" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/images/logo.png" alt="Eljin Corp" className="h-8 sm:h-9 w-auto" />
          <span className="hidden sm:inline-flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Mainframe</span>
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
                isActive
                  ? 'text-brand-900 bg-slate-100 dark:text-white dark:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
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
          {(user?.role === 'admin' || user?.role === 'agent') && (
            <NavDropdown label="Network" basePath="/network" sections={NETWORK_MENU} />
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

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
          <ProfileMenu user={user} initials={initials} onSignOut={requestLogout} />
        </div>
      </div>

      {mobileOpen && (
        <MobileNav user={user} onClose={() => setMobileOpen(false)} />
      )}
    </header>

    <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Sign out" size="sm">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Are you sure you want to sign out
        {user?.name ? <>, <span className="font-semibold text-brand-900 dark:text-white">{user.name}</span></> : ''}
        ? You'll need to sign in again to access Mainframe.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirmOpen(false)}
          className="btn-ghost !px-3.5 !py-2 text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirmLogout}
          autoFocus
          className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition-colors"
        >
          <svg className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </Modal>
    </>
  );
}

function MobileNav({ user, onClose }) {
  const sections = [];
  sections.push({
    heading: 'Overview',
    items: [{ to: '/dashboard', label: 'Overview', desc: 'Dashboard home' }]
  });
  if (hasPermission('tickets', 'view', user)) {
    sections.push({ heading: 'Tickets', items: ticketsMenu(user).flatMap((s) => s.items) });
  }
  if (hasPermission('assets', 'view', user)) {
    sections.push({ heading: 'Assets', items: assetsMenu(user).flatMap((s) => s.items) });
  }
  if (hasPermission('kb', 'view', user)) {
    sections.push({ heading: 'Knowledge Base', items: KB_MENU.flatMap((s) => s.items) });
  }
  if (user?.role === 'admin' || user?.role === 'agent') {
    sections.push({ heading: 'Network', items: NETWORK_MENU.flatMap((s) => s.items) });
  }
  if (hasPermission('users', 'manage', user)) {
    sections.push({
      heading: 'Admin',
      items: [{ to: '/users', label: 'Users', desc: 'Manage user accounts' }]
    });
  }

  return (
    <div className="md:hidden border-t border-slate-200 bg-white max-h-[calc(100vh-4rem)] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
      <nav className="container-app py-3 space-y-1">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="pb-2">
            <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              {section.heading}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onClose}
                    className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <span className="block font-medium">{item.label}</span>
                    {item.desc && (
                      <span className="block text-[11px] text-slate-500 mt-0.5 dark:text-slate-400">{item.desc}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function ProfileMenu({ user, initials, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState(() => getTheme());
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const onChange = (e) => setThemeState(e.detail);
    window.addEventListener('themechange', onChange);
    return () => window.removeEventListener('themechange', onChange);
  }, []);

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

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
        className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
          open
            ? 'bg-slate-100 dark:bg-slate-800'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{user?.role}</span>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-white text-sm font-bold dark:bg-brand-600">
          {initials}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
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
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white shadow-elevated ring-1 ring-black/5 overflow-hidden dark:bg-slate-900 dark:border-slate-700 dark:ring-white/5"
        >
          <div className="px-4 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate dark:text-slate-400">{user?.email}</div>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={handleToggleTheme}
              role="menuitemcheckbox"
              aria-checked={theme === 'dark'}
              className="group flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <span className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <svg className="h-4 w-4 text-slate-500 group-hover:text-brand-900 dark:text-slate-400 dark:group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-slate-500 group-hover:text-brand-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
              <span
                aria-hidden
                className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-accent-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                    theme === 'dark' ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
            <Link
              to="/settings"
              role="menuitem"
              className="group flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg className="h-4 w-4 text-slate-500 group-hover:text-brand-900 dark:text-slate-400 dark:group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
            <button
              type="button"
              onClick={onSignOut}
              role="menuitem"
              className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
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
