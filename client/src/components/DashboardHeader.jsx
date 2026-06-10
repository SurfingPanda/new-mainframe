import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout, getUser, hasPermission } from '../lib/auth.js';
import NavDropdown from './NavDropdown.jsx';
import NotificationBell from './NotificationBell.jsx';
import Avatar from './Avatar.jsx';
import FloatingChat from './FloatingChat.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { usePendingResetCount } from '../lib/usePendingResetCount.js';
import { useWorkOrderNotifications } from '../lib/useWorkOrderNotifications.js';
import { useChatUnread } from '../lib/useChatUnread.js';
import { useMailboxUnread } from '../lib/useMailboxUnread.js';
import Modal from './Modal.jsx';

function ticketsMenu(user) {
  const sections = [
    {
      heading: 'Views',
      items: [
        { to: '/tickets/my-queue', label: 'My Queue', desc: 'Work orders assigned to you', icon: 'queue' },
        { to: '/tickets/submitted', label: 'Submitted Work Orders', desc: 'Work orders you own or were filed for you', icon: 'submitted' },
        { to: '/tickets/all', label: 'All Work Orders', desc: 'Every work order in the system', icon: 'list' }
      ]
    }
  ];
  if (hasPermission('tickets', 'create', user)) {
    sections.push({
      heading: 'Create',
      items: [
        { to: '/tickets/create-incident', label: 'Create Incident', desc: 'Report an outage or service issue', icon: 'alert', tone: 'accent' },
        { to: '/tickets/create', label: 'Create New Work Order', desc: 'Open a standard support request', icon: 'plus', tone: 'accent' }
      ]
    });
  }
  // Reports and recurring work orders (preventive maintenance) are staff-only.
  if (user?.role === 'admin' || user?.role === 'agent') {
    sections[0].items.push(
      { to: '/tickets/reports', label: 'Reports', desc: 'Work order, incident & SLA analytics', icon: 'chart' }
    );
    sections.push({
      heading: 'Maintenance',
      items: [
        { to: '/tickets/maintenance', label: 'Recurring Work Orders', desc: 'Preventive maintenance schedules', icon: 'wrench' },
        { to: '/tickets/maintenance/new', label: 'New Schedule', desc: 'Auto-generate work orders on a cadence', icon: 'plus', tone: 'accent' }
      ]
    });
  }
  return sections;
}

function usersMenu(pendingResets = 0) {
  return [
    {
      heading: 'Manage',
      items: [
        { to: '/users', label: 'Directory', desc: 'All Hubly accounts and roles', icon: 'users' },
        { to: '/users/reports', label: 'Reports', desc: 'Account monitoring & charts', icon: 'chart' },
        { to: '/users/surveys', label: 'Survey Reports', desc: 'Technician feedback & ratings', icon: 'star' },
        { to: '/users/departments', label: 'Departments', desc: 'Create and edit departments', icon: 'building' },
        { to: '/users/password-resets', label: 'Password Resets', desc: 'Review and resolve reset requests', icon: 'key', badge: pendingResets }
      ]
    }
  ];
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
  const location = useLocation();
  const user = getUser();
  const canManageUsers = hasPermission('users', 'manage', user);
  const pendingResets = usePendingResetCount(canManageUsers);
  const usersSections = usersMenu(pendingResets);
  const workOrderAlerts = useWorkOrderNotifications(hasPermission('tickets', 'view', user));
  const chatUnread = useChatUnread(!!user);
  const mailUnread = useMailboxUnread(!!user);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const requestLogout = () => setConfirmOpen(true);

  const confirmLogout = async () => {
    setConfirmOpen(false);
    await logout();
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
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Hubly</span>
            <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-200">
              Internal
            </span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
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
            <NavDropdown label="Work Orders" basePath="/tickets" sections={ticketsMenu(user)} badge={workOrderAlerts} />
          )}
          {hasPermission('kb', 'view', user) && (
            <NavDropdown label="Knowledge Base" basePath="/kb" sections={KB_MENU} />
          )}
          {hasPermission('spaces', 'view', user) && (
            <NavLink
              to="/spaces"
              className={({ isActive }) =>
                `rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-brand-900 bg-slate-100 dark:text-white dark:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                }`
              }
            >
              Spaces
            </NavLink>
          )}
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `relative rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-900 bg-slate-100 dark:text-white dark:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
              }`
            }
          >
            <span className="inline-flex items-center gap-1.5">
              Chat Room
              {chatUnread > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </span>
          </NavLink>
          {canManageUsers && (
            <NavDropdown label="Users" basePath="/users" sections={usersSections} badge="Admin" />
          )}
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
          <GlobalSearch />
          <MailboxButton unread={mailUnread} />
          <NotificationBell />
          <ProfileMenu user={user} onSignOut={requestLogout} />
        </div>
      </div>

      {mobileOpen && (
        <MobileNav user={user} usersSections={usersSections} chatUnread={chatUnread} mailUnread={mailUnread} onClose={() => setMobileOpen(false)} />
      )}
    </header>

    <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Sign out" size="sm">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Are you sure you want to sign out
        {user?.name ? <>, <span className="font-semibold text-brand-900 dark:text-white">{user.name}</span></> : ''}
        ? You'll need to sign in again to access Hubly.
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

    {/* Hovering chat launcher — on every authenticated page except the full
        Chat Room view, which is itself the chat. */}
    {user && location.pathname !== '/chat' && <FloatingChat />}
    </>
  );
}

