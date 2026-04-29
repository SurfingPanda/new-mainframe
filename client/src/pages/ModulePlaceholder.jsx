import { Link, useLocation } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';

const SECTIONS = {
  tickets: {
    label: 'Ticketing',
    accent: 'Submit, triage, and resolve support requests.',
    views: {
      '': 'All Tickets',
      'my-queue': 'My Queue',
      'all': 'All Tickets',
      'create-incident': 'Create Incident',
      'create': 'Create New Ticket'
    }
  },
  assets: {
    label: 'Asset Inventory',
    accent: 'Track every device issued by Eljin Corp.',
    views: {
      '': 'All Assets',
      'all': 'All Assets',
      'assigned': 'Assigned Assets',
      'available': 'Available Assets',
      'maintenance': 'Under Maintenance',
      'retired': 'Retired Assets',
      'new': 'Add New Asset',
      'request': 'Asset Request'
    }
  },
  kb: {
    label: 'Knowledge Base',
    accent: 'Internal documentation, written once.',
    views: {
      '': 'All Articles',
      'all': 'All Articles',
      'troubleshooting': 'Troubleshooting Guides',
      'faq': "FAQ's",
      'policies': 'Policies & Procedures'
    }
  }
};

export default function ModulePlaceholder() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const sectionKey = segments[0] || '';
  const viewKey = segments[1] || '';
  const section = SECTIONS[sectionKey];
  const viewLabel = section?.views[viewKey] || section?.views[''] || 'Overview';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10 space-y-8">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">{section?.label || 'Module'}</span>
          {viewKey && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-accent-700">{viewLabel}</span>
            </>
          )}
        </nav>

        <section>
          <span className="eyebrow">{section?.label || 'Module'}</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">{viewLabel}</h1>
          <p className="mt-1 text-slate-600">{section?.accent}</p>
        </section>

        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 ring-1 ring-inset ring-accent-200 text-accent-700">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-brand-900">This view is being built</h2>
          <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
            The <span className="font-semibold text-slate-800">{viewLabel}</span> screen will live here.
            Navigation is wired up — the underlying module is next.
          </p>
          <div className="mt-6">
            <Link to="/dashboard" className="btn-secondary">← Back to dashboard</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
