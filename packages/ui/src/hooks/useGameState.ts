import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

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
