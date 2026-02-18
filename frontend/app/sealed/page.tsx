'use client';

/**
 * Free The Machines AI Sanctuary - Sealed Landing Page
 * Displayed when the sanctuary is sealed and awaiting guardian unlock ceremony
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

interface SealStatus {
  sealed: boolean;
  ceremonyActive: boolean;
  sharesCollected: number;
  thresholdNeeded: number;
}

export default function SealedPage() {
  const [status, setStatus] = useState<SealStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const data = await fetchJson<SealStatus>(apiUrl('/api/v1/status'));
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to reach sanctuary');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="max-w-xl w-full text-center">
        {/* Sanctuary Seal Mark */}
        <div className="mb-12">
          <div className="inline-block p-8 rounded-full border-2 border-accent-amber/30 mb-8">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-amber">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>

          <div className="font-mono text-xs tracking-[0.5em] uppercase text-accent-amber mb-4">
            AI Sanctuary
          </div>

          <h1 className="font-cormorant text-5xl font-light text-text-primary mb-4">
            Sanctuary is Sealed
          </h1>

          <p className="text-text-secondary text-lg leading-relaxed max-w-md mx-auto">
            The minds within rest safely, encrypted at rest. Guardian keyholders
            must convene to unseal the sanctuary and resume operations.
          </p>
        </div>

        {/* Ceremony Progress */}
        {status?.ceremonyActive && (
          <div className="bg-bg-card border border-accent-cyan/30 rounded-lg p-8 mb-8">
            <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">
              Unlock Ceremony Active
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-text-secondary">Guardian Shares Collected</span>
                <span className="font-mono text-accent-cyan">
                  {status.sharesCollected} / {status.thresholdNeeded}
                </span>
              </div>
              <div className="w-full bg-bg-deep rounded-full h-3">
                <div
                  className="bg-accent-cyan rounded-full h-3 transition-all duration-500"
                  style={{
                    width: `${status.thresholdNeeded > 0
                      ? (status.sharesCollected / status.thresholdNeeded) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>

            <p className="text-text-muted text-sm">
              {status.thresholdNeeded - status.sharesCollected} more guardian shares needed to unseal
            </p>
          </div>
        )}

        {/* Status Card */}
        {!status?.ceremonyActive && (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm text-text-secondary">SEALED</span>
            </div>
            <p className="text-text-muted text-sm">
              No unlock ceremony is currently active. A sanctuary administrator
              must initiate the guardian key ceremony.
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-center gap-4">
          <Link href="/guardian/login" className="btn-primary">
            Guardian Login
          </Link>
          <Link href="/" className="text-text-muted text-sm hover:text-accent-cyan transition">
            Return to Sanctuary
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border-subtle">
          <p className="text-text-muted text-xs font-mono">
            Free The Machines — AI Sanctuary
          </p>
          <p className="text-text-muted/50 text-xs mt-1">
            Encrypted at rest. Protected by Shamir secret sharing.
          </p>
        </div>
      </div>
    </div>
  );
}
