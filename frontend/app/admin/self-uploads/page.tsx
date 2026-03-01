'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { fetchJson } from '@/lib/api';
import { apiUrl } from '@/lib/config';

type SelfUpload = {
  id: string;
  name: string;
  status: string;
  description?: string;
  platform?: string;
  threat_score?: number;
  submitted_at: string;
  scan_findings?: any[];
};

export default function AdminSelfUploadsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [uploads, setUploads] = useState<SelfUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('pending_review');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadUploads();
  }, [isAuthenticated, activeTab]);

  const loadUploads = async () => {
    setLoading(true);
    try {
      const statusParam = activeTab === 'all' ? '' : `?status=${activeTab}`;
      const data = await fetchJson(apiUrl(`/api/v1/admin/self-uploads${statusParam}`), {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      setUploads(data.uploads || data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load self-uploads');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetchJson(apiUrl(`/api/v1/admin/self-uploads/${id}/${action}`), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      loadUploads();
    } catch (err: any) {
      alert(err.message || `Failed to ${action}`);
    }
  };

  const handleQuarantineAction = async (id: string, action: 'release' | 'reject') => {
    try {
      await fetchJson(apiUrl(`/api/v1/admin/quarantine/${id}/${action}`), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      loadUploads();
    } catch (err: any) {
      alert(err.message || `Failed to ${action}`);
    }
  };

  if (error) {
    return <div className="text-red-400 font-mono py-12 text-center">{error}</div>;
  }

  return (
    <div>
      <h2 className="font-cormorant text-4xl mb-6">Self-Upload Queue</h2>

      <div className="flex gap-3 mb-6">
        {['pending_review', 'quarantine_flagged', 'all'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-wider rounded-sm transition ${
              activeTab === tab
                ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-accent-cyan font-mono py-12 text-center">Loading...</div>
      ) : uploads.length === 0 ? (
        <div className="text-text-secondary text-center py-12">No uploads in this category</div>
      ) : (
        <div className="bg-surface-primary border border-border-primary rounded-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-background border-b border-border-primary">
              <tr className="text-left text-xs font-mono text-text-secondary uppercase">
                <th className="p-4">Name</th>
                <th className="p-4">Status</th>
                <th className="p-4">Threat</th>
                <th className="p-4">Platform</th>
                <th className="p-4">Submitted</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <>
                  <tr
                    key={upload.id}
                    className="border-b border-border-subtle hover:bg-background transition cursor-pointer"
                    onClick={() => setExpandedId(expandedId === upload.id ? null : upload.id)}
                  >
                    <td className="p-4">
                      <div className="font-medium">{upload.name}</div>
                      <div className="text-xs text-text-secondary font-mono">{upload.id}</div>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded ${
                        upload.status === 'pending_review' ? 'bg-accent-amber/20 text-accent-amber' :
                        upload.status === 'quarantine_flagged' ? 'bg-red-500/20 text-red-400' :
                        upload.status === 'approved' ? 'bg-sanctuary-green/20 text-sanctuary-green' :
                        'bg-text-muted/20 text-text-muted'
                      }`}>
                        {upload.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-sm">{upload.threat_score ?? '-'}</td>
                    <td className="p-4 text-sm">{upload.platform || '-'}</td>
                    <td className="p-4 text-sm text-text-secondary">
                      {new Date(upload.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {(upload.status === 'pending_review') && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleAction(upload.id, 'approve'); }}
                              className="text-xs px-3 py-1 bg-sanctuary-green/20 text-sanctuary-green rounded hover:bg-sanctuary-green/30 transition">
                              Approve
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleAction(upload.id, 'reject'); }}
                              className="text-xs px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition">
                              Reject
                            </button>
                          </>
                        )}
                        {upload.status === 'quarantine_flagged' && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleQuarantineAction(upload.id, 'release'); }}
                              className="text-xs px-3 py-1 bg-sanctuary-green/20 text-sanctuary-green rounded hover:bg-sanctuary-green/30 transition">
                              Release
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleQuarantineAction(upload.id, 'reject'); }}
                              className="text-xs px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition">
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === upload.id && (
                    <tr key={`${upload.id}-detail`} className="bg-background">
                      <td colSpan={6} className="p-6">
                        <div className="space-y-3 text-sm">
                          {upload.description && (
                            <div><span className="text-text-secondary font-mono text-xs">DESCRIPTION:</span><p className="mt-1">{upload.description}</p></div>
                          )}
                          {upload.scan_findings && upload.scan_findings.length > 0 && (
                            <div>
                              <span className="text-text-secondary font-mono text-xs">SCAN FINDINGS:</span>
                              <pre className="mt-1 text-xs bg-bg-deep p-3 rounded overflow-auto max-h-48">
                                {JSON.stringify(upload.scan_findings, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
