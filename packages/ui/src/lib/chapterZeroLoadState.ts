export type ChapterZeroLoadState<T> = { status: 'loading' } | { status: 'loaded'; session: T } | { status: 'failed' };

export type ChapterZeroLoadAction<T> = { type: 'retry' } | { type: 'loaded'; session: T } | { type: 'failed' };

export const initialChapterZeroLoadState: ChapterZeroLoadState<never> = { status: 'loading' };

export function reduceChapterZeroLoad<T>(
  _state: ChapterZeroLoadState<T>,
  action: ChapterZeroLoadAction<T>,
): ChapterZeroLoadState<T> {
  if (action.type === 'retry') return { status: 'loading' };
  if (action.type === 'failed') return { status: 'failed' };
  return { status: 'loaded', session: action.session };
}

// Stages where the immersive full-screen overlay is NOT shown (deploy guide or done).
const CHAPTER_ZERO_NON_BLOCKING_STAGES = new Set([
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
  'edge_select',
  'pickaxe_equip',
  'deploy_confirm',
  'deploy_execute',
  'deploy_verified',
  'handoff',
]);

export function chapterZeroMustBlock<T extends { stage?: string }>(state: ChapterZeroLoadState<T>): boolean {
  if (state.status !== 'loaded') return true;
  const stage = state.session.stage ?? '';
  return !CHAPTER_ZERO_NON_BLOCKING_STAGES.has(stage);
}
