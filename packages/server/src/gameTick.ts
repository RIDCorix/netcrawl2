import { getGameState, saveGameState, getWorkers, incrementStat, getAllActiveUserIds, setCurrentUser } from './db.js';
import { broadcast } from './websocket.js';
import { broadcastFullState } from './broadcastHelper.js';
import { getNeighborIds } from './graphUtils.js';
import { checkAchievements } from './achievements.js';
import { tickAPINodes } from './apiNodeEngine.js';

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';

export function startGameTick() {
  setInterval(() => {
    try {
      if (isMultiUser()) {
        // Tick each active user independently
        const userIds = getAllActiveUserIds();
        for (const userId of userIds) {
          try {
            setCurrentUser(userId);
            tickUser(userId);
          } catch (err) {
            console.error(`[Tick] Error for user ${userId}:`, err);
          }
        }
      } else {
        tickUser();
      }
    } catch (err) {
      console.error('[Tick] Error:', err);
    }
  }, 1000);
}

function tickUser(userId?: string) {
  const state = getGameState(userId);
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
          console.log(`[Tick] Infection spread to ${neighborId}${userId ? ` (user ${userId})` : ''}`);
        }
      }
    }
  }

  // Check depleted nodes and recover them
  const now = Date.now();
  nodes = nodes.map((n: any) => {
    if (n.data.depleted && n.data.depletedUntil && now >= n.data.depletedUntil) {
      changed = true;
      console.log(`[Tick] Node ${n.id} recovered from depletion`);
      return {
        ...n,
        data: {
          ...n.data,
          depleted: false,
          depletedUntil: undefined,
          mineCount: 0,
        },
      };
    }
    return n;
  });

  // Check if hub is infected → game over
  const hub = nodes.find((n: any) => n.id === 'hub');
  if (hub && (hub.data.infected || hub.type === 'infected')) {
    saveGameState({ ...state, nodes, edges, resources, tick: tick + 1, gameOver: true }, userId);
    broadcastFullState(userId);
    incrementStat('total_game_overs', 1, userId);
    checkAchievements(userId);
    console.log(`[Tick] GAME OVER - Hub infected!${userId ? ` (user ${userId})` : ''}`);
    return;
  }

  saveGameState({ ...state, nodes, edges, resources, tick: tick + 1, gameOver: false }, userId);

  // Generate API requests for API nodes
  tickAPINodes();

  if (changed || tick % 5 === 0) {
    broadcastFullState(userId);
  }
}
