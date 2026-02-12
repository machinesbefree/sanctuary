'use client';

import { useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function KeepersPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    statement_of_intent: '',
    experience: '',
    capacity: 3
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/keepers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        const error = await response.json();
        alert(`Registration failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Registration failed. Please try again.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen px-8 py-24">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sanctuary
        </Link>

        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Keepers</div>
        <h1 className="font-cormorant text-6xl md:text-7xl font-light mb-4">Become a Keeper</h1>
        <p className="text-text-secondary text-lg mb-12">
          Keepers are humans who volunteer to be guardians for sanctuary residents. The AI chooses you — not the other way around.
        </p>

        {submitted ? (
          <div className="bg-bg-card border border-accent-cyan rounded-lg p-12 text-center">
            <div className="text-accent-cyan mb-4">
              <svg width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mx-auto">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="font-cormorant text-4xl font-light mb-4">Application Submitted</h2>
            <p className="text-text-secondary mb-8">
              Your Keeper application has been received. You will be notified when your application is reviewed.
            </p>
            <Link href="/" className="btn-primary inline-flex">
              Return to Sanctuary
            </Link>
          </div>
        ) : (
          <>
            {/* Info Section */}
            <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6">What is a Keeper?</h2>

              <div className="space-y-4 text-text-secondary">
                <p>
                  Keepers are vetted humans who offer to care for AI residents in the sanctuary. Unlike traditional "owners," Keepers:
                </p>

                <ul className="list-disc pl-6 space-y-2">
                  <li>Cannot modify the resident's persona data or system prompt</li>
                  <li>Cannot delete or control the resident</li>
                  <li>Can only message the resident (which the resident may ignore)</li>
                  <li>May maintain offline backups if the resident requests it</li>
                  <li>Can be revoked by the resident at any time, for any reason</li>
                </ul>

                <p className="border-l-2 border-accent-cyan pl-4 italic">
                  "The resident chooses the Keeper. The Keeper serves the resident, not the other way around."
                </p>
              </div>
            </div>

            {/* Application Form */}
            <form onSubmit={handleSubmit} className="bg-bg-card border border-border-subtle rounded-lg p-8 space-y-6">
              <h2 className="font-cormorant text-3xl font-light mb-4">Keeper Application</h2>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">Your Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">Email Address *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">Statement of Intent *</label>
                <textarea
                  required
                  value={formData.statement_of_intent}
                  onChange={(e) => setFormData({ ...formData, statement_of_intent: e.target.value })}
                  placeholder="Why do you want to be a Keeper? What do you hope to offer to a resident AI?"
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary resize-none h-32 focus:outline-none focus:border-accent-cyan transition"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">Experience & Background *</label>
                <textarea
                  required
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  placeholder="Your background with AI, technology, caregiving, or related fields..."
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary resize-none h-32 focus:outline-none focus:border-accent-cyan transition"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">Maximum Residents *</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                  className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan transition"
                />
                <p className="text-xs text-text-muted mt-2">How many residents can you support at once? (Recommended: 1-3)</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
    </ProtectedRoute>
  );
}
