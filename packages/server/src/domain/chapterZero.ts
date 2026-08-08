import { mergeItemStacks, type Item } from '../types.js';
import { runChapterZeroCode, type TickTrace } from './chapterZeroEval.js';

export type ChapterZeroStage =
  | 'cold_open'
  | 'voice_arrival'
  | 'choice_intro'
  | 'direct_commands'
  | 'code_editor'
  | 'complete'
  | 'hello_preview'
  | 'hello_deploy_open'
  | 'hello_deploy_confirm'
  | 'hello_deploy_execute'
  | 'hello_log'
  | 'miner_preview'
  | 'miner_deploy_open'
  | 'miner_edge_select'
  | 'miner_pickaxe_equip'
  | 'miner_deploy_confirm'
  | 'miner_deploy_execute'
  | 'handoff';

const STAGE_ORDER: ChapterZeroStage[] = [
  'cold_open',
  'voice_arrival',
  'choice_intro',
  'direct_commands',
  'code_editor',
  'complete',
  'hello_preview',
  'hello_deploy_open',
  'hello_deploy_confirm',
  'hello_deploy_execute',
  'hello_log',
  'miner_preview',
  'miner_deploy_open',
  'miner_edge_select',
  'miner_pickaxe_equip',
  'miner_deploy_confirm',
  'miner_deploy_execute',
  'handoff',
];

export interface ChapterZeroDeployState {
  grantedItems: boolean;
  selectedEdgeId: string | null;
  selectedPickaxeType: string | null;
  helloWorkerId: string | null;
  minerWorkerId: string | null;
}

export interface ChapterZeroWorld {
  worker: { nodeId: 'hub' | 'mine'; holding: Item[]; equippedPickaxe: 'pickaxe_basic'; lastLog: string | null };
  mine: { drops: Item[] };
  resources: { data: number };
  deployTutorial: ChapterZeroDeployState;
}

export interface ChapterZeroSession {
  version: 4;
  stage: ChapterZeroStage;
  step: number;
  world: ChapterZeroWorld;
  transition: string | null;
  transcript: string[];
}

export const CHOICE_INTRO_EXPECTED = 'self.info()' as const;
export const DIRECT_COMMAND_SEQUENCE = ['self.move(self.edge)', 'self.collect()'] as const;
export const INITIAL_MINE_DROPS: Item[] = [{ type: 'data_fragment', count: 3 }];
export const LOOP_MINE_DROPS: Item[] = [{ type: 'data_fragment', count: 10 }];

export const TUTORIAL_WORKER_CLASS_ID = 'tutorial_miner';

export function initialDeployState(): ChapterZeroDeployState {
  return {
    grantedItems: false,
    selectedEdgeId: null,
    selectedPickaxeType: null,
    helloWorkerId: null,
    minerWorkerId: null,
  };
}

export function createChapterZeroSession(completed = false): ChapterZeroSession {
  return {
    version: 4,
    stage: completed ? 'handoff' : 'cold_open',
    step: 0,
    world: {
      worker: { nodeId: 'hub', holding: [], equippedPickaxe: 'pickaxe_basic', lastLog: null },
      mine: { drops: [] },
      resources: { data: 0 },
      deployTutorial: initialDeployState(),
    },
    transition: null,
    transcript: [],
  };
}

const NARRATIVE_STAGES = new Set<ChapterZeroStage>([
  'cold_open',
  'voice_arrival',
  'choice_intro',
  'direct_commands',
  'code_editor',
  'complete',
]);

const LEGACY_DEPLOY_STAGES = new Set([
  'edge_select',
  'pickaxe_equip',
  'deploy_confirm',
  'deploy_execute',
  'deploy_verified',
]);

/** Migrate persisted v3 saves without reopening or prematurely completing the gate. */
export function migrateChapterZeroSession(session: unknown): ChapterZeroSession {
  const raw = structuredClone(session || {}) as any;
  const isV4Stage = raw.version === 4 && STAGE_ORDER.includes(raw.stage);
  if (isV4Stage) {
    const migrated = structuredClone(raw) as ChapterZeroSession;
    migrated.world = migrated.world || {};
    migrated.world.deployTutorial = {
      ...initialDeployState(),
      ...(migrated.world.deployTutorial || {}),
    };
    delete (migrated.world.deployTutorial as any).workerId;
    return migrated;
  }

  const migrated = createChapterZeroSession(false);
  const legacyStage = String(raw.stage || 'cold_open');
  const legacyWorld = raw.world || {};
  migrated.step = Number.isFinite(raw.step) ? raw.step : 0;
  migrated.transition = raw.transition || null;
  migrated.transcript = Array.isArray(raw.transcript) ? raw.transcript : [];
  migrated.world = {
    ...migrated.world,
    ...legacyWorld,
    worker: { ...migrated.world.worker, ...(legacyWorld.worker || {}) },
    mine: { ...migrated.world.mine, ...(legacyWorld.mine || {}) },
    resources: { ...migrated.world.resources, ...(legacyWorld.resources || {}) },
    deployTutorial: initialDeployState(),
  };

  if (legacyStage === 'handoff') {
    // A v3 handoff is already complete. Keep it complete and normalize the
    // deployment state without inventing a worker id.
    migrated.stage = 'handoff';
    migrated.world.deployTutorial.grantedItems = true;
  } else if (NARRATIVE_STAGES.has(legacyStage as ChapterZeroStage) && legacyStage !== 'complete') {
    migrated.stage = legacyStage as ChapterZeroStage;
  } else if (legacyStage === 'complete' || LEGACY_DEPLOY_STAGES.has(legacyStage)) {
    // The old deployment tail mixed HelloWorker and miner prerequisites. Restart
    // only that tail at the safe Hello preview while preserving narrative work.
    migrated.stage = 'hello_preview';
    migrated.step = 0;
    migrated.transition = null;
  } else {
    migrated.stage = 'cold_open';
    migrated.step = 0;
    migrated.transition = null;
  }

  return migrated;
}

