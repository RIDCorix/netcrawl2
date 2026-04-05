/**
 * API configuration — handles both local dev (Vite proxy) and cloud (Railway) modes.
 *
 * Local dev:  VITE_API_URL not set → relative URLs via Vite proxy
 * Cloud:      VITE_API_URL = 'https://your-railway-app.railway.app'
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

export const WS_URL = (() => {
  if (import.meta.env.VITE_API_URL) {
    const url = new URL(import.meta.env.VITE_API_URL);
    const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${url.host}/ws`;
  }
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${window.location.host}/ws`;
})();

/** Server URL for display in ConnectDialog */
export const SERVER_URL = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.host}`;

/** Fetch wrapper — prepends API_BASE and adds auth token */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('netcrawl-token');
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
