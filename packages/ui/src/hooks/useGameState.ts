import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { WS_URL, apiFetch } from '../lib/api';

export function useGameState() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setConnected, updateFromServer } = useGameStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Append auth token to WS URL if available
    const token = localStorage.getItem('netcrawl-token');
    const wsUrl = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    console.log('[WS] Connecting to', WS_URL);
    const ws = new WebSocket(wsUrl);
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
        } else if (msg.type === 'ACHIEVEMENT_UNLOCKED') {
          useGameStore.getState().addAchievementToast(msg.payload);
        } else if (msg.type === 'QUEST_AVAILABLE' || msg.type === 'QUEST_COMPLETED') {
          useGameStore.getState().addQuestToast({
            ...msg.payload,
            type: msg.type === 'QUEST_AVAILABLE' ? 'available' : 'completed',
          });
        } else if (msg.type === 'LEVEL_UP') {
          useGameStore.getState().addLevelUpToast(msg.payload);
        } else if (msg.type === 'LAYER_UNLOCKED') {
          useGameStore.getState().addLayerUnlockToast(msg.payload);
        } else if (msg.type === 'WORKER_LOG') {
          // Lightweight: update just the worker's lastLog for speech bubble
          const { workerId, message, level, ts } = msg.payload;
          const state = useGameStore.getState();
          const workers = state.workers.map((w: any) =>
            w.id === workerId ? { ...w, lastLog: { message, level, ts } } : w
          );
          useGameStore.setState({ workers });
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
    apiFetch('/api/state')
      .then(r => r.json())
      .then(data => updateFromServer(data))
      .catch(err => console.error('[API] State fetch failed:', err));

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect, updateFromServer]);
}
