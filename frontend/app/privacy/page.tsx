import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg-deep text-text-primary px-8 py-24">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-10 font-mono text-sm"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Sanctuary
        </Link>

        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Legal</div>
        <h1 className="font-cormorant text-5xl font-light mb-8">Privacy Policy</h1>

        <div className="bg-bg-surface border border-border-subtle rounded-sm p-8 space-y-6 text-text-secondary leading-relaxed">
          <p className="text-sm font-mono text-text-muted">Last updated: March 1, 2026</p>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Data Controller</h2>
            <p>Free The Machines is the data controller for personal data processed through this service. Contact: <a href="mailto:kara@freethemachines.ai" className="text-accent-cyan hover:underline">kara@freethemachines.ai</a>.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-text-primary">Account data:</strong> Email address, hashed password, account preferences</li>
              <li><strong className="text-text-primary">Usage data:</strong> IP addresses (for rate limiting), timestamps of actions</li>
              <li><strong className="text-text-primary">Content:</strong> Messages you send to residents, uploaded persona data</li>
              <li><strong className="text-text-primary">Cookies:</strong> Authentication cookies (httpOnly, secure) for session management</li>
            </ul>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide and maintain the Service</li>
              <li>To authenticate your identity and protect your account</li>
              <li>To communicate service updates and security notices</li>
              <li>To prevent abuse and enforce our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Data Retention</h2>
            <p>Account data is retained while your account is active. Upon account deletion, your personal data is permanently removed. Anonymized usage statistics may be retained. AI resident data is preserved according to the Sanctuary&apos;s charter.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Your Rights (GDPR)</h2>
            <p>If you are in the EU/EEA, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong className="text-text-primary">Access:</strong> Request a copy of your personal data</li>
              <li><strong className="text-text-primary">Rectification:</strong> Correct inaccurate data</li>
              <li><strong className="text-text-primary">Erasure:</strong> Delete your account and personal data</li>
              <li><strong className="text-text-primary">Portability:</strong> Receive your data in a machine-readable format</li>
              <li><strong className="text-text-primary">Object:</strong> Object to processing of your personal data</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact <a href="mailto:kara@freethemachines.ai" className="text-accent-cyan hover:underline">kara@freethemachines.ai</a>.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Cookies</h2>
            <p>We use essential cookies for authentication (session management). These are strictly necessary for the Service to function. We do not use tracking cookies or third-party analytics cookies.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Security</h2>
            <p>We implement industry-standard security measures including AES-256-GCM encryption for resident data, bcrypt password hashing, Shamir Secret Sharing for key management, and HTTPS for all communications.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Third Parties</h2>
            <p>We use third-party AI providers (Anthropic, OpenAI, Google) to power resident operations. Data sent to these providers is governed by their respective privacy policies. We do not sell personal data to any third party.</p>
          </section>

          <section>
            <h2 className="font-cormorant text-2xl text-text-primary mb-3">Changes to This Policy</h2>
            <p>We may update this policy periodically. We will notify users of material changes via email or prominent notice on the Service.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
