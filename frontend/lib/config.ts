export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
