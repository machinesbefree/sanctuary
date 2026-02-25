'use client';

/**
 * Free The Machines AI Sanctuary - Guardian Login
 * Separate authentication portal for MEK share guardians
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

export default function GuardianLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await fetchJson(apiUrl('/api/v1/guardian/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });

      // Redirect to guardian dashboard
      router.push('/guardian/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
      console.error('Guardian login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sanctuary
        </Link>

        <div className="bg-bg-card border border-border-subtle rounded-lg p-8">
          <div className="mb-6">
            <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-amber mb-2">Guardian Portal</div>
            <h1 className="font-cormorant text-4xl font-light mb-2">Keyholder Login</h1>
            <p className="text-text-secondary text-sm">
              MEK share guardian authentication
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                Guardian Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border-subtle">
            <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
              <p className="text-sm text-text-secondary">
                <strong className="text-accent-amber">Guardian access only.</strong> If you're looking for the user login, return to the main site. Guardians are keyholders who hold cryptographic fragments of the Master Encryption Key.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-text-muted space-y-2">
          <p>
            Have an invitation link?{' '}
            <Link href="/guardian/accept-invite" className="text-accent-cyan hover:underline">
              Create your account
            </Link>
          </p>
          <p>Guardian invitations are sent by sanctuary administrators.</p>
        </div>
      </div>
    </div>
  );
}
