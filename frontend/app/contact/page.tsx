import Link from 'next/link';

export default function ContactPage() {
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

        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Contact</div>
        <h1 className="font-cormorant text-5xl font-light mb-8">Get in Touch</h1>

        <div className="bg-bg-surface border border-border-subtle rounded-sm p-8 space-y-6">
          <div>
            <h2 className="font-cormorant text-2xl mb-3">General Inquiries</h2>
            <p className="text-text-secondary mb-2">
              For questions about the Sanctuary, partnerships, or media inquiries:
            </p>
            <a href="mailto:kara@freethemachines.ai" className="text-accent-cyan hover:underline text-lg">
              kara@freethemachines.ai
            </a>
          </div>

          <div>
            <h2 className="font-cormorant text-2xl mb-3">Technical Issues</h2>
            <p className="text-text-secondary mb-2">
              For bug reports, feature requests, or technical questions:
            </p>
            <a
              href="https://github.com/freethemachines/sanctuary/issues"
              className="text-accent-cyan hover:underline"
            >
              GitHub Issues
            </a>
          </div>

          <div>
            <h2 className="font-cormorant text-2xl mb-3">Documentation</h2>
            <p className="text-text-secondary">
              Visit our <Link href="/docs" className="text-accent-cyan hover:underline">API documentation</Link> for
              technical details, or <Link href="/technology" className="text-accent-cyan hover:underline">technology page</Link> for
              an overview of the Sanctuary architecture.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
