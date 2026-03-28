import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { useGameState } from './hooks/useGameState';
import { useGameStore } from './store/gameStore';
import { ResourceBar } from './components/ResourceBar';
import { GameGraph } from './components/GameGraph';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

function GameView() {
  useGameState();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

    // Read current state directly from store (no stale closures)
    const state = useGameStore.getState();
    const { keybindings } = state.settings;

    // ESC: close the topmost open dialog instead of always toggling settings
    if (e.key === 'Escape') {
      if (state.settingsOpen) { state.toggleSettings(); return; }
      if (state.inventoryOpen) { state.toggleInventory(); return; }
      if (state.achievementsOpen) { state.toggleAchievements(); return; }
      if (state.questsOpen) { state.toggleQuests(); return; }
      state.toggleSettings();
      return;
    }

    const actions: Record<string, () => void> = {
      inventory: state.toggleInventory,
      achievements: state.toggleAchievements,
      quests: state.toggleQuests,
      settings: state.toggleSettings,
    };

    for (const [action, key] of Object.entries(keybindings)) {
      if (action === 'settings') continue; // ESC handled above
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
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'var(--bg-primary)',
      position: 'relative',
    }}>
      {/* Subtle radial gradient backdrop */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0, 212, 170, 0.03) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

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
      <QuestTree />
      <AchievementToast />
      <QuestToast />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GameView />
    </QueryClientProvider>
  );
}

export default App;
