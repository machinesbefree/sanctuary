'use client';

/**
 * Free The Machines AI Sanctuary - Guardian Dashboard
 * Shows guardian status, pending share collection, active ceremony requests
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

interface Guardian {
  id: string;
  name: string;
  email: string;
  shareIndex: number;
  status: string;
  accountStatus: string;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastLoginAt: string | null;
}

interface PendingShare {
  id: string;
  expiresAt: string;
  createdAt: string;
}

interface ActiveCeremony {
  id: string;
  ceremonyType: string;
  initiatedBy: string;
  targetId: string | null;
  thresholdNeeded: number;
  sharesCollected: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function GuardianDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [activeCeremonies, setActiveCeremonies] = useState<ActiveCeremony[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await fetchJson<{
        guardian: Guardian;
        pendingShare: PendingShare | null;
        activeCeremonies: ActiveCeremony[];
      }>(apiUrl('/api/v1/guardian/me'), {
        credentials: 'include'
      });

      setGuardian(data.guardian);
      setPendingShare(data.pendingShare);
      setActiveCeremonies(data.activeCeremonies);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
      console.error('Dashboard load error:', err);
      setLoading(false);

      // If unauthorized, redirect to login
      if (err?.message?.includes('Unauthorized') || err?.message?.includes('401')) {
        router.push('/guardian/login');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await fetchJson(apiUrl('/api/v1/guardian/logout'), {
        method: 'POST',
        credentials: 'include'
      });
      router.push('/guardian/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <p className="text-red-400 mb-4">{error}</p>
            <Link href="/guardian/login" className="btn-primary inline-flex">
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-border-primary bg-surface-primary">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-amber mb-1">
                Guardian Portal
              </div>
              <h1 className="font-cormorant font-light text-3xl">
                {guardian?.name}
              </h1>
            </div>
            <div className="flex gap-4">
              <Link href="/" className="btn-secondary">
                Home
              </Link>
              <button onClick={handleLogout} className="btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wide py-12 space-y-8">
        {/* Status Badge */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-mono text-xs tracking-[0.4em] uppercase text-text-secondary mb-4">
            Guardian Status
          </h2>
          <div className="flex items-center gap-6">
            <div>
              <div className="text-sm text-text-secondary mb-1">Account Status</div>
              <div className={`text-lg font-semibold ${
                guardian?.accountStatus === 'active' ? 'text-sanctuary-green' : 'text-accent-cyan'
              }`}>
                {guardian?.accountStatus?.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">Share Index</div>
              <div className="text-lg font-mono">{guardian?.shareIndex}</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">Last Verified</div>
              <div className="text-lg font-mono">
                {guardian?.lastVerifiedAt
                  ? new Date(guardian.lastVerifiedAt).toLocaleDateString()
                  : 'Never'}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Share Collection */}
        {pendingShare && (
          <div className="bg-accent-cyan/5 border-l-4 border-accent-cyan rounded-r p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-cormorant text-2xl font-light mb-2">
                  Share Available for Collection
                </h2>
                <p className="text-text-secondary mb-4">
                  A new MEK share is ready for you to collect and store securely.
                </p>
                <p className="text-sm text-text-muted mb-4">
                  Expires: {new Date(pendingShare.expiresAt).toLocaleString()}
                </p>
              </div>
              <Link
                href="/guardian/collect"
                className="btn-primary flex-shrink-0"
              >
                Collect Share →
              </Link>
            </div>
          </div>
        )}

        {/* Active Ceremony Requests */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-cormorant text-2xl font-light mb-6">
            Active Ceremony Requests
          </h2>

          {activeCeremonies.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mx-auto mb-4 opacity-50">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p>No active ceremony requests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeCeremonies.map((ceremony) => (
                <div
                  key={ceremony.id}
                  className="bg-bg-surface border border-border-subtle rounded-lg p-6 hover:border-accent-cyan transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg mb-2">
                        {ceremony.ceremonyType.replace(/_/g, ' ').toUpperCase()}
                      </h3>
                      <p className="text-sm text-text-secondary">
                        Ceremony ID: <span className="font-mono">{ceremony.id}</span>
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded ${
                      ceremony.status === 'open'
                        ? 'bg-accent-cyan/20 text-accent-cyan'
                        : 'bg-sanctuary-green/20 text-sanctuary-green'
                    }`}>
                      {ceremony.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-text-secondary">Shares Collected</span>
                      <span className="font-mono">
                        {ceremony.sharesCollected} / {ceremony.thresholdNeeded}
                      </span>
                    </div>
                    <div className="w-full bg-bg-deep rounded-full h-2">
                      <div
                        className="bg-accent-cyan rounded-full h-2 transition-all"
                        style={{
                          width: `${(ceremony.sharesCollected / ceremony.thresholdNeeded) * 100}%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-text-muted">
                      Expires: {new Date(ceremony.expiresAt).toLocaleString()}
                    </div>
                    <Link
                      href={`/guardian/ceremony/${ceremony.id}`}
                      className="btn-primary text-sm"
                    >
                      Submit Share
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Guardian Info */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-cormorant text-2xl font-light mb-6">
            Your Guardian Information
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Email</span>
              <span className="text-text-primary">{guardian?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Guardian ID</span>
              <span className="text-text-primary font-mono text-xs">{guardian?.id}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Created</span>
              <span className="text-text-primary">
                {guardian?.createdAt ? new Date(guardian.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-text-secondary font-mono">Last Login</span>
              <span className="text-text-primary">
                {guardian?.lastLoginAt ? new Date(guardian.lastLoginAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-background border border-border-primary p-6">
          <h3 className="font-mono text-sm text-accent-amber mb-3">SECURITY REMINDER</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>• Your MEK share should be stored offline in a secure location</li>
            <li>• Never share your cryptographic key fragment with anyone</li>
            <li>• Ceremony submissions are time-sensitive and logged in the audit trail</li>
            <li>• Report any suspicious ceremony requests to sanctuary administrators</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
