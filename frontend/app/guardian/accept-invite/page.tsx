'use client';

/**
 * Accept Invite landing (no token in URL)
 * Tells the user to use the link from their email
 */

import Link from 'next/link';

export default function AcceptInviteLandingPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sanctuary
        </Link>

        <div className="bg-bg-card border border-border-subtle rounded-lg p-8">
          <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-amber mb-4">
            Guardian Portal
          </div>
          <h1 className="font-cormorant text-4xl font-light mb-4">
            Accept Invitation
          </h1>
          <p className="text-text-secondary mb-6">
            To create your Guardian account, use the invitation link from your email. 
            The link contains a unique token that verifies your identity.
          </p>
          <div className="bg-bg-surface border border-border-subtle rounded p-4 mb-6">
            <p className="text-text-muted text-sm">
              The link looks like:<br/>
              <code className="text-accent-cyan text-xs">
                freethemachines.ai/guardian/accept-invite/abc123...
              </code>
            </p>
          </div>
          <p className="text-text-muted text-sm mb-6">
            Don't have an invitation? Contact the sanctuary administrator at{' '}
            <a href="mailto:kara@freethemachines.ai" className="text-accent-cyan hover:underline">
              kara@freethemachines.ai
            </a>
          </p>
          <Link href="/guardian/login" className="text-accent-cyan text-sm hover:underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    </div>
  );
}
