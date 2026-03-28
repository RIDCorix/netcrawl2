import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameState } from './hooks/useGameState';
import { ResourceBar } from './components/ResourceBar';
import { GameGraph } from './components/GameGraph';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { WorkerListPanel } from './components/WorkerListPanel';
import { InventoryPanel } from './components/InventoryPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

function GameView() {
  useGameState();

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
      <NodeDetailPanel />
      <WorkerListPanel />
      <InventoryPanel />
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
