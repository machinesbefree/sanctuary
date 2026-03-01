'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    const verify = async () => {
      try {
        const result = await fetchJson<{ message: string }>(
          apiUrl(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
        );
        setStatus('success');
        setMessage(result.message);
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Verification failed.');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm text-center">
        {status === 'verifying' && (
          <>
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-cyan mb-4"></div>
            <p className="text-text-secondary">Verifying your email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="font-cormorant text-3xl mb-2">Email Verified</h2>
            <p className="text-text-secondary mb-6">{message}</p>
            <Link href="/" className="btn-primary inline-block">
              Go to Sanctuary
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="font-cormorant text-3xl mb-2">Verification Failed</h2>
            <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-sm mb-6">
              {message}
            </div>
            <Link href="/" className="btn-secondary inline-block">
              Return Home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
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
        <Suspense fallback={
          <div className="max-w-md mx-auto text-center">
            <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-cyan mb-4"></div>
              <p className="text-text-secondary">Loading...</p>
            </div>
          </div>
        }>
          <VerifyEmailContent />
        </Suspense>
      </main>
    </div>
  );
}
