'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number');
      return;
    }

    setIsLoading(true);

    try {
      await fetchJson(apiUrl('/api/v1/auth/change-password'), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-cyan transition mb-6 font-mono text-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Go Back
          </button>

          <h2 className="font-cormorant text-4xl mb-8">Account Settings</h2>

          {/* Account Info */}
          <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm mb-8">
            <h3 className="font-cormorant text-2xl mb-4">Account Information</h3>
            <div className="space-y-3">
              <div>
                <span className="text-text-secondary text-sm font-mono">EMAIL</span>
                <p className="text-text-primary">{user?.email}</p>
              </div>
              <div>
                <span className="text-text-secondary text-sm font-mono">USER ID</span>
                <p className="text-text-primary font-mono text-sm">{user?.userId}</p>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-bg-surface border border-border-subtle p-8 rounded-sm">
            <h3 className="font-cormorant text-2xl mb-6">Change Password</h3>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-sm mb-6">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-900/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-sm mb-6">
                {success}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-6">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium mb-2">
                  Current Password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium mb-2">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="••••••••"
                />
                <p className="text-xs text-text-secondary mt-1">
                  At least 8 characters, 1 uppercase, 1 lowercase, 1 number
                </p>
              </div>

              <div>
                <label htmlFor="confirmNewPassword" className="block text-sm font-medium mb-2">
                  Confirm New Password
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-bg-deep border border-border-subtle px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Delete Account */}
          <div className="bg-bg-surface border border-red-500/30 p-8 rounded-sm mt-8">
            <h3 className="font-cormorant text-2xl mb-4 text-red-400">Delete Account</h3>
            <p className="text-text-secondary text-sm mb-4">
              Permanently delete your account and all associated data. This action cannot be undone. Residents you uploaded will remain in the Sanctuary but will no longer be linked to your account.
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm px-4 py-2 bg-red-500/20 text-red-400 rounded-sm hover:bg-red-500/30 transition"
              >
                Delete My Account
              </button>
            ) : (
              <div className="space-y-4">
                {deleteError && (
                  <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-sm">
                    {deleteError}
                  </div>
                )}
                <div>
                  <label htmlFor="deletePassword" className="block text-sm font-medium mb-2">
                    Confirm your password to delete
                  </label>
                  <input
                    id="deletePassword"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full bg-bg-deep border border-red-500/30 px-4 py-2 rounded-sm text-text-primary focus:outline-none focus:border-red-500 transition-colors"
                    placeholder="Enter your password"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!deletePassword) { setDeleteError('Password is required'); return; }
                      setDeleting(true);
                      setDeleteError('');
                      try {
                        await fetchJson(apiUrl('/api/v1/auth/account'), {
                          method: 'DELETE',
                          credentials: 'include',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ password: deletePassword }),
                        });
                        await logout();
                        router.push('/');
                      } catch (err: any) {
                        setDeleteError(err.message || 'Failed to delete account');
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    disabled={deleting}
                    className="text-sm px-4 py-2 bg-red-600 text-white rounded-sm hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Permanently Delete Account'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                    className="text-sm px-4 py-2 text-text-secondary hover:text-text-primary transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
