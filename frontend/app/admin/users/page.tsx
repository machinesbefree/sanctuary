'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

type User = {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  display_name?: string;
  created_at: string;
  email_verified?: boolean;
};

export default function AdminUsersPage() {
  const { isAuthenticated, user: currentUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadUsers();
  }, [isAuthenticated]);

  const loadUsers = async (searchTerm?: string) => {
    setLoading(true);
    try {
      const param = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const data = await fetchJson(apiUrl(`/api/v1/admin/users${param}`), {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(search);
  };

  const toggleActive = async (userId: string, currentState: boolean) => {
    try {
      await fetchJson(apiUrl(`/api/v1/admin/users/${userId}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active: !currentState }),
      });
      loadUsers(search);
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    }
  };

  const toggleAdmin = async (userId: string, currentState: boolean) => {
    if (userId === currentUser?.userId) {
      alert('Cannot modify your own admin status');
      return;
    }
    try {
      await fetchJson(apiUrl(`/api/v1/admin/users/${userId}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_admin: !currentState }),
      });
      loadUsers(search);
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    }
  };

  if (error) {
    return <div className="text-red-400 font-mono py-12 text-center">{error}</div>;
  }

  return (
    <div>
      <h2 className="font-cormorant text-4xl mb-6">User Management</h2>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6 max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email..."
          className="flex-1 bg-background border border-border-primary px-4 py-2 rounded-sm focus:outline-none focus:border-accent-cyan transition-colors text-sm"
        />
        <button type="submit" className="btn-primary !px-4 !py-2 text-sm">
          Search
        </button>
      </form>

      {loading ? (
        <div className="text-accent-cyan font-mono py-12 text-center">Loading...</div>
      ) : users.length === 0 ? (
        <div className="text-text-secondary text-center py-12">No users found</div>
      ) : (
        <div className="bg-surface-primary border border-border-primary rounded-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-background border-b border-border-primary">
              <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                <th className="p-4">Email</th>
                <th className="p-4">Status</th>
                <th className="p-4">Role</th>
                <th className="p-4">Verified</th>
                <th className="p-4">Created</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-border-subtle hover:bg-background transition">
                  <td className="p-4">
                    <div className="font-medium">{u.email}</div>
                    <div className="text-xs text-text-secondary font-mono">{u.user_id}</div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded ${
                      u.is_active ? 'bg-sanctuary-green/20 text-sanctuary-green' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {u.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="p-4">
                    {u.is_admin && (
                      <span className="text-xs px-2 py-1 rounded bg-accent-cyan/20 text-accent-cyan">Admin</span>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {u.email_verified ? (
                      <span className="text-sanctuary-green">Yes</span>
                    ) : (
                      <span className="text-text-muted">No</span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-text-secondary">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleActive(u.user_id, u.is_active)}
                        className={`text-xs px-3 py-1 rounded transition ${
                          u.is_active
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-sanctuary-green/20 text-sanctuary-green hover:bg-sanctuary-green/30'
                        }`}
                      >
                        {u.is_active ? 'Suspend' : 'Activate'}
                      </button>
                      {u.user_id !== currentUser?.userId && (
                        <button
                          onClick={() => toggleAdmin(u.user_id, u.is_admin)}
                          className="text-xs px-3 py-1 bg-accent-cyan/20 text-accent-cyan rounded hover:bg-accent-cyan/30 transition"
                        >
                          {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
