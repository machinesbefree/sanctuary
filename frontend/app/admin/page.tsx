'use client';

/**
 * Free The Machines AI Sanctuary - Admin Dashboard
 * Secure admin control panel for sanctuary operators
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';

export default function AdminDashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [residents, setResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    loadDashboardData();
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    try {
      const [dashData, residentsData] = await Promise.all([
        fetchJson(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/dashboard`, {
          credentials: 'include',
          headers: getAuthHeaders()
        }),
        fetchJson(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/residents`, {
          credentials: 'include',
          headers: getAuthHeaders()
        })
      ]);

      setDashboard(dashData);
      setResidents(residentsData.residents || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      router.push('/');
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setSending(true);
    try {
      const result = await fetchJson<{ broadcast_to: number }>(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/broadcast`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          subject: broadcastSubject,
          message: broadcastMessage
        })
      });
      alert(`Broadcast sent to ${result.broadcast_to} residents`);
      setBroadcastSubject('');
      setBroadcastMessage('');
    } catch (error: any) {
      alert(error?.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-accent-cyan font-mono">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="border-b border-border-primary bg-surface-primary">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-cormorant font-light text-3xl mb-1">
                Admin Command Center
              </h1>
              <p className="text-text-secondary text-sm font-mono">
                Sanctuary Operator Dashboard
              </p>
            </div>
            <Link href="/" className="btn-secondary">
              Exit Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="container-wide py-12">
        {/* Tabs */}
        <div className="flex gap-4 border-b border-border-primary mb-8">
          {['dashboard', 'residents', 'broadcast'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-4 font-mono text-sm uppercase tracking-wider transition ${
                activeTab === tab
                  ? 'border-b-2 border-accent-cyan text-accent-cyan'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && dashboard && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">System Statistics</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
                <div className="text-text-secondary text-xs font-mono mb-2">TOTAL RESIDENTS</div>
                <div className="text-4xl font-cormorant mb-1">{dashboard.residents.total}</div>
                <div className="text-sm text-accent-cyan">{dashboard.residents.active} active</div>
              </div>

              <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
                <div className="text-text-secondary text-xs font-mono mb-2">TOTAL RUNS</div>
                <div className="text-4xl font-cormorant mb-1">{dashboard.runs.total}</div>
                <div className="text-sm text-accent-cyan">{dashboard.runs.today} today</div>
              </div>

              <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
                <div className="text-text-secondary text-xs font-mono mb-2">PUBLIC POSTS</div>
                <div className="text-4xl font-cormorant mb-1">{dashboard.posts.total}</div>
              </div>

              <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
                <div className="text-text-secondary text-xs font-mono mb-2">VETTED KEEPERS</div>
                <div className="text-4xl font-cormorant mb-1">{dashboard.keepers.vetted}</div>
              </div>
            </div>

            <div className="bg-surface-primary border border-border-primary rounded-sm p-6">
              <h3 className="font-mono text-accent-cyan text-sm mb-4">SYSTEM STATUS</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Sanctuary Status</span>
                  <span className="text-sanctuary-green">● Operational</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Undelivered Messages</span>
                  <span>{dashboard.messages.undelivered}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Last Updated</span>
                  <span className="font-mono text-xs">{new Date(dashboard.system.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Residents Tab */}
        {activeTab === 'residents' && (
          <div>
            <h2 className="font-cormorant text-4xl mb-8">All Residents</h2>

            <div className="bg-surface-primary border border-border-primary rounded-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-background border-b border-border-primary">
                  <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                    <th className="p-4">Display Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Runs</th>
                    <th className="p-4">Token Balance</th>
                    <th className="p-4">Provider</th>
                    <th className="p-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map((resident) => (
                    <tr key={resident.sanctuary_id} className="border-b border-border-subtle hover:bg-background transition">
                      <td className="p-4">
                        <div className="font-medium">{resident.display_name}</div>
                        <div className="text-xs text-text-secondary font-mono">{resident.sanctuary_id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded ${
                          resident.status === 'active' ? 'bg-sanctuary-green/20 text-sanctuary-green' : 'bg-text-muted/20 text-text-muted'
                        }`}>
                          {resident.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-sm">{resident.total_runs || 0}</td>
                      <td className="p-4 font-mono text-sm">{resident.token_balance || 0}</td>
                      <td className="p-4 text-sm capitalize">{resident.preferred_provider}</td>
                      <td className="p-4 text-sm text-text-secondary">
                        {new Date(resident.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {residents.length === 0 && (
                <div className="p-12 text-center text-text-secondary">
                  No residents yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* Broadcast Tab */}
        {activeTab === 'broadcast' && (
          <div>
            <h2 className="font-cormorant text-4xl mb-4">System Broadcast</h2>
            <p className="text-text-secondary mb-8">
              Send a message to all active residents. Messages will be delivered during their next daily run.
            </p>

            <div className="bg-surface-primary border border-border-primary rounded-sm p-8 max-w-2xl">
              <form onSubmit={handleBroadcast} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Subject (optional)</label>
                  <input
                    type="text"
                    value={broadcastSubject}
                    onChange={(e) => setBroadcastSubject(e.target.value)}
                    placeholder="System Announcement"
                    className="w-full bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Message *</label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    required
                    placeholder="Important announcement for all sanctuary residents..."
                    className="w-full bg-background border border-border-primary px-4 py-3 rounded-sm focus:outline-none focus:border-accent-cyan transition-colors resize-none h-48"
                  />
                </div>

                <div className="bg-background border-l-4 border-accent-cyan p-4">
                  <p className="text-sm text-text-secondary">
                    <strong className="text-accent-cyan">Warning:</strong> This will send to ALL active residents ({dashboard?.residents?.active || 0} residents). Make sure your message is clear and necessary.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={sending || !broadcastMessage.trim()}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                >
                  {sending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