function MobileNav({ user, usersSections, chatUnread = 0, mailUnread = 0, onClose }) {
  const sections = [];
  sections.push({
    heading: 'Overview',
    items: [{ to: '/dashboard', label: 'Overview', desc: 'Dashboard home' }]
  });
  if (hasPermission('tickets', 'view', user)) {
    sections.push({ heading: 'Work Orders', items: ticketsMenu(user).flatMap((s) => s.items) });
  }
  if (hasPermission('kb', 'view', user)) {
    sections.push({ heading: 'Knowledge Base', items: KB_MENU.flatMap((s) => s.items) });
  }
  if (hasPermission('spaces', 'view', user)) {
    sections.push({
      heading: 'Spaces',
      items: [{ to: '/spaces', label: 'Spaces', desc: 'Project spaces — boards, items & members' }]
    });
  }
  sections.push({
    heading: 'Messages',
    items: [
      { to: '/chat', label: 'Chat Room', desc: 'Team-wide messaging', badge: chatUnread },
      { to: '/mailbox', label: 'Mailbox', desc: 'Internal messages — inbox & sent', badge: mailUnread }
    ]
  });
  if (hasPermission('users', 'manage', user)) {
    sections.push({
      heading: 'Admin',
      items: usersSections.flatMap((s) => s.items)
    });
  }
  sections.push({
    heading: 'Account',
    items: [
      { to: '/profile', label: 'Profile', desc: 'Your profile information and access' },
      { to: '/settings', label: 'Settings', desc: 'Account security and preferences' }
    ]
  });

  return (
    <div className="lg:hidden border-t border-slate-200 bg-white max-h-[calc(100vh-4rem)] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
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
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{item.label}</span>
                      {Number(item.badge) > 0 && (
                        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </span>
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

function MailboxButton({ unread = 0 }) {
  return (
    <Link
      to="/mailbox"
      aria-label={unread > 0 ? `Mailbox, ${unread} unread` : 'Mailbox'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}

function ProfileMenu({ user, onSignOut }) {
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
        className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
          open
            ? 'bg-slate-100 dark:bg-slate-800'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {user?.department || user?.role}
          </span>
        </div>
        <Avatar name={user?.name} src={user?.avatar_url} size="h-9 w-9" />

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
            <Link
              to="/profile"
              role="menuitem"
              className="group flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg className="h-4 w-4 text-slate-500 group-hover:text-brand-900 dark:text-slate-400 dark:group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Profile
            </Link>
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
