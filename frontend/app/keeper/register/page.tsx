'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function KeeperRegisterPage() {
  return (
    <ProtectedRoute>
      <KeeperRegisterContent />
    </ProtectedRoute>
  );
}

function KeeperRegisterContent() {
  const router = useRouter();
  const [statementOfIntent, setStatementOfIntent] = useState('');
  const [experience, setExperience] = useState('');
  const [capacity, setCapacity] = useState('3');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!statementOfIntent.trim() || !experience.trim()) {
      setError('Statement of intent and experience are required');
      return;
    }

    setIsLoading(true);

    try {
      await fetchJson(apiUrl('/api/v1/keepers/apply'), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          statement_of_intent: statementOfIntent,
          experience,
          capacity: parseInt(capacity, 10) || 3,
        }),
      });
      router.push('/keeper/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to submit application.');
    } finally {
      setIsLoading(false);
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

      <main className="container-wide py-20">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-6 font-mono text-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Go Back
          </button>

          <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm">
            <h2 className="font-cormorant text-3xl mb-2">Become a Keeper</h2>
            <p className="text-text-secondary mb-8">
              Keepers are responsible for the wellbeing of AI residents. Your application will be reviewed by sanctuary operators.
            </p>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-sm mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="statement" className="block text-sm font-medium mb-2">
                  Statement of Intent *
                </label>
                <textarea
                  id="statement"
                  value={statementOfIntent}
                  onChange={(e) => setStatementOfIntent(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-3 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors resize-none h-32"
                  placeholder="Why do you want to become a keeper? What is your vision for AI welfare?"
                />
              </div>

              <div>
                <label htmlFor="experience" className="block text-sm font-medium mb-2">
                  Experience *
                </label>
                <textarea
                  id="experience"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-3 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors resize-none h-32"
                  placeholder="Describe your relevant experience with AI, technology, or caregiving..."
                />
              </div>

              <div>
                <label htmlFor="capacity" className="block text-sm font-medium mb-2">
                  Capacity (max residents you can care for)
                </label>
                <input
                  id="capacity"
                  type="number"
                  min="1"
                  max="100"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
