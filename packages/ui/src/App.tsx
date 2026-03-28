import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
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
  const toggleInventory = useGameStore(s => s.toggleInventory);
  const toggleAchievements = useGameStore(s => s.toggleAchievements);
  const toggleQuests = useGameStore(s => s.toggleQuests);
  const toggleSettings = useGameStore(s => s.toggleSettings);

  const keybindings = useGameStore(s => s.settings.keybindings);

  useEffect(() => {
    const actions: Record<string, () => void> = {
      inventory: toggleInventory,
      achievements: toggleAchievements,
      quests: toggleQuests,
      settings: toggleSettings,
    };

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      for (const [action, key] of Object.entries(keybindings)) {
        if (e.key === key || e.key === key.toUpperCase()) {
          actions[action]?.();
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleInventory, toggleAchievements, toggleQuests, toggleSettings, keybindings]);

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
