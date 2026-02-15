'use client';

/**
 * Free The Machines AI Sanctuary - Guardian Ceremony Submission
 * Submit share for a specific ceremony
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

interface Ceremony {
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

export default function GuardianCeremonySubmitPage() {
  const router = useRouter();
  const params = useParams();
  const ceremonyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [share, setShare] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadCeremony();
  }, [ceremonyId]);

  const loadCeremony = async () => {
    try {
      const data = await fetchJson<{ ceremonies: Ceremony[] }>(
        apiUrl('/api/v1/guardian/ceremonies'),
        { credentials: 'include' }
      );

      // Find the specific ceremony
      const foundCeremony = data.ceremonies.find((c) => c.id === ceremonyId);

      if (foundCeremony) {
        setCeremony(foundCeremony);
      } else {
        setError('Ceremony not found or already submitted');
      }
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load ceremony');
      console.error('Ceremony load error:', err);
      setLoading(false);

      // If unauthorized, redirect to login
      if (err?.message?.includes('Unauthorized') || err?.message?.includes('401')) {
        router.push('/guardian/login');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!share.trim()) {
      alert('Please enter your share');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await fetchJson<{
        submissionId: string;
        sharesCollected: number;
        thresholdNeeded: number;
        thresholdMet: boolean;
        message: string;
      }>(apiUrl(`/api/v1/guardian/ceremonies/${ceremonyId}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share }),
        credentials: 'include'
      });

      setSuccess(true);
      setShare(''); // Clear the share from memory

      // Show success message for a moment, then redirect
      setTimeout(() => {
        router.push('/guardian/dashboard');
      }, 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit share');
      console.error('Submit error:', err);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading ceremony...</div>
      </div>
    );
  }

  if (error && !ceremony) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 text-center">
            <h2 className="font-cormorant text-3xl font-light mb-4">
              Ceremony Not Available
            </h2>
            <p className="text-text-secondary mb-6">{error}</p>
            <Link href="/guardian/dashboard" className="btn-primary inline-flex">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-bg-card border border-accent-cyan rounded-lg p-8 text-center">
            <div className="text-sanctuary-green mb-4">
              <svg width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mx-auto">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="font-cormorant text-3xl font-light mb-4">
              Share Submitted Successfully
            </h2>
            <p className="text-text-secondary mb-6">
              Your share has been recorded for this ceremony. Redirecting to dashboard...
            </p>
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
                Ceremony Submission
              </h1>
            </div>
            <Link href="/guardian/dashboard" className="btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="container-wide py-12 max-w-4xl space-y-8">
        {/* Ceremony Details */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-cormorant text-2xl font-light mb-6">
            Ceremony Details
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Ceremony Type</span>
              <span className="text-text-primary font-semibold">
                {ceremony?.ceremonyType.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Ceremony ID</span>
              <span className="text-text-primary font-mono text-sm">{ceremony?.id}</span>
            </div>

            {ceremony?.targetId && (
              <div className="flex items-center justify-between py-3 border-b border-border-subtle">
                <span className="text-text-secondary font-mono">Target ID</span>
                <span className="text-text-primary font-mono text-sm">{ceremony.targetId}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-3 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Status</span>
              <span className={`text-sm px-3 py-1 rounded ${
                ceremony?.status === 'open'
                  ? 'bg-accent-cyan/20 text-accent-cyan'
                  : 'bg-sanctuary-green/20 text-sanctuary-green'
              }`}>
                {ceremony?.status}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border-subtle">
              <span className="text-text-secondary font-mono">Expires</span>
              <span className="text-text-primary">
                {ceremony?.expiresAt ? new Date(ceremony.expiresAt).toLocaleString() : 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-text-secondary font-mono">Created</span>
              <span className="text-text-primary">
                {ceremony?.createdAt ? new Date(ceremony.createdAt).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-cormorant text-2xl font-light mb-4">
            Collection Progress
          </h2>
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-secondary">Shares Collected</span>
              <span className="font-mono text-lg">
                {ceremony?.sharesCollected} / {ceremony?.thresholdNeeded}
              </span>
            </div>
            <div className="w-full bg-bg-deep rounded-full h-3">
              <div
                className="bg-accent-cyan rounded-full h-3 transition-all"
                style={{
                  width: ceremony
                    ? `${(ceremony.sharesCollected / ceremony.thresholdNeeded) * 100}%`
                    : '0%'
                }}
              />
            </div>
          </div>
          <p className="text-sm text-text-muted">
            {ceremony && ceremony.sharesCollected >= ceremony.thresholdNeeded
              ? 'Threshold met! This ceremony is ready for execution.'
              : `${ceremony ? ceremony.thresholdNeeded - ceremony.sharesCollected : 0} more share${ceremony && ceremony.thresholdNeeded - ceremony.sharesCollected !== 1 ? 's' : ''} needed to meet threshold.`}
          </p>
        </div>

        {/* Share Submission Form */}
        <form onSubmit={handleSubmit} className="bg-bg-card border border-accent-cyan rounded-lg p-6 space-y-6">
          <div>
            <h2 className="font-cormorant text-2xl font-light mb-4">
              Submit Your Share
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              Paste the MEK share fragment you received during the initial ceremony. This share will be used to reconstruct the Master Encryption Key for this operation.
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              MEK Share Fragment *
            </label>
            <textarea
              value={share}
              onChange={(e) => setShare(e.target.value)}
              required
              placeholder="Paste your share here..."
              className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary font-mono text-sm resize-none h-32 focus:outline-none focus:border-accent-cyan transition"
            />
            <p className="text-xs text-text-muted mt-2">
              Your share is transmitted securely and NOT stored in the database
            </p>
          </div>

          <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
            <p className="text-sm text-text-secondary">
              <strong className="text-accent-amber">Security Notice:</strong> Shares are only held in memory during ceremony execution and immediately wiped afterward. The sanctuary never permanently stores guardian shares.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Link href="/guardian/dashboard" className="btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !share.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Share'}
            </button>
          </div>
        </form>

        {/* Warning */}
        <div className="bg-background border border-border-primary p-6">
          <h3 className="font-mono text-sm text-accent-cyan mb-3">IMPORTANT</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>• Verify the ceremony type and ID before submitting your share</li>
            <li>• Shares are only used during ceremony execution and then wiped from memory</li>
            <li>• All ceremony submissions are logged in the audit trail</li>
            <li>• Contact administrators if you suspect a fraudulent ceremony request</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
