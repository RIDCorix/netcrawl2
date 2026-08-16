import { useEffect, useRef, useCallback } from 'react';
import { type ComputeLabRunSnapshot, type GameState, useGameStore } from '../store/gameStore';
import { WS_URL, apiFetch } from '../lib/api';

type GameMessage = { type?: string; payload?: unknown };

export function applyGameMessage(msg: GameMessage) {
  const state = useGameStore.getState();
  if (msg.type === 'STATE_UPDATE') {
    state.updateFromServer(msg.payload as Partial<GameState>);
  } else if (msg.type === 'COMPUTE_LAB_RUN') {
    state.upsertComputeLabRun(msg.payload as ComputeLabRunSnapshot);
  } else if (msg.type === 'ACHIEVEMENT_UNLOCKED') {
    state.addAchievementToast(msg.payload as Parameters<typeof state.addAchievementToast>[0]);
  } else if (msg.type === 'QUEST_AVAILABLE' || msg.type === 'QUEST_COMPLETED') {
    state.addQuestToast({
      ...(msg.payload as Omit<Parameters<typeof state.addQuestToast>[0], 'type'>),
      type: msg.type === 'QUEST_AVAILABLE' ? 'available' : 'completed',
    });
  } else if (msg.type === 'LEVEL_UP') {
    state.addLevelUpToast(msg.payload as Parameters<typeof state.addLevelUpToast>[0]);
  } else if (msg.type === 'LAYER_UNLOCKED') {
    state.addLayerUnlockToast(msg.payload as Parameters<typeof state.addLayerUnlockToast>[0]);
  } else if (msg.type === 'HUB_DEPOSIT') {
    const { goodCount, badCount } = msg.payload as { goodCount?: number; badCount?: number };
    if ((goodCount || 0) > 0 || (badCount || 0) > 0) {
      state.pushHubDeposit({ goodCount: goodCount || 0, badCount: badCount || 0 });
    }
  } else if (msg.type === 'WORKER_LOG') {
    const { workerId, message, level, ts } = msg.payload as {
      workerId: string;
      message: string;
      level: string;
      ts?: number;
    };
    const timestamp = ts ?? Date.now();
    state.appendWorkerLog(workerId, {
      message,
      level,
      created_at: new Date(timestamp).toISOString(),
    });
    if (level !== 'debug') {
      const workers = state.workers.map(w =>
        w.id === workerId ? { ...w, lastLog: { message, level, ts: timestamp } } : w,
      );
      useGameStore.setState({ workers });
    }
  }
}

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

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        applyGameMessage(msg);
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

    ws.onerror = err => {
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
