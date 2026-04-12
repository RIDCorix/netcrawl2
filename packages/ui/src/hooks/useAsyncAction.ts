/**
 * useAsyncAction — eliminates repeated try/catch/loading/message boilerplate
 * across NodeDetailPanel, InventoryPanel, DeployDialog, etc.
 *
 * Usage:
 *   const gather = useAsyncAction(
 *     () => axios.post('/api/gather', { nodeId }),
 *     { successMsg: '+10 gathered!' }
 *   );
 *   <button onClick={gather.run} disabled={gather.loading}>Gather</button>
 *   {gather.msg && <StatusMessage msg={gather.msg} />}
 */

import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const MSG_TIMEOUT_MS = 2000;

interface UseAsyncActionOptions {
  /** Message shown on success. Can be a string or a function receiving the response data. */
  successMsg?: string | ((data: any) => string);
  /** Fallback error message when the server doesn't return one. */
  fallbackError?: string;
  /** How long the success message stays visible (ms). Default 2000. */
  msgDuration?: number;
  /** Callback after successful execution. */
  onSuccess?: (data: any) => void;
}

interface UseAsyncActionResult {
  run: (...args: any[]) => Promise<any>;
  loading: boolean;
  msg: string;
  clearMsg: () => void;
}

export function useAsyncAction(
  fn: (...args: any[]) => Promise<any>,
  opts: UseAsyncActionOptions = {},
): UseAsyncActionResult {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMsg = useCallback(() => {
    setMsg('');
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const run = useCallback(async (...args: any[]) => {
    setLoading(true);
    clearMsg();
    try {
      const res = await fn(...args);
      const data = res?.data ?? res;
      const successText = typeof opts.successMsg === 'function'
        ? opts.successMsg(data)
        : opts.successMsg || '';
      if (successText) {
        setMsg(successText);
        timerRef.current = setTimeout(() => setMsg(''), opts.msgDuration ?? MSG_TIMEOUT_MS);
      }
      opts.onSuccess?.(data);
      return data;
    } catch (err: unknown) {
      const errMsg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : err instanceof Error ? err.message : String(err);
      setMsg(errMsg || opts.fallbackError || 'Action failed');
    } finally {
      setLoading(false);
    }
  }, [fn, opts.successMsg, opts.fallbackError, opts.msgDuration, opts.onSuccess, clearMsg]);

  return { run, loading, msg, clearMsg };
}
