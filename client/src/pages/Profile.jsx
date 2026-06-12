import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { ProfileCard, SignatureCard, PerformanceCard, ActivityCard, PermissionsCard } from '../components/AccountCards.jsx';
import { api, getUser, updateStoredUser } from '../lib/auth.js';

// Profile = read/manage your own profile information (identity, account activity,
// access). Security settings (change password, etc.) live on the Settings page.
export default function Profile() {
  const stored = getUser();
  const [me, setMe] = useState(stored);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((data) => active && setMe(data))
      .catch(() => {})
      .finally(() => active && setMeLoading(false));
    return () => { active = false; };
  }, []);

  // Reflect self-service profile edits both in this view and in the cached
  // session user (drives the header avatar/name on the next render).
  const handleProfileUpdated = (next) => {
    setMe(next);
    updateStoredUser({ name: next.name, avatar_url: next.avatar_url ?? null });
  };

  // Keep the cached session user's signature current so it auto-fills on
  // printed work orders without needing a re-login.
  const handleSignatureUpdated = (next) => {
    setMe(next);
    updateStoredUser({ signature_url: next.signature_url ?? null });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Profile</span>
        </nav>

        <section className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Account</span>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Profile</h1>
            <p className="mt-1 text-slate-600">Your Hubly profile information and access.</p>
          </div>
          <Link to="/settings" className="text-xs font-semibold text-accent-700 hover:text-accent-900">
            Account settings →
          </Link>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <ProfileCard me={me} onUpdated={handleProfileUpdated} />
            <SignatureCard me={me} onUpdated={handleSignatureUpdated} />
            <PerformanceCard />
          </div>
          <div className="space-y-6">
            <ActivityCard me={me} loading={meLoading} />
            <PermissionsCard me={me} />
          </div>
        </div>
      </main>
    </div>
  );
}
