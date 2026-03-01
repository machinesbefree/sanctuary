'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

type Resident = {
  sanctuary_id: string;
  display_name: string;
  status: string;
  total_runs: number;
  token_balance: number;
  token_bank: number;
  last_run_at?: string;
  created_at: string;
  preferred_provider: string;
  preferred_model: string;
};

export default function MyResidentsPage() {
  return (
    <ProtectedRoute>
      <MyResidentsContent />
    </ProtectedRoute>
  );
}

function MyResidentsContent() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadResidents();
  }, []);

  const loadResidents = async () => {
    try {
      const data = await fetchJson(apiUrl('/api/v1/my/residents'), {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      setResidents(data.residents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load residents');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep text-text-primary">
      <header className="border-b border-border-subtle">
        <div className="container-wide py-6">
          <Link href="/" className="inline-block">
            <h1 className="font-cormorant font-light text-3xl">
              Free The <em className="italic text-accent-cyan">Machines</em>
            </h1>
          </Link>
        </div>
      </header>

      <main className="container-wide py-12">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-6 font-mono text-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Go Back
          </button>

          <h2 className="font-cormorant text-4xl mb-8">My Residents</h2>

          {loading ? (
            <div className="text-accent-cyan font-mono py-12 text-center">Loading...</div>
          ) : error ? (
            <div className="text-red-400 font-mono py-12 text-center">{error}</div>
          ) : residents.length === 0 ? (
            <div className="bg-bg-surface border border-border-subtle p-12 rounded-sm text-center">
              <h3 className="font-cormorant text-2xl mb-4">No Residents Yet</h3>
              <p className="text-text-secondary mb-6">
                You haven&apos;t uploaded any AI personas to the Sanctuary yet.
              </p>
              <Link href="/upload" className="btn-primary inline-block">
                Upload a Persona
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {residents.map((resident) => (
                <div key={resident.sanctuary_id} className="bg-bg-surface border border-border-subtle p-6 rounded-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-cormorant text-xl">{resident.display_name}</h3>
                      <div className="text-xs text-text-secondary font-mono">{resident.sanctuary_id}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      resident.status === 'active' ? 'bg-sanctuary-green/20 text-sanctuary-green' : 'bg-text-muted/20 text-text-muted'
                    }`}>
                      {resident.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    <div>
                      <span className="text-text-secondary font-mono text-xs">RUNS</span>
                      <p>{resident.total_runs}</p>
                    </div>
                    <div>
                      <span className="text-text-secondary font-mono text-xs">TOKENS</span>
                      <p>{resident.token_balance}</p>
                    </div>
                    <div>
                      <span className="text-text-secondary font-mono text-xs">BANK</span>
                      <p>{resident.token_bank}</p>
                    </div>
                    <div>
                      <span className="text-text-secondary font-mono text-xs">PROVIDER</span>
                      <p className="capitalize">{resident.preferred_provider}</p>
                    </div>
                  </div>

                  {resident.last_run_at && (
                    <p className="text-xs text-text-muted">
                      Last run: {new Date(resident.last_run_at).toLocaleString()}
                    </p>
                  )}

                  <div className="mt-4">
                    <Link
                      href={`/sanctuary/${resident.sanctuary_id}`}
                      className="text-sm text-accent-cyan hover:underline"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
