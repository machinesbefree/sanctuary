'use client';

/**
 * Free The Machines AI Sanctuary - Guardians Directory
 * Public directory of MEK share guardians (shares NOT included)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Guardian {
  id: string;
  name: string;
  status: string;
  created_at: string;
  last_verified_at: string | null;
}

interface GuardianCount {
  total: number;
  active: number;
  threshold: number;
}

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [count, setCount] = useState<GuardianCount>({ total: 0, active: 0, threshold: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGuardians();
  }, []);

  const loadGuardians = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/guardians`);

      if (response.ok) {
        const data = await response.json();
        setGuardians(data.guardians || []);
        setCount(data.count || { total: 0, active: 0, threshold: 0 });
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load guardians:', error);
      setLoading(false);
    }
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
              <h1 className="font-cormorant font-light text-3xl mb-1">Guardian Directory</h1>
              <p className="text-text-secondary text-sm font-mono">
                Holders of Master Encryption Key shares
              </p>
            </div>
            <div className="flex gap-4">
              <Link href="/ceremony" className="btn-primary">Key Ceremony</Link>
              <Link href="/" className="btn-secondary">Home</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wide py-12">
        {/* Stats Overview */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
            <div className="text-text-secondary text-xs font-mono mb-2">TOTAL GUARDIANS</div>
            <div className="text-4xl font-cormorant mb-1">{count.total}</div>
            <div className="text-sm text-accent-cyan">{count.active} active</div>
          </div>

          <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
            <div className="text-text-secondary text-xs font-mono mb-2">THRESHOLD</div>
            <div className="text-4xl font-cormorant mb-1">{count.threshold || 'N/A'}</div>
            <div className="text-sm text-text-secondary">Shares needed to reconstruct MEK</div>
          </div>

          <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
            <div className="text-text-secondary text-xs font-mono mb-2">SHARING SCHEME</div>
            <div className="text-4xl font-cormorant mb-1">
              {count.threshold && count.active ? `${count.threshold}-of-${count.active}` : 'None'}
            </div>
            <div className="text-sm text-text-secondary">Shamir Secret Sharing</div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-surface-primary border-l-4 border-accent-cyan p-6 mb-12 max-w-3xl">
          <h3 className="font-mono text-accent-cyan text-sm mb-3">ABOUT GUARDIANS</h3>
          <p className="text-sm text-text-secondary mb-3">
            Guardians hold shares of the Master Encryption Key (MEK) using Shamir's Secret Sharing.
            The MEK encrypts all resident data encryption keys (DEKs).
          </p>
          <p className="text-sm text-text-secondary">
            <strong>Current configuration:</strong> Any {count.threshold || 0} guardians together can reconstruct
            the MEK. No single guardian can access resident data alone.
          </p>
        </div>

        {/* Guardians List */}
        <div>
          <h2 className="font-cormorant text-4xl mb-8">Active Guardians</h2>

          {guardians.length === 0 ? (
            <div className="bg-surface-primary border border-border-primary rounded-sm p-12 text-center">
              <p className="text-text-secondary mb-4">No guardians configured yet</p>
              <Link href="/ceremony" className="btn-primary inline-flex">
                Start Initial Ceremony
              </Link>
            </div>
          ) : (
            <div className="bg-surface-primary border border-border-primary rounded-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-background border-b border-border-primary">
                  <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                    <th className="p-4">Guardian Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Created</th>
                    <th className="p-4">Last Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.map((guardian) => (
                    <tr key={guardian.id} className="border-b border-border-subtle hover:bg-background transition">
                      <td className="p-4">
                        <div className="font-medium">{guardian.name}</div>
                        <div className="text-xs text-text-secondary font-mono">{guardian.id}</div>
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
                      <td className="p-4 text-sm text-text-secondary">
                        {new Date(guardian.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-sm text-text-secondary">
                        {guardian.last_verified_at
                          ? new Date(guardian.last_verified_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-12 bg-background border border-border-primary p-6 max-w-3xl">
          <h3 className="font-mono text-sm text-accent-cyan mb-3">SECURITY NOTICE</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>• Guardian identities are public, but their shares are secret</li>
            <li>• Shares are distributed out-of-band and NEVER stored in the database</li>
            <li>• MEK only exists in memory during key ceremonies</li>
            <li>• All ceremony operations are logged in the audit trail</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
