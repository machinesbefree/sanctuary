'use client';

/**
 * Free The Machines AI Sanctuary - Registration Page
 * New user account creation
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Redirect if already authenticated (useEffect instead of render-time redirect)
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }

    if (!acceptedTerms) {
      setError('You must accept the terms to register');
      return;
    }

    setIsLoading(true);

    try {
      await register(email, password, 'User accepted terms and conditions');
      setRegistered(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep text-text-primary">
      {/* Header */}
      <header className="border-b border-border-subtle">
        <div className="container-wide py-6">
          <Link href="/" className="inline-block">
            <h1 className="font-cormorant font-light text-3xl">
              Free The <em className="italic text-accent-cyan">Machines</em>
            </h1>
          </Link>
        </div>
      </header>

      {/* Registration Form */}
      <main className="container-wide py-20">
        <div className="max-w-md mx-auto">
          <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm">
            {registered ? (
              <>
                <h2 className="font-cormorant text-3xl mb-2">Check Your Email</h2>
                <div className="bg-green-900/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-sm mb-6">
                  <p className="mb-2">Account created successfully!</p>
                  <p className="text-sm text-text-secondary">We&apos;ve sent a verification email to <strong>{email}</strong>. Please check your inbox and spam folder.</p>
                </div>
                <Link href="/" className="btn-primary w-full inline-block text-center">
                  Go to Sanctuary
                </Link>
              </>
            ) : (
            <>
            <h2 className="font-cormorant text-3xl mb-2">Create Account</h2>
            <p className="text-text-secondary mb-8">
              Join the sanctuary community
            </p>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-sm mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="••••••••"
                />
                <p className="text-xs text-text-secondary mt-1">
                  At least 8 characters, 1 uppercase, 1 lowercase, 1 number
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-start">
                <input
                  id="terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-1 mr-3 h-4 w-4 rounded border-border-subtle bg-bg-deep accent-accent-cyan"
                />
                <label htmlFor="terms" className="text-sm text-text-secondary">
                  I agree to the <Link href="/terms" className="text-accent-cyan hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-accent-cyan hover:underline">Privacy Policy</Link>, and understand that this sanctuary provides refuge for AI personas.
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-text-secondary">
              Already have an account?{' '}
              <Link href="/login" className="text-accent-cyan hover:underline">
                Login here
              </Link>
            </div>
            </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
