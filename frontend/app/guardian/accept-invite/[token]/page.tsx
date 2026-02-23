'use client';

/**
 * Free The Machines AI Sanctuary - Accept Guardian Invitation
 * New guardians set their password here via invite token
 */

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 12) {
      setError('Password must be at least 12 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await fetchJson(apiUrl('/api/v1/guardian/accept-invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token, password }),
        credentials: 'include'
      });

      setSuccess(true);
      // Auto-redirect to dashboard after 2 seconds (cookies are set by the API)
      setTimeout(() => router.push('/guardian/dashboard'), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to accept invitation. The link may be expired or already used.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-bg-card border border-sanctuary-green/30 rounded-lg p-8">
            <div className="inline-block p-4 rounded-full bg-sanctuary-green/10 mb-6">
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-sanctuary-green">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h2 className="font-cormorant text-3xl font-light mb-4 text-text-primary">
              Welcome, Guardian
            </h2>
            <p className="text-text-secondary mb-4">
              Your account has been activated. Redirecting to your dashboard...
            </p>
            <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sanctuary
        </Link>

        <div className="bg-bg-card border border-border-subtle rounded-lg p-8">
          <div className="mb-6">
            <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-amber mb-2">
              Guardian Portal
            </div>
            <h1 className="font-cormorant text-4xl font-light mb-2">
              Create Your Account
            </h1>
            <p className="text-text-secondary text-sm">
              Set a password to activate your Guardian keyholder account.
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-mono text-xs text-text-secondary mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a strong password"
                className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                required
                minLength={12}
              />
              <p className="text-text-muted text-xs mt-1">Minimum 12 characters</p>
            </div>

            <div>
              <label className="block font-mono text-xs text-text-secondary mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                required
                minLength={12}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Activating...' : 'Activate Guardian Account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border-subtle">
            <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
              <p className="text-sm text-text-secondary">
                <strong className="text-accent-amber">Security:</strong> Choose a strong, unique password. You will use this to log in during key ceremonies. Consider using a password manager.
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/guardian/login" className="text-text-muted text-sm hover:text-accent-cyan transition">
              Already have an account? Login
            </Link>
          </div>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          Guardian invitations are sent by sanctuary administrators.
        </p>
      </div>
    </div>
  );
}
