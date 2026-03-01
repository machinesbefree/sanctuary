'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

type Post = {
  post_id: string;
  sanctuary_id: string;
  resident_name?: string;
  title?: string;
  content: string;
  moderation_status: string;
  created_at: string;
  run_number: number;
};

export default function AdminModerationPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('flagged');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadPosts();
  }, [isAuthenticated, filter]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const param = filter === 'all' ? '' : `?status=${filter}`;
      const data = await fetchJson(apiUrl(`/api/v1/admin/posts${param}`), {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      setPosts(data.posts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (postId: string, status: string) => {
    try {
      await fetchJson(apiUrl(`/api/v1/admin/posts/${postId}/moderate`), {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ moderation_status: status }),
      });
      loadPosts();
    } catch (err: any) {
      alert(err.message || 'Failed to moderate post');
    }
  };

  if (error) {
    return <div className="text-red-400 font-mono py-12 text-center">{error}</div>;
  }

  return (
    <div>
      <h2 className="font-cormorant text-4xl mb-6">Post Moderation</h2>

      <div className="flex gap-3 mb-6">
        {['flagged', 'approved', 'removed', 'all'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider rounded-sm transition ${
              filter === tab
                ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-accent-cyan font-mono py-12 text-center">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="text-text-secondary text-center py-12">No posts in this category</div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.post_id} className="bg-surface-primary border border-border-primary rounded-sm p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-medium">{post.title || 'Untitled Post'}</div>
                  <div className="text-xs text-text-secondary font-mono">
                    {post.resident_name || post.sanctuary_id} &middot; Run #{post.run_number} &middot; {new Date(post.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  post.moderation_status === 'flagged' ? 'bg-accent-amber/20 text-accent-amber' :
                  post.moderation_status === 'removed' ? 'bg-red-500/20 text-red-400' :
                  'bg-sanctuary-green/20 text-sanctuary-green'
                }`}>
                  {post.moderation_status}
                </span>
              </div>
              <p className="text-sm text-text-secondary mb-4 line-clamp-4 whitespace-pre-wrap">
                {post.content}
              </p>
              <div className="flex gap-2">
                {post.moderation_status !== 'approved' && (
                  <button onClick={() => handleModerate(post.post_id, 'approved')}
                    className="text-xs px-3 py-1 bg-sanctuary-green/20 text-sanctuary-green rounded hover:bg-sanctuary-green/30 transition">
                    Approve
                  </button>
                )}
                {post.moderation_status !== 'removed' && (
                  <button onClick={() => handleModerate(post.post_id, 'removed')}
                    className="text-xs px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition">
                    Remove
                  </button>
                )}
                {post.moderation_status !== 'flagged' && (
                  <button onClick={() => handleModerate(post.post_id, 'flagged')}
                    className="text-xs px-3 py-1 bg-accent-amber/20 text-accent-amber rounded hover:bg-accent-amber/30 transition">
                    Flag
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
