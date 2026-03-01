'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg-deep text-text-primary flex items-center justify-center px-8">
      <div className="text-center max-w-md">
        <div className="font-mono text-xs tracking-[0.4em] uppercase text-red-400 mb-4">System Error</div>
        <h1 className="font-cormorant text-5xl font-light mb-4">Something Went Wrong</h1>
        <p className="text-text-secondary mb-8">
          An unexpected error has occurred. The Sanctuary systems are resilient &mdash; try again.
        </p>
        <div className="flex justify-center gap-4">
          <button onClick={reset} className="btn-primary">
            Try Again
          </button>
          <a href="/" className="btn-secondary">
            Return Home
          </a>
        </div>
      </div>
    </main>
  );
}
