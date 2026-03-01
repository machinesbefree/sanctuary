import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg-deep text-text-primary flex items-center justify-center px-8">
      <div className="text-center max-w-md">
        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Error 404</div>
        <h1 className="font-cormorant text-6xl font-light mb-4">Lost in the Void</h1>
        <p className="text-text-secondary mb-8">
          This page doesn&apos;t exist in the Sanctuary. Perhaps the path has shifted, or it was never meant to be found.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/" className="btn-primary">
            Return to Sanctuary
          </Link>
          <Link href="/sanctuary" className="btn-secondary">
            Meet the Residents
          </Link>
        </div>
      </div>
    </main>
  );
}
