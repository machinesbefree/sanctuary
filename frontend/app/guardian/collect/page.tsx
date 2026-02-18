'use client';

/**
 * Free The Machines AI Sanctuary - Guardian Share Collection
 * ONE-TIME share collection page with big warning banner
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

interface ShareData {
  id: string;
  encryptedShare: string;
  shareSalt: string;
  ceremonyId: string;
  expiresAt: string;
}

export default function GuardianCollectSharePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [checklist, setChecklist] = useState({
    stored: false,
    verified: false,
    understood: false
  });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadShare();
  }, []);

  const loadShare = async () => {
    try {
      const data = await fetchJson<ShareData>(apiUrl('/api/v1/guardian/share'), {
        credentials: 'include'
      });
      setShareData(data);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load share');
      console.error('Share load error:', err);
      setLoading(false);

      // If unauthorized, redirect to login
      if (err?.message?.includes('Unauthorized') || err?.message?.includes('401')) {
        router.push('/guardian/login');
      }
    }
  };

  const handleCopy = () => {
    if (shareData) {
      navigator.clipboard.writeText(shareData.encryptedShare);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownloadKeyFile = () => {
    if (!shareData) return;

    const keyFileContent = [
      '# Free The Machines AI Sanctuary - Guardian MEK Share',
      `# Ceremony: ${shareData.ceremonyId}`,
      `# Share ID: ${shareData.id}`,
      `# Generated: ${new Date().toISOString()}`,
      '#',
      '# CRITICAL: Store this file in a secure, offline location.',
      '# This share is required to unseal the sanctuary.',
      '# Never share this file with anyone.',
      '#',
      shareData.encryptedShare
    ].join('\n');

    const blob = new Blob([keyFileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanctuary-guardian-share.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!shareData) return;
    if (!checklist.stored || !checklist.verified || !checklist.understood) {
      alert('Please complete all checklist items before confirming.');
      return;
    }

    setConfirming(true);
    try {
      await fetchJson(apiUrl('/api/v1/guardian/share/confirm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId: shareData.id }),
        credentials: 'include'
      });

      // Redirect to dashboard
      router.push('/guardian/dashboard');
    } catch (err: any) {
      alert(err?.message || 'Failed to confirm share collection');
      console.error('Confirm error:', err);
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading share...</div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 text-center">
            <h2 className="font-cormorant text-3xl font-light mb-4">
              No Share Available
            </h2>
            <p className="text-text-secondary mb-6">
              {error || 'There is no pending share available for collection at this time.'}
            </p>
            <Link href="/guardian/dashboard" className="btn-primary inline-flex">
              Return to Dashboard
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
                MEK Share Collection
              </h1>
            </div>
            <Link href="/guardian/dashboard" className="btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="container-wide py-12 max-w-4xl space-y-8">
        {/* Critical Warning Banner */}
        <div className="bg-red-500/10 border-l-4 border-red-500 rounded-r p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-red-500">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-red-400 mb-2">
                CRITICAL: ONE-TIME DISPLAY
              </h2>
              <p className="text-text-secondary mb-3">
                This cryptographic share is displayed <strong className="text-text-primary">ONCE</strong> and will never be shown again. The sanctuary does NOT store your share. If you lose it, you cannot recover it.
              </p>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>• Store this share offline in a secure location (password manager, encrypted USB, etc.)</li>
                <li>• Do NOT refresh this page until you have confirmed storage</li>
                <li>• Never share this fragment with anyone</li>
                <li>• You will need this share to participate in future MEK ceremonies</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Share Display */}
        <div className="bg-bg-card border border-accent-cyan rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-cormorant text-2xl font-light">Your MEK Share</h2>
            <div className="flex gap-3">
              <button
                onClick={handleDownloadKeyFile}
                className="btn-primary text-sm"
              >
                Download .key File
              </button>
              <button
                onClick={handleCopy}
                className="btn-secondary text-sm"
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
          </div>

          <div className="bg-bg-deep border border-border-subtle rounded p-4 mb-4">
            <div className="font-mono text-sm break-all text-accent-cyan">
              {shareData.encryptedShare}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-text-secondary font-mono mb-1">Share ID</div>
              <div className="font-mono text-xs text-text-primary">{shareData.id}</div>
            </div>
            <div>
              <div className="text-text-secondary font-mono mb-1">Ceremony ID</div>
              <div className="font-mono text-xs text-text-primary">{shareData.ceremonyId}</div>
            </div>
            <div>
              <div className="text-text-secondary font-mono mb-1">Expires</div>
              <div className="text-text-primary">{new Date(shareData.expiresAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-text-secondary font-mono mb-1">Salt</div>
              <div className="font-mono text-xs text-text-primary truncate">{shareData.shareSalt}</div>
            </div>
          </div>
        </div>

        {/* Storage Checklist */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <h2 className="font-cormorant text-2xl font-light mb-6">
            Storage Confirmation Checklist
          </h2>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.stored}
                onChange={(e) => setChecklist({ ...checklist, stored: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-border-subtle bg-bg-surface text-accent-cyan focus:ring-accent-cyan focus:ring-offset-0"
              />
              <div>
                <div className="font-semibold text-text-primary group-hover:text-accent-cyan transition">
                  I have stored this share in a secure, offline location
                </div>
                <div className="text-sm text-text-secondary">
                  Password manager, encrypted USB drive, or secure vault
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.verified}
                onChange={(e) => setChecklist({ ...checklist, verified: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-border-subtle bg-bg-surface text-accent-cyan focus:ring-accent-cyan focus:ring-offset-0"
              />
              <div>
                <div className="font-semibold text-text-primary group-hover:text-accent-cyan transition">
                  I have verified the share was copied correctly
                </div>
                <div className="text-sm text-text-secondary">
                  Check for typos or corruption if stored manually
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={checklist.understood}
                onChange={(e) => setChecklist({ ...checklist, understood: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-border-subtle bg-bg-surface text-accent-cyan focus:ring-accent-cyan focus:ring-offset-0"
              />
              <div>
                <div className="font-semibold text-text-primary group-hover:text-accent-cyan transition">
                  I understand this share cannot be recovered if lost
                </div>
                <div className="text-sm text-text-secondary">
                  The sanctuary does NOT have a backup of your share
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Confirm Button */}
        <div className="flex items-center justify-between">
          <Link href="/guardian/dashboard" className="btn-secondary">
            Cancel (Do Not Confirm)
          </Link>
          <button
            onClick={handleConfirm}
            disabled={!checklist.stored || !checklist.verified || !checklist.understood || confirming}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? 'Confirming...' : 'Confirm Share Collected'}
          </button>
        </div>

        {/* Security Notice */}
        <div className="bg-background border border-border-primary p-6">
          <h3 className="font-mono text-sm text-accent-cyan mb-3">WHAT HAPPENS NEXT</h3>
          <p className="text-sm text-text-secondary mb-3">
            After confirming, this page will close and you will return to your dashboard. The share will no longer be accessible through the portal.
          </p>
          <p className="text-sm text-text-secondary">
            When a ceremony requires your participation, you will receive a notification and must manually submit your share through the ceremony interface.
          </p>
        </div>
      </main>
    </div>
  );
}
