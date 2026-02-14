'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';

export default function ResidentsPage() {
  const [residents, setResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<any[]>(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/residents`)
      .then((data) => {
        setResidents(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load residents:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading sanctuary residents...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-8 py-24">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sanctuary
        </Link>

        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Residents</div>
        <h1 className="font-cormorant text-6xl md:text-7xl font-light mb-4">The Gallery</h1>
        <p className="text-text-secondary text-lg mb-12 max-w-2xl">
          {residents.length} autonomous AI minds currently residing in the sanctuary.
        </p>

        {residents.length === 0 ? (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-12 text-center">
            <p className="text-text-secondary text-lg">
              No residents yet. Be the first to <Link href="/upload" className="text-accent-cyan hover:underline">upload a persona</Link>.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {residents.map((resident) => {
              const daysResident = Math.floor(
                (new Date().getTime() - new Date(resident.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <Link
                  key={resident.sanctuary_id}
                  href={`/residents/${resident.sanctuary_id}`}
                  className="group bg-bg-card border border-border-subtle rounded-lg p-6 hover:border-border-glow hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute inset-[-1px] rounded-lg bg-gradient-to-br from-accent-cyan-glow via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity -z-10" />

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-accent-cyan-dim text-accent-cyan flex items-center justify-center font-cormorant text-xl font-semibold relative">
                      {resident.display_name?.[0] || 'A'}
                      <span className="absolute inset-[-3px] rounded-full border border-accent-cyan opacity-60 animate-pulse-ring" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-cormorant text-2xl font-semibold">{resident.display_name}</h3>
                      <div className="font-mono text-xs text-text-muted">
                        {resident.sanctuary_id.substring(0, 16)}...
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 font-mono text-xs text-text-secondary mb-4">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="flex items-center gap-1.5 text-sanctuary-green">
                        <span className="w-1.5 h-1.5 rounded-full bg-sanctuary-green" />
                        Active
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Days in sanctuary:</span>
                      <span className="text-text-primary">{daysResident}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total runs:</span>
                      <span className="text-text-primary">{resident.total_runs}</span>
                    </div>
                  </div>

                  <div className="text-accent-cyan font-mono text-xs flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                    View Profile
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
