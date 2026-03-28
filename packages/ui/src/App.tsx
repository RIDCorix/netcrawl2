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
  useGameState(); // sets up WS + initial fetch

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-primary)' }}>
      <ResourceBar />
      <div style={{ paddingTop: '60px', height: '100%' }}>
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
