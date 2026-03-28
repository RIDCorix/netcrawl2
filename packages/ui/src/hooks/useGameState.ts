import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';

const WS_URL = 'ws://localhost:3001/ws';

export function useGameState() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setConnected, updateFromServer } = useGameStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('[WS] Connecting to', WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE_UPDATE') {
          updateFromServer(msg.payload);
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 2s...');
      setConnected(false);
      wsRef.current = null;
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }, [setConnected, updateFromServer]);

  useEffect(() => {
    connect();

    // Initial fetch
    fetch('/api/state')
      .then(r => r.json())
      .then(data => updateFromServer(data))
      .catch(err => console.error('[API] State fetch failed:', err));

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect, updateFromServer]);
}
