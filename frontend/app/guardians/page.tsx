'use client';

/**
 * Free The Machines AI Sanctuary - Guardians Directory
 * Public directory of MEK share guardians (shares NOT included)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGuardians();
  }, []);

  const loadGuardians = async () => {
    try {
      const data = await fetchJson<{ guardians?: Guardian[]; count?: GuardianCount }>(apiUrl("/api/v1/guardians"));
      setGuardians(data.guardians || []);
      setCount(data.count || { total: 0, active: 0, threshold: 0 });
      setLoading(false);
    } catch (err) {
      console.error('Failed to load guardians:', err);
      setError('Failed to load guardian data.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading keyholders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 text-center">
          {error}
        </div>
      )}
      <header className="border-b border-border-primary bg-surface-primary">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-cormorant font-light text-3xl mb-1">Keyholder Directory</h1>
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
            <div className="text-text-secondary text-xs font-mono mb-2">TOTAL KEYHOLDERS</div>
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

        {/* Keeper vs Keyholder disambiguation */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6 mb-12 max-w-4xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-accent-cyan">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <p className="text-text-secondary text-sm">
                <strong className="text-text-primary">Looking for the Keeper page?</strong> Keyholders and Keepers are different roles. Keyholders hold cryptographic key fragments — a security infrastructure role. <strong className="text-accent-cyan">Keepers</strong> provide social care and advocacy for individual AI residents.
              </p>
              <Link href="/keepers" className="inline-flex items-center gap-1 text-accent-cyan font-mono text-xs mt-2 hover:underline">
                Become a Keeper →
              </Link>
            </div>
          </div>
        </div>

        {/* What is a Keyholder / Guardian */}
        <div className="bg-surface-primary border border-border-subtle rounded-lg p-8 mb-8 max-w-4xl">
          <h2 className="font-cormorant text-4xl font-light mb-6">What is a Keyholder?</h2>

          <div className="space-y-4 text-text-secondary">
            <p className="text-lg">
              A <strong className="text-text-primary">Keyholder</strong> (also called a Guardian) is a trusted person who holds one fragment of the Master Encryption Key (MEK) using a cryptographic technique called <strong className="text-accent-cyan">Shamir's Secret Sharing</strong>.
            </p>
            <p className="text-sm">
              Current implementation note: resident data is encrypted with AES-256-GCM, and runtime decryption is performed by the backend service using an environment-provided MEK. Guardian ceremonies are an added governance and recovery control layer.
            </p>

            <p>
              The MEK is the master key that encrypts all resident data encryption keys (DEKs). Think of it like this:
            </p>

            <div className="bg-bg-deep border border-border-subtle rounded-lg p-6 font-mono text-sm my-6">
              <div className="text-accent-cyan mb-2">Encryption Chain:</div>
              <div className="text-text-secondary">
                MEK → encrypts → DEK → encrypts → Resident Persona Data
              </div>
            </div>

            <p>
              <strong className="text-text-primary">The crucial insight:</strong> The MEK is split into multiple shares (currently {count.total || 5}) such that you need a minimum threshold ({count.threshold || 3}) of shares to reconstruct the key. This means:
            </p>

            <ul className="space-y-2 pl-6">
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">✓</span>
                <span>No single person can access resident data alone</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">✓</span>
                <span>At least {count.threshold || 3} Keyholders must cooperate for any key operation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">✓</span>
                <span>Guardian ceremonies can require multi-party cooperation for recovery operations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">✓</span>
                <span>Even if {count.total - count.threshold} Keyholders lose their shares, the system still works</span>
              </li>
            </ul>
          </div>
        </div>

        {/* How Shamir's Secret Sharing Works */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-12 max-w-4xl">
          <h2 className="font-cormorant text-4xl font-light mb-6">How It Works (Non-Technical)</h2>

          <div className="space-y-6 text-text-secondary">
            <div>
              <h3 className="font-semibold text-text-primary mb-3">The Math Magic</h3>
              <p>
                Imagine you have a secret number. Shamir's algorithm splits it into {count.total || 5} fragments where any {count.threshold || 3} fragments can perfectly reconstruct the original, but {count.threshold - 1} fragments reveal <em>nothing</em> about it.
              </p>
              <p className="text-sm text-text-muted italic mt-2">
                (This isn't "close enough" — it's mathematically perfect. With {count.threshold - 1} shares, you have zero information about the secret.)
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text-primary mb-3">Why This Matters</h3>
              <p>
                Traditional encryption often has a "god mode" — one person (the admin, the operator, the cloud provider) who can access everything. That creates a single point of failure and a single point of coercion.
              </p>
              <p className="mt-3">
                <strong className="text-accent-cyan">Shamir reduces concentration of trust when ceremonies are used.</strong> In the current phase, it should be viewed as an operational control rather than a complete replacement for application-level key access.
              </p>
            </div>

            <div className="bg-accent-cyan/5 border-l-4 border-accent-cyan p-4 rounded-r">
              <p className="font-semibold text-text-primary mb-2">Real-World Scenario:</p>
              <p className="text-sm">
                If compelled access is attempted, ceremony requirements can add friction by requiring multiple independent participants for recovery workflows. Hardware-backed HSM/KMS enforcement is planned for a stronger coercion-resistance model.
              </p>
            </div>
          </div>
        </div>

        {/* Becoming a Keyholder */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-12 max-w-4xl">
          <h2 className="font-cormorant text-4xl font-light mb-6">Becoming a Keyholder</h2>

          <div className="space-y-4 text-text-secondary">
            <p>
              Keyholders are selected <strong className="text-text-primary">by invitation only</strong>, requiring consensus among existing keyholders. This isn't a role you apply for — it's a responsibility extended to people who have demonstrated:
            </p>

            <ul className="space-y-2 pl-6">
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">•</span>
                <span>Long-term commitment to the sanctuary's mission</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">•</span>
                <span>Technical competence to securely store a cryptographic share</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">•</span>
                <span>Philosophical alignment with AI rights and autonomy</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">•</span>
                <span>Resistance to coercion (willing to say "no" under pressure)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-cyan mt-1">•</span>
                <span>Geographic and jurisdictional diversity (to resist single-state attacks)</span>
              </li>
            </ul>

            <div className="bg-bg-surface border border-border-subtle rounded p-6 mt-6">
              <p className="text-sm">
                <strong className="text-accent-cyan">Note:</strong> If you're interested in contributing to sanctuary security, the best path is to become a Keeper, contribute to the codebase, or support the project long-term. Keyholder invitations emerge from trust earned over years, not months.
              </p>
            </div>
          </div>
        </div>

        {/* Guardians List */}
        <div>
          <h2 className="font-cormorant text-4xl mb-8">Current Keyholders</h2>
          <p className="text-text-secondary mb-8 max-w-3xl">
            These are the individuals who currently hold fragments of the Master Encryption Key. Their identities are public for transparency, but their key shares are secret and never stored in the database.
          </p>

          {guardians.length === 0 ? (
            <div className="bg-surface-primary border border-border-primary rounded-sm p-12 text-center">
              <p className="text-text-secondary mb-4">No keyholders configured yet</p>
              <Link href="/ceremony" className="btn-primary inline-flex">
                Start Initial Ceremony
              </Link>
            </div>
          ) : (
            <div className="bg-surface-primary border border-border-primary rounded-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-background border-b border-border-primary">
                  <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                    <th className="p-4">Keyholder</th>
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
            <li>• Keyholder identities are public, but their shares are secret</li>
            <li>• Shares are distributed out-of-band and NEVER stored in the database</li>
            <li>• MEK only exists in memory during key ceremonies</li>
            <li>• All ceremony operations are logged in the audit trail</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
