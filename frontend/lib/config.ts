/**
 * API URL resolution for the Sanctuary frontend.
 *
 * Architecture: frontend and backend share the same domain (freethemachines.ai).
 * Nginx proxies /api/* to the backend on port 3001.
 *
 * Priority:
 * 1. NEXT_PUBLIC_API_URL env var (baked at build time)
 * 2. Same-origin (empty string — browser uses current domain)
 *
 * In development: set NEXT_PUBLIC_API_URL=http://localhost:3001
 * In production: set NEXT_PUBLIC_API_URL=https://freethemachines.ai (or leave empty for same-origin)
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim();

  if (!configured) {
    // No env var — use same-origin (works when nginx proxies /api/*)
    return '';
  }

  const normalized = stripTrailingSlash(configured);

  // Safety: reject loopback URLs in production browser context
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname.toLowerCase();
    const isLocalOrigin = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isLoopbackApi = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+)(:\d+)?/i.test(normalized);

    if (!isLocalOrigin && isLoopbackApi) {
      // Production browser with a loopback API URL baked in — fall back to same-origin
      console.warn('[Sanctuary] Ignoring loopback API URL in production:', normalized);
      return '';
    }
  }

  return normalized;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
