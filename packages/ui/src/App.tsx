import './lib/axiosConfig'; // must be first — configures axios base URL + auth
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useCallback, useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { useGameStore } from './store/gameStore';
import { ResourceBar } from './components/ResourceBar';
import { GameGraph } from './components/graph/GameGraph';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { WorkerListPanel } from './components/WorkerListPanel';
import { WorkerDetailPanel } from './components/WorkerDetailPanel';
import { InventoryPanel } from './components/InventoryPanel';
import { AchievementToast } from './components/AchievementToast';
import { AchievementsPanel } from './components/AchievementsPanel';
import { QuestTree } from './components/QuestTree';
import { QuestToast } from './components/QuestToast';
import { ActiveQuestsPanel } from './components/ActiveQuestsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { WikiDialog } from './components/WikiDialog';
import { ConnectDialog } from './components/ConnectDialog';
import { LoginPage } from './components/LoginPage';
import { LevelPanel } from './components/LevelPanel';
import { LevelUpToast } from './components/LevelUpToast';
import { TutorialOverlay } from './components/TutorialOverlay';
import { ChapterZeroRepl } from './components/ChapterZeroRepl';
import { LayerSelectScreen } from './components/LayerSelectScreen';
import { LayerUnlockToast } from './components/LayerUnlockToast';
import { GameOverDialog } from './components/GameOverDialog';
import { DevConsole } from './components/DevConsole';
import { useAudioInit } from './hooks/useAudio';
import { apiFetch } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

// Cloud mode: when VITE_API_URL is set, require auth
const IS_CLOUD = !!import.meta.env.VITE_API_URL;

// Apply saved theme on startup
const _savedSettings = (() => {
  try {
    return JSON.parse(localStorage.getItem('netcrawl-settings') || '{}');
  } catch {
    return {};
  }
})();
document.documentElement.setAttribute('data-theme', _savedSettings.theme || 'deep-space');

type TutorialGuardState = {
  active: true;
  phase: 'hello' | 'miner';
  stage: string;
  setupGate?: boolean;
  setupGateTransition?: boolean;
} | null;

/** Keep tutorial state mutations inside the current stage allowlist. */
function ChapterZeroInteractionGuard() {
  const [tutorial, setTutorial] = useState<TutorialGuardState>(null);

  useEffect(() => {
    const onMode = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setTutorial(detail?.active ? detail : null);
    };
    window.addEventListener('chapter-zero-deploy-mode', onMode);
    return () => window.removeEventListener('chapter-zero-deploy-mode', onMode);
  }, []);

  useEffect(() => {
    if (!tutorial) {
      delete document.documentElement.dataset.chapterZeroTutorial;
      return;
    }

    document.documentElement.dataset.chapterZeroTutorial = tutorial.stage;
    const isAllowed = (target: EventTarget | null, eventType?: string): boolean => {
      if (!(target instanceof Element)) return false;
      if (
        (eventType === 'pointerdown' || eventType === 'click') &&
        target.matches('.react-flow__pane')
      ) {
        return true;
      }
      if (target.closest('[data-tutorial-surface], [data-tutorial-dialog], [data-tutorial-allowed]')) return true;
      const setupSurfaceAllowed = tutorial.setupGate || tutorial.setupGateTransition;
      if (setupSurfaceAllowed && target.closest('[data-tutorial-setup], [data-quest-guide], [data-tutorial="quests-btn"]')) return true;
      if (target.closest('[data-tutorial-target="hub"], [data-tutorial="hub-node"], [data-tutorial-target="deploy"]')) {
        return !setupSurfaceAllowed && (tutorial.stage === 'hello_preview' || tutorial.stage === 'miner_preview');
      }
      if (tutorial.stage === 'miner_edge_select' && target.closest('.edge-selectable')) return true;
      if (tutorial.stage === 'hello_log' && target.closest('[data-tutorial-worker-log]')) return true;
      return false;
    };
    const blockOutside = (event: Event) => {
      if (isAllowed(event.target, event.type)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const containFocus = (event: FocusEvent) => {
      if (isAllowed(event.target)) return;
      const next = document.querySelector<HTMLElement>(
        '[data-tutorial-dialog] [data-deploy-initial-focus], [data-tutorial-dialog], [data-tutorial-surface] button:not([disabled]), [data-tutorial-surface]',
      );
      next?.focus();
    };

    document.addEventListener('pointerdown', blockOutside, true);
    document.addEventListener('click', blockOutside, true);
    document.addEventListener('keydown', blockOutside, true);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      document.removeEventListener('pointerdown', blockOutside, true);
      document.removeEventListener('click', blockOutside, true);
      document.removeEventListener('keydown', blockOutside, true);
      document.removeEventListener('focusin', containFocus, true);
      delete document.documentElement.dataset.chapterZeroTutorial;
    };
  }, [tutorial]);

  return null;
}

function GameView() {
  useGameState();
  useAudioInit();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;

    const state = useGameStore.getState();
    const { keybindings } = state.settings;

    if (e.key === 'Escape') {
      if (state.settingsOpen) {
        state.toggleSettings();
        return;
      }
      if (state.inventoryOpen) {
        state.toggleInventory();
        return;
      }
      if (state.achievementsOpen) {
        state.toggleAchievements();
        return;
      }
      if (state.questsOpen) {
        state.toggleQuests();
        return;
      }
      if (state.levelOpen) {
        state.toggleLevel();
        return;
      }
      if (state.docsOpen) {
        state.closeWiki();
        return;
      }
      state.toggleSettings();
      return;
    }

    const actions: Record<string, () => void> = {
      inventory: state.toggleInventory,
      achievements: state.toggleAchievements,
      quests: state.toggleQuests,
      level: state.toggleLevel,
      settings: state.toggleSettings,
    };

    for (const [action, key] of Object.entries(keybindings)) {
      if (action === 'settings') continue;
      if (e.key === key || e.key === key.toUpperCase()) {
        actions[action]?.();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'var(--bg-primary)',
        position: 'relative',
      }}
    >
      <ChapterZeroInteractionGuard />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(0, 212, 170, 0.03) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <ResourceBar />
      <div style={{ paddingTop: 64, height: '100%', position: 'relative' }}>
        <GameGraph />
      </div>
      <ActiveQuestsPanel />
      <NodeDetailPanel />
      <WorkerDetailPanel />
      <WorkerListPanel />
      <InventoryPanel />
      <AchievementsPanel />
      <SettingsPanel />
      <WikiDialog />
      <ConnectDialog />
      <QuestTree />
      <LevelPanel />
      <AchievementToast />
      <QuestToast />
      <LevelUpToast />
      <TutorialOverlay />
      <ChapterZeroRepl />
      <LayerSelectScreen />
      <LayerUnlockToast />
      <GameOverDialog />
      <DevConsole />
    </div>
  );
}

function AuthGate() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('netcrawl-token');
    if (!token) {
      setChecking(false);
      return;
    }

    // Verify token is still valid
    apiFetch('/api/auth/me')
      .then(r => {
        setAuthed(r.ok);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  if (checking) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#4b6479',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Connecting...
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return <GameView />;
}

export function App() {
  return <QueryClientProvider client={queryClient}>{IS_CLOUD ? <AuthGate /> : <GameView />}</QueryClientProvider>;
}

export default App;
