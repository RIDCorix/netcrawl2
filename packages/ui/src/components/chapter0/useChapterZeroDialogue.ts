import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Sequential dialogue queue with manual advance and no auto-play.
 *
 * - `messages` is the full list of narrator lines to play, in order.
 * - The consumer calls `advance()` (from click / keydown) to reveal the next
 *   character group; once a line is fully revealed, calling `advance()` again
 *   moves to the next line. `advance()` on the last fully-revealed line does
 *   nothing.
 * - `prefers-reduced-motion` shows each line instantly.
 */
export function useChapterZeroDialogue(messages: string[], reducedMotion: boolean) {
  const [index, setIndex] = useState(0);
  const [charsShown, setCharsShown] = useState(0);

  useEffect(() => {
    setIndex(0);
    setCharsShown(reducedMotion ? (messages[0]?.length ?? 0) : 0);
  }, [messages, reducedMotion]);

  const current = messages[index] ?? '';
  const lineFullyShown = charsShown >= current.length;
  const done = index >= messages.length - 1 && lineFullyShown;

  const advance = useCallback(() => {
    if (!current) return;
    if (!lineFullyShown) {
      setCharsShown(current.length);
      return;
    }
    if (index < messages.length - 1) {
      setIndex(i => i + 1);
      setCharsShown(reducedMotion ? (messages[index + 1]?.length ?? 0) : 0);
    }
  }, [current, lineFullyShown, index, messages, reducedMotion]);

  // Typewriter tick — only progresses when NOT reduced motion and there's more to reveal.
  useEffect(() => {
    if (reducedMotion) return;
    if (!current) return;
    if (charsShown >= current.length) return;
    const id = window.setTimeout(() => setCharsShown(n => Math.min(n + 1, current.length)), 35);
    return () => window.clearTimeout(id);
  }, [current, charsShown, reducedMotion]);

  const state = useMemo(
    () => ({
      currentLine: current,
      charsShown,
      lineFullyShown,
      done,
      index,
      totalLines: messages.length,
    }),
    [current, charsShown, lineFullyShown, done, index, messages.length],
  );

  return { ...state, advance };
}
