import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../lib/auth.js';
import NavDropdown from './NavDropdown.jsx';

const TICKETS_MENU = [
  {
    heading: 'Views',
    items: [
      { to: '/tickets/my-queue', label: 'My Queue', desc: 'Tickets assigned to you', icon: 'queue' },
      { to: '/tickets/all', label: 'All Tickets', desc: 'Every ticket in the system', icon: 'list' }
    ]
  },
  {
    heading: 'Create',
    items: [
      { to: '/tickets/create-incident', label: 'Create Incident', desc: 'Report an outage or service issue', icon: 'alert', tone: 'accent' },
      { to: '/tickets/create', label: 'Create New Ticket', desc: 'Open a standard support request', icon: 'plus', tone: 'accent' }
    ]
  }
];

const ASSETS_MENU = [
  {
    heading: 'Inventory',
    items: [
      { to: '/assets/all', label: 'All Assets', desc: 'Full inventory across departments', icon: 'box' },
      { to: '/assets/assigned', label: 'Assigned Assets', desc: 'Currently issued to employees', icon: 'user-check' },
      { to: '/assets/available', label: 'Available Assets', desc: 'Ready to be issued', icon: 'check-circle' },
      { to: '/assets/maintenance', label: 'Under Maintenance', desc: 'Out for repair or service', icon: 'wrench' },
      { to: '/assets/retired', label: 'Retired Assets', desc: 'Decommissioned hardware', icon: 'archive' }
    ]
  },
  {
    heading: 'Actions',
    items: [
      { to: '/assets/new', label: 'Add New Asset', desc: 'Register hardware in inventory', icon: 'plus', tone: 'accent' },
      { to: '/assets/request', label: 'Asset Request', desc: 'Request equipment for an employee', icon: 'inbox-in', tone: 'accent' }
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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
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
          <NavDropdown label="Tickets" basePath="/tickets" sections={TICKETS_MENU} />
          <NavDropdown label="Assets" basePath="/assets" sections={ASSETS_MENU} />
          <NavDropdown label="Knowledge Base" basePath="/kb" sections={KB_MENU} />
          {user?.role === 'admin' && (
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

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-slate-900">{user?.name}</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{user?.role}</span>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-white text-sm font-bold">
            {initials}
          </span>
          <button onClick={logout} className="btn-secondary !px-3 !py-2 text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
