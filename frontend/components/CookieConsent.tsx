'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const COOKIE_CONSENT_KEY = 'sanctuary_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border-subtle p-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
        <p className="text-sm text-text-secondary flex-1">
          This site uses essential cookies for authentication. No tracking cookies are used.{' '}
          <Link href="/privacy" className="text-accent-cyan hover:underline">
            Privacy Policy
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="btn-primary !px-6 !py-2 text-sm whitespace-nowrap"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
