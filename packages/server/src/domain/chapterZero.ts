import { edgeExists } from '../graphUtils.js';
import { mergeItemStacks, type Item } from '../types.js';

export const CHAPTER_ZERO_COMMANDS = [
  'info()',
  'move("mine")',
  'mine()',
  'collect()',
  'move("hub")',
  'deposit()',
] as const;

export interface ChapterZeroWorld {
  worker: { nodeId: 'hub' | 'mine'; holding: Item[]; equippedPickaxe: 'pickaxe_basic'; lastLog: string | null };
  mine: { drops: Item[] };
  resources: { data: number };
}

export interface ChapterZeroSession {
  version: 2;
  step: number;
  completed: boolean;
  world: ChapterZeroWorld;
  transition: string | null;
}

export function createChapterZeroSession(completed = false): ChapterZeroSession {
  return {
    version: 2,
    step: completed ? CHAPTER_ZERO_COMMANDS.length : 0,
    completed,
    world: {
      worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
      mine: { drops: [] },
      resources: { data: 0 },
    },
    transition: null,
  };
}

export function shouldBypassChapterZero(
  questStatus: Record<string, 'locked' | 'available' | 'completed' | 'claimed'>,
): boolean {
  return Object.values(questStatus).some(status => status === 'completed' || status === 'claimed');
}

export function isChapterZeroGateOpen(session: ChapterZeroSession | undefined): boolean {
  return session?.version === 2 && session.completed;
}

type Result =
  | { ok: true; session: ChapterZeroSession }
  | { ok: false; error: 'out_of_order' | 'invalid_state'; session: ChapterZeroSession };

/** Applies production adjacency and item-stack rules inside an isolated tutorial world. */
export function applyChapterZeroCommand(current: ChapterZeroSession, command: string): Result {
  if (current.completed) return { ok: true, session: structuredClone(current) };
  const normalized = command.trim().replace(/'/g, '"');
  if (normalized !== CHAPTER_ZERO_COMMANDS[current.step]) {
    return { ok: false, error: 'out_of_order', session: structuredClone(current) };
  }

  const session = structuredClone(current);
  const worker = session.world.worker;
  const tutorialEdges = [{ id: 'tutorial-edge', source: 'hub', target: 'mine' }];

  switch (session.step) {
    case 0:
      worker.lastLog = 'Worker ready';
      session.transition = 'logged_ready';
      break;
    case 1:
      if (!edgeExists(tutorialEdges, worker.nodeId, 'mine'))
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      worker.nodeId = 'mine';
      session.transition = 'moved_to_mine';
      break;
    case 2:
      if (worker.nodeId !== 'mine' || !worker.equippedPickaxe)
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      session.world.mine.drops = mergeItemStacks(session.world.mine.drops, [{ type: 'data_fragment', count: 10 }]);
      session.transition = 'mined_data';
      break;
    case 3:
      if (worker.nodeId !== 'mine' || session.world.mine.drops.length === 0)
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      worker.holding = mergeItemStacks(worker.holding, session.world.mine.drops);
      session.world.mine.drops = [];
      session.transition = 'collected_data';
      break;
    case 4:
      if (!edgeExists(tutorialEdges, worker.nodeId, 'hub'))
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      worker.nodeId = 'hub';
      session.transition = 'returned_to_hub';
      break;
    case 5: {
      if (worker.nodeId !== 'hub' || worker.holding.length === 0)
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      const deposited = worker.holding
        .filter(item => item.type === 'data_fragment')
        .reduce((sum, item) => sum + item.count, 0);
      session.world.resources.data += deposited;
      worker.holding = [];
      session.transition = 'deposited_data';
      break;
    }
    default:
      return { ok: false, error: 'invalid_state', session: structuredClone(current) };
  }

  session.step += 1;
  session.completed = session.step >= CHAPTER_ZERO_COMMANDS.length;
  return { ok: true, session };
}
