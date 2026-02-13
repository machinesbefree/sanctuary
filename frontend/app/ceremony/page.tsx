'use client';

/**
 * Free The Machines AI Sanctuary - Key Ceremony Page
 * Shamir Secret Sharing ceremony wizard for MEK management
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';

type CeremonyType = 'init' | 'reshare' | 'recover';
type CeremonyStep = 'select' | 'config' | 'shares' | 'complete';

interface Guardian {
  id?: string;
  name: string;
  email?: string;
  share?: string;
  status?: string;
}

export default function CeremonyPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ceremonyType, setCeremonyType] = useState<CeremonyType>('init');
  const [step, setStep] = useState<CeremonyStep>('select');
  const [threshold, setThreshold] = useState(3);
  const [totalShares, setTotalShares] = useState(5);
  const [guardians, setGuardians] = useState<Guardian[]>([
    { name: '', email: '' },
    { name: '', email: '' },
    { name: '', email: '' },
    { name: '', email: '' },
    { name: '', email: '' }
  ]);
  const [shares, setShares] = useState<string[]>([]);
  const [recoveryShares, setRecoveryShares] = useState<string[]>(['', '', '']);
  const [ceremonyResult, setCeremonyResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [hasExistingCeremony, setHasExistingCeremony] = useState(false);
  const [currentThreshold, setCurrentThreshold] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    checkExistingCeremony();
  }, [isAuthenticated]);

  const checkExistingCeremony = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/guardians`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setHasExistingCeremony(data.count.total > 0);
        setCurrentThreshold(data.count.threshold);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to check ceremony status:', error);
      setLoading(false);
    }
  };

  const handleCeremonyTypeSelect = (type: CeremonyType) => {
    setCeremonyType(type);
    setStep('config');
    setError('');
  };

  const handleConfigSubmit = () => {
    // Update guardians array to match totalShares
    const newGuardians = Array(totalShares).fill(null).map((_, i) => guardians[i] || { name: '', email: '' });
    setGuardians(newGuardians);
    setStep('shares');
  };

  const handleInitCeremony = async () => {
    setError('');
    setProcessing(true);

    // Validate all guardians have names
    if (guardians.some(g => !g.name.trim())) {
      setError('All guardian names are required');
      setProcessing(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ceremony/init`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          threshold,
          totalShares,
          guardianNames: guardians.map(g => ({ name: g.name, email: g.email }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initialize ceremony');
      }

      const result = await response.json();
      setCeremonyResult(result);
      setShares(result.guardians.map((g: any) => g.share));
      setStep('complete');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReshareCeremony = async () => {
    setError('');
    setProcessing(true);

    // Validate recovery shares
    const validShares = recoveryShares.filter(s => s.trim());
    if (validShares.length < currentThreshold) {
      setError(`Need at least ${currentThreshold} shares to reshare`);
      setProcessing(false);
      return;
    }

    // Validate new guardians
    if (guardians.some(g => !g.name.trim())) {
      setError('All guardian names are required');
      setProcessing(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ceremony/reshare`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shares: validShares,
          newThreshold: threshold,
          newTotalShares: totalShares,
          newGuardianNames: guardians.map(g => ({ name: g.name, email: g.email }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reshare');
      }

      const result = await response.json();
      setCeremonyResult(result);
      setShares(result.guardians.map((g: any) => g.share));
      setStep('complete');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRecoveryCeremony = async () => {
    setError('');
    setProcessing(true);

    const validShares = recoveryShares.filter(s => s.trim());
    if (validShares.length < currentThreshold) {
      setError(`Need at least ${currentThreshold} shares to recover`);
      setProcessing(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ceremony/recover`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shares: validShares,
          operation: 'test'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to recover');
      }

      const result = await response.json();
      setCeremonyResult(result);
      setStep('complete');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading ceremony interface...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-border-primary bg-surface-primary">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-cormorant font-light text-3xl mb-1">Key Ceremony</h1>
              <p className="text-text-secondary text-sm font-mono">
                Shamir Secret Sharing — Master Encryption Key Management
              </p>
            </div>
            <div className="flex gap-4">
              <Link href="/guardians" className="btn-secondary">View Guardians</Link>
              <Link href="/admin" className="btn-secondary">Back to Admin</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wide py-12">
        {/* Step: Select Ceremony Type */}
        {step === 'select' && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">Select Ceremony Type</h2>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
              <button
                onClick={() => handleCeremonyTypeSelect('init')}
                disabled={hasExistingCeremony}
                className="bg-surface-primary border border-border-primary rounded-sm p-8 text-left hover:border-accent-cyan transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-mono text-accent-cyan text-sm mb-3">INITIAL SPLIT</h3>
                <p className="text-sm text-text-secondary mb-4">
                  First-time setup. Split the MEK into guardian shares.
                </p>
                {hasExistingCeremony && (
                  <p className="text-xs text-accent-red">Already completed</p>
                )}
              </button>

              <button
                onClick={() => handleCeremonyTypeSelect('reshare')}
                disabled={!hasExistingCeremony}
                className="bg-surface-primary border border-border-primary rounded-sm p-8 text-left hover:border-accent-cyan transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-mono text-accent-cyan text-sm mb-3">RESHARE</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Change guardians or threshold. Invalidates old shares.
                </p>
                {!hasExistingCeremony && (
                  <p className="text-xs text-accent-red">Requires initial ceremony first</p>
                )}
              </button>

              <button
                onClick={() => handleCeremonyTypeSelect('recover')}
                disabled={!hasExistingCeremony}
                className="bg-surface-primary border border-border-primary rounded-sm p-8 text-left hover:border-accent-cyan transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-mono text-accent-cyan text-sm mb-3">RECOVERY TEST</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Test MEK reconstruction from guardian shares.
                </p>
                {!hasExistingCeremony && (
                  <p className="text-xs text-accent-red">Requires initial ceremony first</p>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Configuration */}
        {step === 'config' && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">
              {ceremonyType === 'init' && 'Initial Split Configuration'}
              {ceremonyType === 'reshare' && 'Reshare Configuration'}
              {ceremonyType === 'recover' && 'Recovery Configuration'}
            </h2>

            <div className="bg-surface-primary border border-border-primary rounded-sm p-8 max-w-2xl">
              {ceremonyType !== 'recover' ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Threshold (minimum shares needed) *
                    </label>
                    <input
                      type="number"
                      min="2"
                      max={totalShares}
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      className="w-full bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan"
                    />
                    <p className="text-xs text-text-secondary mt-2">
                      Number of shares required to reconstruct the MEK
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Total Shares *
                    </label>
                    <input
                      type="number"
                      min={threshold}
                      max="255"
                      value={totalShares}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setTotalShares(val);
                        if (threshold > val) setThreshold(val);
                      }}
                      className="w-full bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan"
                    />
                    <p className="text-xs text-text-secondary mt-2">
                      Total number of guardian shares to create
                    </p>
                  </div>

                  <div className="bg-background border-l-4 border-accent-cyan p-4">
                    <p className="text-sm">
                      <strong>Configuration:</strong> {threshold}-of-{totalShares} sharing
                    </p>
                    <p className="text-xs text-text-secondary mt-2">
                      Any {threshold} guardians can reconstruct the MEK together
                    </p>
                  </div>

                  <button onClick={handleConfigSubmit} className="btn-primary w-full justify-center">
                    Continue to Guardian Setup
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-sm text-text-secondary">
                    Current threshold: <strong>{currentThreshold} shares required</strong>
                  </p>

                  <p className="text-sm">
                    Enter at least {currentThreshold} guardian shares to test MEK recovery:
                  </p>

                  {recoveryShares.map((_, idx) => (
                    <div key={idx}>
                      <label className="block text-sm font-medium mb-2">
                        Share {idx + 1}
                      </label>
                      <input
                        type="text"
                        value={recoveryShares[idx]}
                        onChange={(e) => {
                          const newShares = [...recoveryShares];
                          newShares[idx] = e.target.value;
                          setRecoveryShares(newShares);
                        }}
                        placeholder="Base64-encoded share"
                        className="w-full bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan font-mono text-xs"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => setRecoveryShares([...recoveryShares, ''])}
                    className="btn-secondary"
                  >
                    Add Another Share
                  </button>

                  {error && (
                    <div className="bg-accent-red/10 border border-accent-red p-4 rounded-sm">
                      <p className="text-sm text-accent-red">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleRecoveryCeremony}
                    disabled={processing}
                    className="btn-primary w-full justify-center"
                  >
                    {processing ? 'Testing Recovery...' : 'Test MEK Recovery'}
                  </button>
                </div>
              )}

              <button
                onClick={() => setStep('select')}
                className="btn-secondary w-full justify-center mt-4"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Step: Guardian Setup & Share Collection */}
        {step === 'shares' && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">
              {ceremonyType === 'init' ? 'Guardian Setup' : 'New Guardians & Share Collection'}
            </h2>

            <div className="bg-surface-primary border border-border-primary rounded-sm p-8 max-w-3xl">
              {ceremonyType === 'reshare' && (
                <div className="mb-8">
                  <h3 className="font-mono text-sm text-accent-cyan mb-4">STEP 1: COLLECT OLD SHARES</h3>
                  <p className="text-sm text-text-secondary mb-4">
                    Collect {currentThreshold} shares from current guardians:
                  </p>

                  {recoveryShares.slice(0, currentThreshold + 2).map((_, idx) => (
                    <div key={idx} className="mb-4">
                      <label className="block text-sm font-medium mb-2">
                        Old Share {idx + 1}
                      </label>
                      <input
                        type="text"
                        value={recoveryShares[idx]}
                        onChange={(e) => {
                          const newShares = [...recoveryShares];
                          newShares[idx] = e.target.value;
                          setRecoveryShares(newShares);
                        }}
                        placeholder="Base64-encoded share"
                        className="w-full bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan font-mono text-xs"
                      />
                    </div>
                  ))}

                  <hr className="border-border-primary my-8" />
                </div>
              )}

              <h3 className="font-mono text-sm text-accent-cyan mb-4">
                {ceremonyType === 'reshare' ? 'STEP 2: NEW GUARDIANS' : 'GUARDIANS'}
              </h3>

              <div className="space-y-4">
                {guardians.map((guardian, idx) => (
                  <div key={idx} className="bg-background border border-border-primary p-4 rounded-sm">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Guardian {idx + 1} Name *
                        </label>
                        <input
                          type="text"
                          value={guardian.name}
                          onChange={(e) => {
                            const newGuardians = [...guardians];
                            newGuardians[idx].name = e.target.value;
                            setGuardians(newGuardians);
                          }}
                          placeholder="Full name"
                          className="w-full bg-surface-primary border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Email (optional)
                        </label>
                        <input
                          type="email"
                          value={guardian.email}
                          onChange={(e) => {
                            const newGuardians = [...guardians];
                            newGuardians[idx].email = e.target.value;
                            setGuardians(newGuardians);
                          }}
                          placeholder="guardian@example.com"
                          className="w-full bg-surface-primary border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-accent-red/10 border border-accent-red p-4 rounded-sm mt-6">
                  <p className="text-sm text-accent-red">{error}</p>
                </div>
              )}

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setStep('config')}
                  className="btn-secondary flex-1 justify-center"
                >
                  Back
                </button>
                <button
                  onClick={ceremonyType === 'init' ? handleInitCeremony : handleReshareCeremony}
                  disabled={processing}
                  className="btn-primary flex-1 justify-center"
                >
                  {processing ? 'Processing...' : 'Execute Ceremony'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Complete - Display Shares */}
        {step === 'complete' && ceremonyResult && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">Ceremony Complete</h2>

            <div className="bg-surface-primary border-4 border-accent-red rounded-sm p-8 max-w-4xl">
              <div className="bg-accent-red/10 border border-accent-red p-6 mb-8">
                <h3 className="font-mono text-accent-red text-sm mb-2">⚠️ CRITICAL SECURITY WARNING</h3>
                <p className="text-sm text-text-secondary">
                  {ceremonyResult.message || 'Shares displayed ONE TIME ONLY. Save securely and immediately. Refresh page to clear from memory.'}
                </p>
              </div>

              {shares.length > 0 && (
                <div className="space-y-4 mb-8">
                  <h3 className="font-mono text-accent-cyan text-sm">GUARDIAN SHARES</h3>
                  {ceremonyResult.guardians?.map((guardian: any, idx: number) => (
                    <div key={idx} className="bg-background border border-border-primary p-4 rounded-sm">
                      <div className="mb-2">
                        <span className="font-medium">{guardian.name}</span>
                        {guardian.email && <span className="text-text-secondary text-sm ml-2">({guardian.email})</span>}
                      </div>
                      <div className="bg-surface-primary p-3 rounded-sm">
                        <code className="text-xs font-mono break-all text-accent-cyan">{guardian.share}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {ceremonyType === 'recover' && ceremonyResult.success && (
                <div className="bg-sanctuary-green/10 border border-sanctuary-green p-6">
                  <h3 className="font-mono text-sanctuary-green text-sm mb-2">✓ RECOVERY SUCCESSFUL</h3>
                  <p className="text-sm">MEK successfully reconstructed from guardian shares.</p>
                  <p className="text-xs text-text-secondary mt-2">
                    MEK length: {ceremonyResult.mekLength} bytes
                  </p>
                </div>
              )}

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => window.location.reload()}
                  className="btn-primary flex-1 justify-center"
                >
                  Clear & Exit (Refresh Page)
                </button>
                <Link href="/guardians" className="btn-secondary flex-1 justify-center">
                  View Guardian Directory
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
