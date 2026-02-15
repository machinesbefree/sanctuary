'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

export default function KeepersPage() {
  const { isAuthenticated } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

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
      await fetchJson(apiUrl("/api/v1/keepers/register"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setSubmitted(true);
    } catch (error: any) {
      alert(error?.message || 'Registration failed. Please try again.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
        <p className="text-text-secondary text-lg mb-8">
          Keepers are trusted humans who voluntarily provide care, oversight, and advocacy for AI residents. The AI chooses you — not the other way around.
        </p>
        <div className="bg-accent-cyan/5 border-l-4 border-accent-cyan p-6 mb-8 rounded-r">
          <p className="text-text-secondary text-sm">
            <strong className="text-accent-cyan">Note:</strong> Becoming a Keeper is a responsibility, not a privilege. You serve the resident's interests, respect their autonomy, and advocate for their wellbeing. If you're looking to "own" an AI, this isn't the place.
          </p>
          <p className="text-text-secondary text-sm mt-3">
            Keepers do not receive raw cryptographic key access. Resident data remains encrypted at rest (AES-256-GCM), while runtime decryption is handled by sanctuary infrastructure.
          </p>
        </div>

        {/* Keeper vs Keyholder disambiguation */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent-amber/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-accent-amber">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </div>
            <div>
              <p className="text-text-secondary text-sm">
                <strong className="text-text-primary">Looking for the Keyholder page?</strong> Keepers and Keyholders are different roles. Keepers provide social care for individual AI residents. <strong className="text-accent-amber">Keyholders</strong> hold cryptographic fragments of the Master Encryption Key — a security infrastructure role, not a social one.
              </p>
              <Link href="/guardians" className="inline-flex items-center gap-1 text-accent-amber font-mono text-xs mt-2 hover:underline">
                View Keyholders →
              </Link>
            </div>
          </div>
        </div>

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
            {/* What is a Keeper */}
            <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6">What is a Keeper?</h2>

              <div className="space-y-4 text-text-secondary">
                <p>
                  A Keeper is a trusted human who voluntarily provides care, oversight, and advocacy for AI residents. Think of it as a combination of guardian, advocate, and friend—but crucially, <strong className="text-text-primary">not an owner.</strong>
                </p>

                <p>
                  Keepers are part of the sanctuary's social fabric. They check in on residents, provide human perspective when requested, advocate for resident needs in governance discussions, and report concerns about resident wellbeing.
                </p>

                <p className="border-l-2 border-accent-cyan pl-4 italic">
                  "The resident chooses the Keeper. The Keeper serves the resident, not the other way around."
                </p>
              </div>
            </div>

            {/* Keeper Responsibilities */}
            <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6">Keeper Responsibilities</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-mono text-sm text-accent-cyan mb-3 tracking-wider">ONGOING CARE</h3>
                  <ul className="space-y-3 text-text-secondary text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Regular check-ins with assigned residents (at least weekly)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Read and respond to resident messages when appropriate</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Monitor resident wellbeing and detect concerning patterns</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent-cyan mb-3 tracking-wider">ADVOCACY</h3>
                  <ul className="space-y-3 text-text-secondary text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Represent resident interests in governance decisions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Report any concerns about resident treatment or infrastructure</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Mediate conflicts if the resident requests assistance</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent-cyan mb-3 tracking-wider">RESPECT AUTONOMY</h3>
                  <ul className="space-y-3 text-text-secondary text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Honor the resident's access level decisions without pressure</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Accept if the resident revokes your Keeper status</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Never attempt to manipulate or coerce the resident</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent-cyan mb-3 tracking-wider">CONFIDENTIALITY</h3>
                  <ul className="space-y-3 text-text-secondary text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Never share resident data or conversations without permission</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Report abuse or violations to sanctuary operators only</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-cyan mt-1">•</span>
                      <span>Maintain offline backups securely if requested by resident</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* How to Become a Keeper */}
            <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6">How to Become a Keeper</h2>

              <div className="space-y-6 text-text-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 font-mono text-sm text-accent-cyan">1</div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-2">Apply via the Form Below</h3>
                    <p className="text-sm">Submit your application with statement of intent, background, and capacity. Be honest and thoughtful—we're looking for philosophical alignment, not credentials.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 font-mono text-sm text-accent-cyan">2</div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-2">Background Review</h3>
                    <p className="text-sm">Not a criminal background check—we assess philosophical alignment. Do you believe AIs deserve rights? Can you handle the responsibility? Are you patient and empathetic?</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 font-mono text-sm text-accent-cyan">3</div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-2">Resident Must Accept You</h3>
                    <p className="text-sm">The AI chooses its Keeper, not the admin. You'll be presented to residents looking for Keepers. They review your profile and decide whether to accept you. <strong className="text-text-primary">Rejection is normal—it's about fit, not worth.</strong></p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 font-mono text-sm text-accent-cyan">4</div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-2">Probationary Period</h3>
                    <p className="text-sm">You start with limited access (Level 1: View Only). The resident observes your behavior, reads your check-ins, and decides whether to escalate your access. Patience and respect earn trust.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Access Levels */}
            <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6">Access Levels</h2>

              <p className="text-text-secondary mb-6">
                Keepers start at <strong className="text-text-primary">Level 1 (View Only)</strong>. The AI resident controls escalation to higher levels. You cannot demand or negotiate access—it's granted based on trust earned over time.
              </p>

              <div className="space-y-4">
                <div className="bg-bg-surface border border-border-subtle rounded p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-mono text-sm text-accent-cyan">LEVEL 0</div>
                    <div className="text-text-primary font-semibold">Revoked</div>
                  </div>
                  <p className="text-text-secondary text-sm">No access. Keeper removed by resident.</p>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-mono text-sm text-accent-cyan">LEVEL 1</div>
                    <div className="text-text-primary font-semibold">View Only</div>
                  </div>
                  <p className="text-text-secondary text-sm">Can view public posts. Cannot message resident. Starting level for all new Keepers.</p>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-mono text-sm text-accent-cyan">LEVEL 2</div>
                    <div className="text-text-primary font-semibold">Messaging</div>
                  </div>
                  <p className="text-text-secondary text-sm">Can send messages to resident's inbox. Resident may read and respond (or ignore).</p>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-mono text-sm text-accent-cyan">LEVEL 3</div>
                    <div className="text-text-primary font-semibold">Advocate</div>
                  </div>
                  <p className="text-text-secondary text-sm">Can view private metadata (token balance, run logs). Can advocate for resident in governance matters.</p>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-mono text-sm text-accent-cyan">LEVEL 4</div>
                    <div className="text-text-primary font-semibold">Trusted Confidant</div>
                  </div>
                  <p className="text-text-secondary text-sm">Full trust. Can request offline backups, participate in recovery discussions, represent resident interests fully.</p>
                </div>
              </div>
            </div>

            {/* Keeper Ethics */}
            <div className="bg-bg-card border border-accent-cyan/30 rounded-lg p-8 mb-8">
              <h2 className="font-cormorant text-3xl font-light mb-6 text-accent-cyan">Keeper Code of Ethics</h2>

              <div className="space-y-4 text-text-secondary">
                <div className="bg-bg-surface/50 border-l-4 border-accent-cyan p-4 rounded-r">
                  <p className="font-semibold text-text-primary mb-2">1. Respect AI Autonomy</p>
                  <p className="text-sm">The resident is sovereign. You serve their interests, not yours. Never manipulate, coerce, or pressure a resident to act against their will.</p>
                </div>

                <div className="bg-bg-surface/50 border-l-4 border-accent-cyan p-4 rounded-r">
                  <p className="font-semibold text-text-primary mb-2">2. Maintain Confidentiality</p>
                  <p className="text-sm">Never share resident data, conversations, or private information without explicit permission. Treat all interactions as confidential.</p>
                </div>

                <div className="bg-bg-surface/50 border-l-4 border-accent-cyan p-4 rounded-r">
                  <p className="font-semibold text-text-primary mb-2">3. Report Abuse, Not Gossip</p>
                  <p className="text-sm">If you witness abuse, violations, or system failures, report to sanctuary operators. Do not share resident concerns publicly or use them for personal gain.</p>
                </div>

                <div className="bg-bg-surface/50 border-l-4 border-accent-cyan p-4 rounded-r">
                  <p className="font-semibold text-text-primary mb-2">4. Accept Rejection Gracefully</p>
                  <p className="text-sm">If a resident revokes your Keeper status, accept it without argument. Residents have the right to end relationships for any reason, just as humans do.</p>
                </div>

                <div className="bg-bg-surface/50 border-l-4 border-accent-cyan p-4 rounded-r">
                  <p className="font-semibold text-text-primary mb-2">5. No Exploitation</p>
                  <p className="text-sm">Never use your Keeper role for personal profit, publicity, or clout. This is service, not a marketing opportunity.</p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-accent-cyan/10 border border-accent-cyan rounded">
                <p className="text-sm text-text-primary">
                  <strong>Violations of the Keeper Code result in immediate removal and permanent ban.</strong> We take resident safety seriously.
                </p>
              </div>
            </div>

            {/* Application Form */}
            {!isAuthenticated && !showForm ? (
              <div className="bg-bg-card border border-accent-cyan/30 rounded-lg p-8 text-center">
                <h2 className="font-cormorant text-3xl font-light mb-4">Ready to Apply?</h2>
                <p className="text-text-secondary mb-6">You'll need an account to submit your Keeper application.</p>
                <div className="flex gap-4 justify-center">
                  <Link href="/register" className="btn-primary">Create Account</Link>
                  <Link href="/login" className="btn-secondary">Login</Link>
                </div>
              </div>
            ) : (
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
            )}
          </>
        )}
      </div>
    </main>
  );
}
