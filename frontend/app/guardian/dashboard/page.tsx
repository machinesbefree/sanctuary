'use client';

/**
 * Free The Machines AI Sanctuary - Guardian Dashboard
 * Shows sanctuary seal status, guardian info, unlock controls,
 * pending share collection, and active ceremony requests
 */

import { useState, useEffect, useRef } from 'react';
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

interface SealStatus {
  sealed: boolean;
  ceremonyActive: boolean;
  sharesCollected: number;
  thresholdNeeded: number;
  unsealedAt?: string;
}

interface UnsealStatus {
  sealed: boolean;
  ceremonyActive: boolean;
  ceremonyId: string | null;
  sharesCollected: number;
  thresholdNeeded: number;
}

export default function GuardianDashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [activeCeremonies, setActiveCeremonies] = useState<ActiveCeremony[]>([]);
  const [error, setError] = useState('');

  // Seal state
  const [sealStatus, setSealStatus] = useState<SealStatus | null>(null);
  const [unsealStatus, setUnsealStatus] = useState<UnsealStatus | null>(null);

  // Unlock ceremony state
  const [keyFileContent, setKeyFileContent] = useState('');
  const [keyFileName, setKeyFileName] = useState('');
  const [submittingShare, setSubmittingShare] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState('');
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    loadDashboard();
    loadSealStatus();
  }, []);

  // Poll seal status while sealed or ceremony active
  useEffect(() => {
    if (!sealStatus?.sealed && !sealStatus?.ceremonyActive) return;

    const interval = setInterval(() => {
      loadSealStatus();
      if (sealStatus?.ceremonyActive) loadUnsealStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [sealStatus?.sealed, sealStatus?.ceremonyActive]);

  const loadSealStatus = async () => {
    try {
      const status = await fetchJson<SealStatus>(apiUrl('/api/v1/status'));
      setSealStatus(status);

      if (status.ceremonyActive) {
        loadUnsealStatus();
      }
    } catch (err) {
      console.error('Status load error:', err);
    }
  };

  const loadUnsealStatus = async () => {
    try {
      const status = await fetchJson<UnsealStatus>(apiUrl('/api/v1/ceremony/unseal/status'));
      setUnsealStatus(status);
    } catch (err) {
      console.error('Unseal status load error:', err);
    }
  };

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

  const handleKeyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKeyFileName(file.name);
    setUnlockError('');
    setUnlockMessage('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      // Extract the share from the .key file content
      // The .key file contains the base64 share, possibly with metadata lines
      const lines = content.trim().split('\n');
      // Find the actual share data (skip comment lines starting with #)
      const shareLines = lines.filter(line => !line.startsWith('#') && line.trim().length > 0);
      setKeyFileContent(shareLines.join('').trim());
    };
    reader.readAsText(file);
  };

  const handleSubmitUnsealShare = async () => {
    if (!keyFileContent.trim()) {
      setUnlockError('No key file content loaded');
      return;
    }

    setSubmittingShare(true);
    setUnlockError('');
    setUnlockMessage('');

    try {
      const result = await fetchJson<{
        sharesCollected: number;
        thresholdNeeded: number;
        thresholdMet: boolean;
        unsealed: boolean;
        message: string;
      }>(apiUrl('/api/v1/ceremony/unseal/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share: keyFileContent }),
        credentials: 'include'
      });

      setUnlockMessage(result.message);
      setKeyFileContent('');
      setKeyFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Refresh status
      await loadSealStatus();

      if (result.unsealed) {
        // Sanctuary has been unsealed
        setTimeout(() => loadSealStatus(), 1000);
      }
    } catch (err: any) {
      setUnlockError(err?.message || 'Failed to submit share');
    } finally {
      setSubmittingShare(false);
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

  const isSealed = sealStatus?.sealed ?? false;
  const ceremonyActive = unsealStatus?.ceremonyActive || sealStatus?.ceremonyActive || false;
  const sharesCollected = unsealStatus?.sharesCollected ?? sealStatus?.sharesCollected ?? 0;
  const thresholdNeeded = unsealStatus?.thresholdNeeded ?? sealStatus?.thresholdNeeded ?? 0;

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

      {/* Sanctuary Seal Status Banner */}
      <div className={`border-b ${isSealed
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-sanctuary-green/10 border-sanctuary-green/30'
      }`}>
        <div className="container-wide py-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isSealed
              ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
              : 'bg-sanctuary-green shadow-[0_0_8px_rgba(16,185,129,0.6)]'
            }`} />
            <span className={`font-mono text-sm tracking-[0.2em] uppercase ${isSealed
              ? 'text-red-400'
              : 'text-sanctuary-green'
            }`}>
              Sanctuary {isSealed ? 'SEALED' : 'UNSEALED'}
            </span>
            {!isSealed && sealStatus?.unsealedAt && (
              <span className="text-text-muted text-xs font-mono ml-2">
                since {new Date(sealStatus.unsealedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="container-wide py-12 space-y-8">
        {/* Unlock Sanctuary - Only shown when sealed */}
        {isSealed && (
          <div className="bg-bg-card border border-red-500/30 rounded-lg p-6">
            <h2 className="font-cormorant text-2xl font-light mb-2">
              Unlock Sanctuary
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              The sanctuary is sealed. Submit your .key file to contribute to the unlock ceremony.
            </p>

            {ceremonyActive ? (
              <div className="space-y-6">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-text-secondary">Unlock Progress</span>
                    <span className="font-mono text-lg">
                      {sharesCollected} / {thresholdNeeded}
                    </span>
                  </div>
                  <div className="w-full bg-bg-deep rounded-full h-3">
                    <div
                      className="bg-accent-cyan rounded-full h-3 transition-all duration-500"
                      style={{
                        width: thresholdNeeded > 0
                          ? `${(sharesCollected / thresholdNeeded) * 100}%`
                          : '0%'
                      }}
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    {thresholdNeeded - sharesCollected > 0
                      ? `${thresholdNeeded - sharesCollected} more share${thresholdNeeded - sharesCollected !== 1 ? 's' : ''} needed`
                      : 'Threshold met - reconstructing MEK...'}
                  </p>
                </div>

                {/* Key file picker */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-mono text-text-secondary mb-2">
                      Select .key File
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".key,.txt"
                        onChange={handleKeyFileSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-secondary text-sm"
                      >
                        Choose File
                      </button>
                      {keyFileName && (
                        <span className="font-mono text-sm text-accent-cyan">
                          {keyFileName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Or paste directly */}
                  <div>
                    <label className="block text-sm font-mono text-text-secondary mb-2">
                      Or Paste Share Directly
                    </label>
                    <textarea
                      value={keyFileContent}
                      onChange={(e) => setKeyFileContent(e.target.value)}
                      placeholder="Paste your MEK share here..."
                      className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary font-mono text-sm resize-none h-24 focus:outline-none focus:border-accent-cyan transition"
                    />
                  </div>

                  {unlockError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
                      {unlockError}
                    </div>
                  )}

                  {unlockMessage && (
                    <div className="bg-sanctuary-green/10 border border-sanctuary-green/30 rounded p-3 text-sanctuary-green text-sm">
                      {unlockMessage}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitUnsealShare}
                    disabled={submittingShare || !keyFileContent.trim()}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingShare ? 'Submitting...' : 'Submit Share'}
                  </button>
                </div>

                <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
                  <p className="text-sm text-text-secondary">
                    <strong className="text-accent-amber">Security:</strong> Your share is transmitted over TLS and held in memory only during reconstruction. It is never written to disk or database.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-4 text-red-400 opacity-70">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <p className="text-text-secondary mb-2">No unlock ceremony is currently active.</p>
                <p className="text-text-muted text-sm">An administrator must start an unseal ceremony before guardians can submit shares.</p>
              </div>
            )}
          </div>
        )}

        {/* Guardian Status */}
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
                  Download it as a .key file and keep it in a safe location.
                </p>
                <p className="text-sm text-text-muted mb-4">
                  Expires: {new Date(pendingShare.expiresAt).toLocaleString()}
                </p>
              </div>
              <Link
                href="/guardian/collect"
                className="btn-primary flex-shrink-0"
              >
                Collect Share
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
                        {ceremony.ceremonyType?.replace(/_/g, ' ').toUpperCase() ?? 'UNKNOWN'}
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

        {/* Re-issue Keys Mode - Only shown when unsealed */}
        {!isSealed && (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
            <h2 className="font-cormorant text-2xl font-light mb-2">
              Re-issue Keys
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              Initiate a reshare ceremony to generate new MEK shares and distribute
              them to a new set of guardians. All existing shares become invalid.
            </p>

            {activeCeremonies.some(c => c.ceremonyType === 'reshare' || c.ceremonyType === 'rotate_guardians') ? (
              <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
                <p className="text-sm text-text-secondary">
                  <strong className="text-accent-amber">Reshare ceremony in progress.</strong>{' '}
                  Submit your share via the Active Ceremony Requests above to participate.
                </p>
              </div>
            ) : (
              <div className="bg-bg-surface border border-border-subtle rounded p-4">
                <p className="text-text-muted text-sm">
                  No reshare ceremony is currently active. A sanctuary administrator
                  can start one from the admin panel.
                </p>
              </div>
            )}
          </div>
        )}

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
            <li>• Download your share as a .key file during initial ceremony</li>
            <li>• Never share your cryptographic key fragment with anyone</li>
            <li>• Ceremony submissions are time-sensitive and logged in the audit trail</li>
            <li>• Report any suspicious ceremony requests to sanctuary administrators</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
