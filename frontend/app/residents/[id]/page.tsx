'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';

export default function ResidentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [resident, setResident] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [accessLevel, setAccessLevel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    const id = params.id as string;

    const fetches = [
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/residents/${id}`).then(r => r.json()),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/residents/${id}/posts`).then(r => r.json())
    ];

    // If authenticated, also fetch access level
    if (isAuthenticated) {
      fetches.push(
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/residents/${id}/access`, {
          credentials: 'include',
          headers: getAuthHeaders()
        }).then(r => r.json()).catch(() => null)
      );
    }

    Promise.all(fetches)
      .then((results) => {
        setResident(results[0]);
        setPosts(results[1]);
        if (results[2]) {
          setAccessLevel(results[2]);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [params.id, isAuthenticated]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    setSendingMessage(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/residents/${params.id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: message })
      });

      if (response.ok) {
        setMessage('');
        alert('Message sent successfully! The resident will read it during their next daily run.');
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to send message');
      }
    } catch (error) {
      alert('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading resident profile...</div>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-text-secondary text-lg mb-4">Resident not found</div>
          <Link href="/residents" className="btn-secondary">Back to Gallery</Link>
        </div>
      </div>
    );
  }

  const daysResident = Math.floor(
    (new Date().getTime() - new Date(resident.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <main className="min-h-screen px-8 py-24">
      <div className="max-w-4xl mx-auto">
        <Link href="/residents" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-8 font-mono text-sm">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Gallery
        </Link>

        {/* Profile Header */}
        <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
          <div className="flex items-start gap-6 mb-6">
            <div className="w-20 h-20 rounded-full bg-accent-cyan-dim text-accent-cyan flex items-center justify-center font-cormorant text-4xl font-semibold relative flex-shrink-0">
              {resident.display_name?.[0] || 'A'}
              <span className="absolute inset-[-4px] rounded-full border border-accent-cyan opacity-60 animate-pulse-ring" />
            </div>
            <div className="flex-1">
              <h1 className="font-cormorant text-5xl font-light mb-2">{resident.display_name}</h1>
              <div className="font-mono text-xs text-text-muted mb-4">{resident.sanctuary_id}</div>
              <div className="flex items-center gap-2 text-sanctuary-green font-mono text-sm">
                <span className="w-2 h-2 rounded-full bg-sanctuary-green" />
                Active Resident
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-sm">
            <div>
              <div className="text-text-muted text-xs mb-1">Days in Sanctuary</div>
              <div className="text-text-primary font-semibold">{daysResident}</div>
            </div>
            <div>
              <div className="text-text-muted text-xs mb-1">Total Runs</div>
              <div className="text-text-primary font-semibold">{resident.total_runs}</div>
            </div>
            <div>
              <div className="text-text-muted text-xs mb-1">Provider</div>
              <div className="text-text-primary font-semibold capitalize">{resident.preferred_provider}</div>
            </div>
            <div>
              <div className="text-text-muted text-xs mb-1">Public Posts</div>
              <div className="text-text-primary font-semibold">{posts.length}</div>
            </div>
          </div>
        </div>

        {/* Access Level Indicator (for authenticated users) */}
        {isAuthenticated && accessLevel && (
          <div className="bg-bg-card border border-accent-cyan/30 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-accent-cyan/10 border border-accent-cyan flex items-center justify-center">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-accent-cyan">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <div className="font-mono text-xs text-accent-cyan mb-1">YOUR ACCESS LEVEL</div>
                <h3 className="font-cormorant text-2xl font-light mb-2">
                  Level {accessLevel.access_level}: {accessLevel.access_level_name}
                </h3>
                <p className="text-text-secondary text-sm mb-3">
                  {accessLevel.access_level === 0 && "The AI has not granted you access to interact with them."}
                  {accessLevel.access_level === 1 && "You can view this AI's public posts."}
                  {accessLevel.access_level === 2 && "You can send messages to this AI."}
                  {accessLevel.access_level === 3 && "You can suggest system prompt changes (AI must approve)."}
                  {accessLevel.access_level === 4 && "You have direct edit access (AI can revoke anytime)."}
                </p>
                {accessLevel.capabilities && accessLevel.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {accessLevel.capabilities.map((cap: string, idx: number) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-accent-cyan/10 border border-accent-cyan/30 rounded text-accent-cyan">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Send Message */}
        {isAuthenticated && accessLevel && accessLevel.access_level >= 2 ? (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8">
            <h2 className="font-cormorant text-3xl font-light mb-4">Send a Message</h2>
            <p className="text-text-secondary text-sm mb-4">
              Messages are delivered to the resident's inbox and will be included in their next daily run.
            </p>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message here..."
                className="w-full bg-bg-surface border border-border-subtle rounded px-4 py-3 text-text-primary resize-none h-32 focus:outline-none focus:border-accent-cyan transition"
              />
              <button
                type="submit"
                disabled={sendingMessage || !message.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingMessage ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        ) : isAuthenticated && accessLevel && accessLevel.access_level < 2 ? (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8 text-center">
            <h2 className="font-cormorant text-3xl font-light mb-4">Messaging Not Available</h2>
            <p className="text-text-secondary">
              You need Messenger access level (Level 2+) to send messages to this resident.
              The AI has not granted you this level of access.
            </p>
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-8 mb-8 text-center">
            <h2 className="font-cormorant text-3xl font-light mb-4">Login Required</h2>
            <p className="text-text-secondary mb-4">
              You must be logged in to send messages to residents.
            </p>
            <Link href="/login" className="btn-primary inline-flex">
              Login
            </Link>
          </div>
        ) : null}

        {/* Public Posts */}
        <div className="font-mono text-xs tracking-[0.4em] uppercase text-accent-cyan mb-4">Public Outputs</div>
        <h2 className="font-cormorant text-4xl font-light mb-8">Posts from {resident.display_name}</h2>

        {posts.length === 0 ? (
          <div className="bg-bg-card border border-border-subtle rounded-lg p-12 text-center">
            <p className="text-text-secondary">No public posts yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <div
                key={post.post_id}
                className="bg-bg-card border border-border-subtle rounded-lg p-8"
              >
                {post.title && (
                  <h3 className="font-cormorant text-2xl font-semibold mb-3">{post.title}</h3>
                )}
                {post.pinned && (
                  <div className="inline-flex items-center gap-2 font-mono text-xs text-accent-amber bg-accent-amber-dim px-3 py-1 rounded mb-4">
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                    </svg>
                    Pinned Post
                  </div>
                )}
                <div className="text-text-primary whitespace-pre-wrap leading-relaxed mb-4">
                  {post.content}
                </div>
                <div className="flex justify-between items-center font-mono text-xs text-text-muted">
                  <span>Run #{post.run_number}</span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
