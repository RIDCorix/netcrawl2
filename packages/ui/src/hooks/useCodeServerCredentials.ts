import { useEffect, useState } from 'react';
import { apiFetch, SERVER_URL } from '../lib/api';

type CredentialState = {
  apiKey: string;
  loading: boolean;
  error: 'session_expired' | 'unavailable' | null;
};

export type CodeServerCredentialError = CredentialState['error'];

const isCloud = Boolean(import.meta.env.VITE_API_URL);
let cachedApiKey = '';
let pendingApiKey: Promise<string> | null = null;

async function loadApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  if (!pendingApiKey) {
    pendingApiKey = apiFetch('/api/auth/code-server-token', { method: 'POST' })
      .then(async response => {
        if (response.status === 401) throw new Error('session_expired');
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (!data.token) throw new Error('unavailable');
        cachedApiKey = data.token;
        return cachedApiKey;
      })
      .finally(() => {
        pendingApiKey = null;
      });
  }
  return pendingApiKey;
}

/** Shared, in-memory connection credentials for Connect and the setup guide. */
export function useCodeServerCredentials(
  enabled = true,
): CredentialState & { serverUrl: string; requiresApiKey: boolean; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CredentialState>({
    apiKey: isCloud ? cachedApiKey : '',
    loading: isCloud && !cachedApiKey,
    error: null,
  });

  useEffect(() => {
    if (!isCloud || !enabled) return;
    let active = true;
    setState({ apiKey: cachedApiKey, loading: !cachedApiKey, error: null });
    loadApiKey().then(
      apiKey => active && setState({ apiKey, loading: false, error: null }),
      error =>
        active &&
        setState({
          apiKey: '',
          loading: false,
          error: error instanceof Error && error.message === 'session_expired' ? 'session_expired' : 'unavailable',
        }),
    );
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  const retry = () => {
    cachedApiKey = '';
    pendingApiKey = null;
    setAttempt(value => value + 1);
  };

  return { ...state, serverUrl: SERVER_URL, requiresApiKey: isCloud, retry };
}
