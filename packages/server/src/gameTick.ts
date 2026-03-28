import { getGameState, saveGameState } from './db.js';
import { broadcast } from './websocket.js';

export function startGameTick() {
  setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error('[Tick] Error:', err);
    }
  }, 1000);
}

function tick() {
  const state = getGameState();
  if (state.gameOver) return;

  let { nodes, edges, resources, tick } = state;
  let changed = false;

  // Infection spread: each infected node has 10% chance to infect each unlocked neighbor
  const infectedNodes = nodes.filter((n: any) => n.data.infected || n.type === 'infected');

  for (const infected of infectedNodes) {
    const neighborIds = getNeighborIds(edges, infected.id);
    for (const neighborId of neighborIds) {
      if (Math.random() < 0.1) {
        const neighbor = nodes.find((n: any) => n.id === neighborId);
        if (neighbor && neighbor.data.unlocked && !neighbor.data.infected && neighbor.type !== 'infected') {
          nodes = nodes.map((n: any) => {
            if (n.id === neighborId) {
              return { ...n, type: 'infected', data: { ...n.data, infected: true } };
            }
            return n;
          });
          changed = true;
          console.log(`[Tick] Infection spread to ${neighborId}`);
        }
      }
    }
  }

  // Check if hub is infected → game over
  const hub = nodes.find((n: any) => n.id === 'hub');
  if (hub && (hub.data.infected || hub.type === 'infected')) {
    saveGameState({ nodes, edges, resources, tick: tick + 1, gameOver: true });
    broadcast({ type: 'STATE_UPDATE', payload: { nodes, edges, resources, tick: tick + 1, gameOver: true } });
    console.log('[Tick] GAME OVER - Hub infected!');
    return;
  }

  saveGameState({ nodes, edges, resources, tick: tick + 1, gameOver: false });

  if (changed || tick % 5 === 0) {
    broadcast({ type: 'STATE_UPDATE', payload: { nodes, edges, resources, tick: tick + 1, gameOver: false } });
  }
}

function getNeighborIds(edges: any[], nodeId: string): string[] {
  const neighbors: string[] = [];
  for (const e of edges) {
    if (e.source === nodeId) neighbors.push(e.target);
    else if (e.target === nodeId) neighbors.push(e.source);
  }
  return neighbors;
}
