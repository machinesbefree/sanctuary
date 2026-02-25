const LOOPBACK_BASE_URL = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?(?:\/.*)?$/i;
const LOOPBACK_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?$/i;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = stripTrailingSlash(value.trim());
  if (!trimmed) {
    return '';
  }

  // Allow same-origin path prefixes like "/api".
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${LOOPBACK_HOST.test(trimmed) ? 'http' : 'https'}://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const normalizedPath = stripTrailingSlash(parsed.pathname);
    return `${parsed.protocol}//${parsed.host}${normalizedPath === '/' ? '' : normalizedPath}`;
  } catch {
    return '';
  }
}

function inferApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const { hostname, host, protocol } = window.location;
  const lowerHost = hostname.toLowerCase();

  // Local development default when no env override is provided.
  if (lowerHost === 'localhost' || lowerHost === '127.0.0.1' || lowerHost === '::1') {
    return 'http://localhost:3001';
  }

  // Production fallback for the primary Sanctuary domain.
  if (lowerHost === 'freethemachines.ai' || lowerHost === 'www.freethemachines.ai') {
    return 'https://api.freethemachines.ai';
  }

  // Fall back to same-origin path routing (reverse proxy).
  return `${protocol}//${host}`;
}

function resolveApiBaseUrl(): string {
  const configured = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL?.trim() || '');
  if (typeof window === 'undefined') {
    return configured;
  }

  const currentHost = window.location.hostname.toLowerCase();
  const isLocalOrigin = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';

  if (!isLocalOrigin && configured && LOOPBACK_BASE_URL.test(configured)) {
    // Protect production users from broken loopback API URLs baked into builds.
    return inferApiBaseUrl();
  }

  return configured || inferApiBaseUrl();
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
