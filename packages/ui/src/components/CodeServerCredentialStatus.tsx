import type { CodeServerCredentialError } from '../hooks/useCodeServerCredentials';
import { useT } from '../hooks/useT';

export function CodeServerCredentialStatus({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: CodeServerCredentialError;
  retry: () => void;
}) {
  const t = useT();
  if (loading) {
    return (
      <p
        data-code-server-credential-state="loading"
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}
      >
        {t('connect.credential_loading')}
      </p>
    );
  }
  if (!error) return null;

  const sessionExpired = error === 'session_expired';
  const handleRetry = () => {
    if (sessionExpired) window.location.reload();
    else retry();
  };
  return (
    <div data-code-server-credential-state={error} style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, color: 'var(--danger)', margin: '0 0 8px' }}>
        {t(sessionExpired ? 'connect.session_expired' : 'connect.credential_unavailable')}
      </p>
      <button type="button" onClick={handleRetry} style={{ fontSize: 11, cursor: 'pointer' }}>
        {t(sessionExpired ? 'connect.sign_in_again' : 'connect.retry')}
      </button>
    </div>
  );
}