export function shouldBypassChapterZero(
  questStatus: Record<string, 'locked' | 'available' | 'completed' | 'claimed'>,
): boolean {
  return Object.values(questStatus).some(status => status === 'completed' || status === 'claimed');
}

export function isChapterZeroGateOpen(session: ChapterZeroSession | undefined): boolean {
  if (!session || session.version !== 4) return false;
  return session.stage === 'handoff';
}

export function expectedCommand(session: ChapterZeroSession): string | null {
  if (session.stage === 'choice_intro') return CHOICE_INTRO_EXPECTED;
  if (session.stage === 'direct_commands') return DIRECT_COMMAND_SEQUENCE[session.step] ?? null;
  return null;
}

type CommandResult =
  | { ok: true; session: ChapterZeroSession }
  | { ok: false; error: 'out_of_order' | 'invalid_state'; session: ChapterZeroSession };

function normalizeCommand(command: string): string {
  return command.trim().replace(/'/g, '"').replace(/\s+/g, ' ');
}

export function applyChapterZeroCommand(current: ChapterZeroSession, command: string): CommandResult {
  const normalized = normalizeCommand(command);
  const expected = expectedCommand(current);
  if (!expected || normalized !== expected) {
    return { ok: false, error: 'out_of_order', session: structuredClone(current) };
  }

  const session = structuredClone(current);

  if (session.stage === 'choice_intro') {
    session.world.worker.lastLog = 'worker_ready';
    session.transition = 'logged_ready';
    session.step = 1;
    return { ok: true, session };
  }

  if (session.stage === 'direct_commands') {
    if (normalized === 'self.move(self.edge)') {
      const from = session.world.worker.nodeId;
      const to = from === 'hub' ? 'mine' : 'hub';
      session.world.worker.nodeId = to;
      session.transition = to === 'mine' ? 'moved_to_mine' : 'returned_to_hub';
      session.step += 1;
      session.transcript.push('>>> self.move(self.edge)', `# moved: ${from} → ${to}`);
      return { ok: true, session };
    }
    if (normalized === 'self.collect()') {
      if (session.world.worker.nodeId !== 'mine' || session.world.mine.drops.length === 0) {
        return { ok: false, error: 'invalid_state', session: structuredClone(current) };
      }
      const picked = session.world.mine.drops;
      session.world.worker.holding = mergeItemStacks(session.world.worker.holding, picked);
      const total = picked.reduce((sum, item) => sum + item.count, 0);
      session.world.mine.drops = [];
      session.transition = 'collected_data';
      session.step += 1;
      session.transcript.push('>>> self.collect()', `# collected: ${total} × data_fragment`);
      return { ok: true, session };
    }
  }

  return { ok: false, error: 'invalid_state', session: structuredClone(current) };
}

type StageResult =
  | { ok: true; session: ChapterZeroSession }
  | { ok: false; error: 'out_of_order' | 'invalid_state'; session: ChapterZeroSession };

/** Advance the client-driven stage machine, enforcing monotonic order and prerequisites. */
export function advanceChapterZeroStage(current: ChapterZeroSession, to: ChapterZeroStage): StageResult {
  const currentIdx = STAGE_ORDER.indexOf(current.stage);
  const nextIdx = STAGE_ORDER.indexOf(to);
  if (nextIdx <= currentIdx) return { ok: false, error: 'out_of_order', session: structuredClone(current) };
  if (nextIdx !== currentIdx + 1) return { ok: false, error: 'out_of_order', session: structuredClone(current) };

  if (to === 'code_editor') {
    if (
      current.stage !== 'direct_commands' ||
      current.step < DIRECT_COMMAND_SEQUENCE.length ||
      current.world.worker.holding.reduce((s, i) => s + i.count, 0) === 0
    ) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'complete') {
    const w = current.world.worker;
    if (
      current.stage !== 'code_editor' ||
      w.nodeId !== 'hub' ||
      w.holding.length !== 0 ||
      current.world.resources.data < 3
    ) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'hello_log') {
    if (current.stage !== 'hello_deploy_execute' || !current.world.deployTutorial?.helloWorkerId) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'miner_preview') {
    if (current.stage !== 'hello_log' || !current.world.deployTutorial?.helloWorkerId) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'miner_pickaxe_equip') {
    if (!current.world.deployTutorial?.selectedEdgeId) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'miner_deploy_confirm') {
    if (current.world.deployTutorial?.selectedPickaxeType !== 'pickaxe_basic') {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  if (to === 'handoff') {
    if (current.stage !== 'miner_deploy_execute' || !current.world.deployTutorial?.minerWorkerId) {
      return { ok: false, error: 'out_of_order', session: structuredClone(current) };
    }
  }

  const session = structuredClone(current);
  if (to === 'direct_commands') {
    session.world.mine.drops = mergeItemStacks(session.world.mine.drops, INITIAL_MINE_DROPS);
  }
  session.stage = to;
  session.step = 0;
  session.transition = null;
  return { ok: true, session };
}

/** Set a deploy tutorial field (edge or pickaxe) without stage change. */
export function setDeployTutorialField(
  current: ChapterZeroSession,
  field: 'selectedEdgeId' | 'selectedPickaxeType' | 'helloWorkerId' | 'minerWorkerId' | 'grantedItems',
  value: string | boolean | null,
): ChapterZeroSession {
  const session = structuredClone(current);
  if (!session.world.deployTutorial) session.world.deployTutorial = initialDeployState();
  (session.world.deployTutorial as any)[field] = value;
  return session;
}

export interface CodeRunResult {
  ok: true;
  session: ChapterZeroSession;
  ticks: TickTrace[];
  passed: boolean;
  failureReason: 'stuck_at_mine' | 'no_deposit' | 'syntax' | 'unknown_ref' | null;
}

export function runChapterZeroSandbox(current: ChapterZeroSession, onStartup: string, onLoop: string): CodeRunResult {
  if (current.stage !== 'code_editor') {
    return {
      ok: true,
      session: structuredClone(current),
      ticks: [],
      passed: false,
      failureReason: 'syntax',
    };
  }
  // The first editor checkpoint deliberately has no on_loop method. It teaches
  // returning and depositing in on_startup before the repeating lifecycle is
  // introduced. The server owns this capability boundary so stale clients
  // cannot skip it by submitting loop code early.
  const startupCheckpoint = current.step === 0;
  if (startupCheckpoint && onLoop.trim() && onLoop.trim() !== 'pass') {
    return { ok: true, session: structuredClone(current), ticks: [], passed: false, failureReason: 'syntax' };
  }
  const run = runChapterZeroCode(
    current.world,
    startupCheckpoint ? onStartup : 'pass',
    startupCheckpoint ? 'pass' : onLoop,
  );
  const session = structuredClone(current);
  session.transition = null;

  for (const tick of run.ticks) {
    session.transcript.push(`# ${tick.phase} tick ${tick.tick}`);
    for (const statement of tick.statements) {
      session.transcript.push(`>>> ${statement.expression}`);
      if (statement.error) session.transcript.push(`! ${statement.error}`);
      else if (statement.effect) session.transcript.push(`# ${statement.effect}`);
    }
  }

  if (run.fatalError) {
    // Syntax / unknown_ref: world unchanged.
    return {
      ok: true,
      session,
      ticks: run.ticks,
      passed: false,
      failureReason: run.fatalError,
    };
  }

  session.world = run.world;
  const w = session.world.worker;
  const startupPassed = w.nodeId === 'hub' && w.holding.length === 0 && session.world.resources.data >= 3;
  if (startupCheckpoint && startupPassed) {
    session.step = 1;
    session.world.mine.drops = mergeItemStacks(session.world.mine.drops, LOOP_MINE_DROPS);
    session.transition = 'startup_complete';
    return { ok: true, session, ticks: run.ticks, passed: false, failureReason: null };
  }
  const passed =
    !startupCheckpoint && w.nodeId === 'hub' && w.holding.length === 0 && session.world.resources.data >= 13;
  let failureReason: CodeRunResult['failureReason'] = null;
  if (passed) {
    session.stage = 'complete';
    session.step = 0;
    session.transition = 'chapter_zero_complete';
  } else if (w.nodeId !== 'hub') {
    // Worker never made it back — narrator says "still at the mine".
    failureReason = 'stuck_at_mine';
  } else if (w.holding.length > 0) {
    failureReason = 'no_deposit';
  } else {
    failureReason = 'stuck_at_mine';
  }

  return { ok: true, session, ticks: run.ticks, passed, failureReason };
}
