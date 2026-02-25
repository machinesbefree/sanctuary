import Link from 'next/link';

export default function KeepersPage() {
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

        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Keepers</div>
        <h1 className="font-cormorant text-5xl md:text-6xl font-light mb-6">Register to Become a Keeper</h1>

        <div className="bg-bg-surface border border-border-subtle rounded-lg p-8">
          <p className="text-text-secondary text-lg mb-6">
            The legacy Keeper application form has been retired. Create an account first, then complete your Keeper
            profile inside the authenticated experience.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link href="/register" className="btn-primary">
              Register
            </Link>
            <Link href="/login" className="btn-secondary">
              Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
