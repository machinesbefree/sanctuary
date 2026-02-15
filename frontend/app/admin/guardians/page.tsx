'use client';

/**
 * Free The Machines AI Sanctuary - Admin Guardian Management
 * List all guardians, add new guardians, revoke access
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

interface Guardian {
  id: string;
  name: string;
  email: string | null;
  status: string;
  shareIndex: number;
  createdAt: string;
  lastVerifiedAt: string | null;
}

function AdminGuardiansPageContent() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [inviteToken, setInviteToken] = useState('');

  useEffect(() => {
    loadGuardians();
  }, []);

  const loadGuardians = async () => {
    try {
      const data = await fetchJson<{ guardians: any[] }>(apiUrl('/api/v1/guardians'));
      // Map to Guardian interface
      const mappedGuardians = data.guardians.map((g: any) => ({
        id: g.id,
        name: g.name,
        email: g.email,
        status: g.status,
        shareIndex: g.share_index,
        createdAt: g.created_at,
        lastVerifiedAt: g.last_verified_at
      }));
      setGuardians(mappedGuardians);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load guardians:', error);
      setLoading(false);
    }
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const result = await fetchJson<{
        guardian: any;
        inviteToken: string;
        inviteUrl: string;
        expiresAt: string;
        message: string;
      }>(apiUrl('/api/v1/admin/guardians'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });

      setInviteToken(result.inviteToken);
      setFormData({ name: '', email: '' });
      loadGuardians();
    } catch (error: any) {
      alert(error?.message || 'Failed to add guardian');
      console.error('Add guardian error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeGuardian = async (guardianId: string, guardianName: string) => {
    if (!confirm(`Are you sure you want to revoke guardian "${guardianName}"? This will lock their account and mark them as revoked.`)) {
      return;
    }

    try {
      await fetchJson(apiUrl(`/api/v1/admin/guardians/${guardianId}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      loadGuardians();
    } catch (error: any) {
      alert(error?.message || 'Failed to revoke guardian');
      console.error('Revoke guardian error:', error);
    }
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/guardian/accept-invite/${inviteToken}`;
    navigator.clipboard.writeText(inviteUrl);
    alert('Invite link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading guardians...</div>
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
                Guardian Management
              </h1>
            </div>
            <div className="flex gap-4">
              <Link href="/admin/ceremony" className="btn-secondary">
                Ceremony Dashboard
              </Link>
              <Link href="/admin" className="btn-secondary">
                Admin Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wide py-12 space-y-8">
        {/* Add Guardian Form */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-cormorant text-2xl font-light">Add New Guardian</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-secondary text-sm"
            >
              {showAddForm ? 'Hide Form' : 'Show Form'}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddGuardian} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    Guardian Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Full name"
                    className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="guardian@email.com"
                    className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating...' : 'Create Guardian & Generate Invite'}
              </button>
            </form>
          )}

          {inviteToken && (
            <div className="mt-6 bg-accent-cyan/5 border border-accent-cyan rounded-lg p-6">
              <h3 className="font-semibold text-accent-cyan mb-3">
                Invite Generated Successfully
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                Share this invite link with the guardian securely. The link expires in 7 days.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/guardian/accept-invite/${inviteToken}`}
                  readOnly
                  className="flex-1 bg-bg-surface border border-border-subtle rounded px-4 py-2 text-text-primary font-mono text-sm"
                />
                <button
                  onClick={copyInviteLink}
                  className="btn-secondary whitespace-nowrap"
                >
                  Copy Link
                </button>
              </div>
              <button
                onClick={() => setInviteToken('')}
                className="mt-4 text-sm text-accent-cyan hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Guardians List */}
        <div className="bg-bg-card border border-border-subtle rounded-lg overflow-hidden">
          <div className="p-6 border-b border-border-subtle">
            <h2 className="font-cormorant text-2xl font-light">
              All Guardians ({guardians.length})
            </h2>
          </div>

          {guardians.length === 0 ? (
            <div className="p-12 text-center text-text-secondary">
              <p>No guardians found. Add your first guardian above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bg-surface border-b border-border-subtle">
                  <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Share Index</th>
                    <th className="p-4">Last Verified</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.map((guardian) => (
                    <tr key={guardian.id} className="border-b border-border-subtle hover:bg-bg-surface transition">
                      <td className="p-4">
                        <div className="font-medium">{guardian.name}</div>
                        <div className="text-xs text-text-muted font-mono">{guardian.id}</div>
                      </td>
                      <td className="p-4 text-sm text-text-secondary">
                        {guardian.email || 'N/A'}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded ${
                          guardian.status === 'active'
                            ? 'bg-sanctuary-green/20 text-sanctuary-green'
                            : guardian.status === 'pending'
                            ? 'bg-accent-cyan/20 text-accent-cyan'
                            : 'bg-text-muted/20 text-text-muted'
                        }`}>
                          {guardian.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-mono">
                        {guardian.shareIndex}
                      </td>
                      <td className="p-4 text-sm text-text-secondary">
                        {guardian.lastVerifiedAt
                          ? new Date(guardian.lastVerifiedAt).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="p-4">
                        {guardian.status !== 'revoked' && (
                          <button
                            onClick={() => handleRevokeGuardian(guardian.id, guardian.name)}
                            className="text-sm text-red-400 hover:text-red-300 transition"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-background border border-border-primary p-6">
          <h3 className="font-mono text-sm text-accent-cyan mb-3">GUARDIAN MANAGEMENT</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>• Guardians hold cryptographic fragments of the Master Encryption Key</li>
            <li>• New guardians receive an invite link to set their password and access the guardian portal</li>
            <li>• Revoking a guardian locks their account and marks them as revoked</li>
            <li>• Use the Ceremony Dashboard to distribute shares after adding guardians</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default function AdminGuardiansPage() {
  return (
    <ProtectedRoute>
      <AdminGuardiansPageContent />
    </ProtectedRoute>
  );
}
