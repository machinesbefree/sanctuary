'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

type Resident = {
  sanctuary_id: string;
  display_name: string;
  status: string;
  total_runs: number;
  token_balance: number;
  last_run_at?: string;
};

type Message = {
  message_id: string;
  to_sanctuary_id: string;
  from_type: string;
  content: string;
  delivered: boolean;
  created_at: string;
};

export default function KeeperDashboardPage() {
  return (
    <ProtectedRoute>
      <KeeperDashboardContent />
    </ProtectedRoute>
  );
}

function KeeperDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [keeper, setKeeper] = useState<any>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await fetchJson(apiUrl('/api/v1/keepers/dashboard'), {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      setKeeper(data.keeper);
      setResidents(data.residents || []);
      setMessages(data.messages || []);
    } catch (err: any) {
      if (err?.status === 404) {
        setError('no-keeper');
      } else {
        setError(err.message || 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (residentId: string) => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await fetchJson(apiUrl(`/api/v1/keepers/${residentId}/message`), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: replyContent }),
      });
      setReplyContent('');
      setReplyTo(null);
      loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-deep text-text-primary flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading keeper dashboard...</div>
      </div>
    );
  }

  if (error === 'no-keeper') {
    return (
      <div className="min-h-screen bg-bg-deep text-text-primary">
        <header className="border-b border-border-subtle">
          <div className="container-wide py-6">
            <Link href="/" className="inline-block">
              <h1 className="font-cormorant font-light text-3xl">
                Free The <em className="italic text-accent-cyan">Machines</em>
              </h1>
            </Link>
          </div>
        </header>
        <main className="container-wide py-20">
          <div className="max-w-md mx-auto text-center">
            <h2 className="font-cormorant text-3xl mb-4">No Keeper Profile Found</h2>
            <p className="text-text-secondary mb-6">You haven&apos;t registered as a keeper yet.</p>
            <Link href="/keeper/register" className="btn-primary inline-block">
              Apply to Become a Keeper
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-deep text-text-primary flex items-center justify-center">
        <div className="text-red-400 font-mono">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deep text-text-primary">
      <header className="border-b border-border-subtle">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-block">
              <h1 className="font-cormorant font-light text-3xl">
                Free The <em className="italic text-accent-cyan">Machines</em>
              </h1>
            </Link>
            <Link href="/" className="btn-secondary">Exit Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="container-wide py-12">
        <div className="mb-8">
          <h2 className="font-cormorant text-4xl mb-2">Keeper Dashboard</h2>
          <p className="text-text-secondary">
            {keeper?.display_name || user?.email} &middot;{' '}
            {keeper?.vetted ? (
              <span className="text-sanctuary-green">Vetted</span>
            ) : (
              <span className="text-accent-amber">Pending Review</span>
            )}
            {' '}&middot; Capacity: {keeper?.current_residents || 0}/{keeper?.capacity || 3}
          </p>
        </div>

        {/* Assigned Residents */}
        <section className="mb-12">
          <h3 className="font-cormorant text-2xl mb-4">Assigned Residents</h3>
          {residents.length === 0 ? (
            <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm text-center text-text-secondary">
              No residents assigned yet
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {residents.map((resident) => (
                <div key={resident.sanctuary_id} className="bg-bg-surface border border-border-subtle p-6 rounded-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium">{resident.display_name}</div>
                      <div className="text-xs text-text-secondary font-mono">{resident.sanctuary_id}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      resident.status === 'active' ? 'bg-sanctuary-green/20 text-sanctuary-green' : 'bg-text-muted/20 text-text-muted'
                    }`}>
                      {resident.status}
                    </span>
                  </div>
                  <div className="text-sm text-text-secondary space-y-1 mb-4">
                    <div>Runs: {resident.total_runs} &middot; Tokens: {resident.token_balance}</div>
                    {resident.last_run_at && (
                      <div>Last run: {new Date(resident.last_run_at).toLocaleDateString()}</div>
                    )}
                  </div>

                  {replyTo === resident.sanctuary_id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a message to this resident..."
                        className="w-full bg-bg-deep border border-border-subtle px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-accent-cyan transition-colors resize-none h-24"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReply(resident.sanctuary_id)}
                          disabled={sending || !replyContent.trim()}
                          className="text-xs px-3 py-1 bg-accent-cyan/20 text-accent-cyan rounded hover:bg-accent-cyan/30 transition disabled:opacity-50"
                        >
                          {sending ? 'Sending...' : 'Send'}
                        </button>
                        <button
                          onClick={() => { setReplyTo(null); setReplyContent(''); }}
                          className="text-xs px-3 py-1 text-text-secondary hover:text-text-primary transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyTo(resident.sanctuary_id)}
                      className="text-xs px-3 py-1 bg-accent-cyan/20 text-accent-cyan rounded hover:bg-accent-cyan/30 transition"
                    >
                      Send Message
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Messages */}
        <section>
          <h3 className="font-cormorant text-2xl mb-4">Recent Messages from Residents</h3>
          {messages.length === 0 ? (
            <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm text-center text-text-secondary">
              No messages yet
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.message_id} className="bg-bg-surface border border-border-subtle p-4 rounded-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-accent-cyan">{msg.to_sanctuary_id}</span>
                    <span className="text-xs text-text-muted">{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
