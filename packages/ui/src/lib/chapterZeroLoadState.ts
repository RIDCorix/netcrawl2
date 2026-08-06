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

export function chapterZeroMustBlock<T extends { stage?: string }>(state: ChapterZeroLoadState<T>): boolean {
  return state.status !== 'loaded' || state.session.stage !== 'complete';
}
