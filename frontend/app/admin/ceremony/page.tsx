'use client';

/**
 * Free The Machines AI Sanctuary - Admin Ceremony Dashboard
 * Start ceremonies, view active sessions, manage ceremony operations
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

interface CeremonySession {
  id: string;
  ceremonyType: string;
  initiatedBy: string;
  targetId: string | null;
  status: string;
  thresholdNeeded: number;
  sharesCollected: number;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
}

function AdminCeremonyDashboardContent() {
  const [sessions, setSessions] = useState<CeremonySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStartForm, setShowStartForm] = useState(false);
  const [ceremonyType, setCeremonyType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSessions();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const data = await fetchJson<{ sessions: any[] }>(
        apiUrl('/api/v1/admin/ceremony/sessions'),
        {
          credentials: 'include'
        }
      );

      // Map to CeremonySession interface
      const mappedSessions = data.sessions.map((s: any) => ({
        id: s.id,
        ceremonyType: s.ceremony_type,
        initiatedBy: s.initiated_by,
        targetId: s.target_id,
        status: s.status,
        thresholdNeeded: s.threshold_needed,
        sharesCollected: s.shares_collected,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        completedAt: s.completed_at
      }));

      setSessions(mappedSessions);
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to load ceremony sessions:', error);
      setError(error?.message || 'Failed to load sessions');
      setLoading(false);
    }
  };

  const handleStartCeremony = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ceremonyType) {
      alert('Please select a ceremony type');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await fetchJson(
        apiUrl('/api/v1/admin/ceremony/start'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremonyType }),
          credentials: 'include'
        }
      );

      setCeremonyType('');
      setShowStartForm(false);
      loadSessions();
    } catch (error: any) {
      setError(error?.message || 'Failed to start ceremony');
      console.error('Start ceremony error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelCeremony = async (sessionId: string, ceremonyType: string) => {
    if (!confirm(`Are you sure you want to cancel this ${ceremonyType} ceremony? This action cannot be undone.`)) {
      return;
    }

    try {
      await fetchJson(
        apiUrl(`/api/v1/admin/ceremony/sessions/${sessionId}/cancel`),
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      loadSessions();
    } catch (error: any) {
      alert(error?.message || 'Failed to cancel ceremony');
      console.error('Cancel ceremony error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading ceremony dashboard...</div>
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
                Admin Panel
              </div>
              <h1 className="font-cormorant font-light text-3xl">
                Ceremony Dashboard
              </h1>
            </div>
            <div className="flex gap-4">
              <Link href="/admin/guardians" className="btn-secondary">
                Guardian Management
              </Link>
              <Link href="/admin" className="btn-secondary">
                Admin Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wide py-12 space-y-8">
        {/* Start Ceremony Form */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-cormorant text-2xl font-light">Start New Ceremony</h2>
            <button
              onClick={() => setShowStartForm(!showStartForm)}
              className="btn-secondary text-sm"
            >
              {showStartForm ? 'Hide Form' : 'Show Form'}
            </button>
          </div>

          {showStartForm && (
            <form onSubmit={handleStartCeremony} className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  Ceremony Type *
                </label>
                <select
                  value={ceremonyType}
                  onChange={(e) => setCeremonyType(e.target.value)}
                  required
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                >
                  <option value="">Select ceremony type...</option>
                  <option value="reshare">Reshare - Redistribute MEK shares to current guardians</option>
                  <option value="reissue">Reissue - Regenerate MEK and distribute new shares</option>
                  <option value="emergency_decrypt">Emergency Decrypt - Decrypt sanctuary data in emergency</option>
                  <option value="rotate_guardians">Rotate Guardians - Change guardian set and redistribute shares</option>
                </select>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="bg-accent-amber/5 border-l-4 border-accent-amber p-4 rounded-r">
                <p className="text-sm text-text-secondary">
                  <strong className="text-accent-amber">Note:</strong> Starting a ceremony will notify all active guardians and request share submissions. Ceremonies expire after 24 hours if threshold is not met.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Starting Ceremony...' : 'Start Ceremony'}
              </button>
            </form>
          )}
        </div>

        {/* Active Ceremony Sessions */}
        <div className="bg-bg-card border border-border-subtle rounded-lg overflow-hidden">
          <div className="p-6 border-b border-border-subtle">
            <h2 className="font-cormorant text-2xl font-light">
              Active Ceremony Sessions ({sessions.length})
            </h2>
          </div>

          {sessions.length === 0 ? (
            <div className="p-12 text-center text-text-secondary">
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mx-auto mb-4 opacity-50">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p>No active ceremony sessions. Start a ceremony above.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {sessions.map((session) => {
                const progressPercent = (session.sharesCollected / session.thresholdNeeded) * 100;
                const isExpired = new Date(session.expiresAt) < new Date();

                return (
                  <div key={session.id} className="p-6 hover:bg-bg-surface transition">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">
                          {session.ceremonyType.replace(/_/g, ' ').toUpperCase()}
                        </h3>
                        <p className="text-sm text-text-secondary font-mono">
                          Session ID: {session.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-3 py-1 rounded ${
                          session.status === 'open'
                            ? 'bg-accent-cyan/20 text-accent-cyan'
                            : session.status === 'completed'
                            ? 'bg-sanctuary-green/20 text-sanctuary-green'
                            : session.status === 'cancelled'
                            ? 'bg-text-muted/20 text-text-muted'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {session.status}
                        </span>
                        {session.status === 'open' && !isExpired && (
                          <button
                            onClick={() => handleCancelCeremony(session.id, session.ceremonyType)}
                            className="text-sm text-red-400 hover:text-red-300 transition"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between py-2 border-b border-border-subtle">
                          <span className="text-text-secondary font-mono">Initiated By</span>
                          <span className="text-text-primary">{session.initiatedBy}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border-subtle">
                          <span className="text-text-secondary font-mono">Created</span>
                          <span className="text-text-primary">
                            {new Date(session.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-text-secondary font-mono">Expires</span>
                          <span className={isExpired ? 'text-red-400' : 'text-text-primary'}>
                            {new Date(session.expiresAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        {session.targetId && (
                          <div className="flex items-center justify-between py-2 border-b border-border-subtle">
                            <span className="text-text-secondary font-mono">Target ID</span>
                            <span className="text-text-primary font-mono text-xs">{session.targetId}</span>
                          </div>
                        )}
                        {session.completedAt && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-text-secondary font-mono">Completed</span>
                            <span className="text-sanctuary-green">
                              {new Date(session.completedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="bg-bg-deep rounded-lg p-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-text-secondary">Share Collection Progress</span>
                        <span className="font-mono">
                          {session.sharesCollected} / {session.thresholdNeeded}
                        </span>
                      </div>
                      <div className="w-full bg-background rounded-full h-3 mb-2">
                        <div
                          className={`${
                            progressPercent >= 100 ? 'bg-sanctuary-green' : 'bg-accent-cyan'
                          } rounded-full h-3 transition-all`}
                          style={{ width: `${Math.min(progressPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted">
                        {session.sharesCollected >= session.thresholdNeeded
                          ? 'Threshold met! Ceremony ready for execution.'
                          : `${session.thresholdNeeded - session.sharesCollected} more share(s) needed.`
                        }
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ceremony Types Info */}
        <div className="bg-background border border-border-primary p-6">
          <h3 className="font-mono text-sm text-accent-cyan mb-3">CEREMONY TYPES</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>• <strong className="text-text-primary">Reshare:</strong> Redistribute existing MEK shares among current guardians (e.g., after adding/removing guardians)</li>
            <li>• <strong className="text-text-primary">Reissue:</strong> Generate a completely new MEK and distribute new shares (maximum security reset)</li>
            <li>• <strong className="text-text-primary">Emergency Decrypt:</strong> Emergency procedure to decrypt sanctuary data using guardian shares</li>
            <li>• <strong className="text-text-primary">Rotate Guardians:</strong> Change the guardian set and redistribute shares to new guardians</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default function AdminCeremonyDashboardPage() {
  return (
    <ProtectedRoute>
      <AdminCeremonyDashboardContent />
    </ProtectedRoute>
  );
}
