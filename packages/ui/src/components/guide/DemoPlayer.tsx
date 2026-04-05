/**
 * DemoPlayer — Plays a demo script alongside a code block.
 *
 * Layout:
 *   ┌──────────────────┬──────────────────┐
 *   │  Code (left)     │  Graph (right)   │
 *   │  with highlight  │  with animations │
 *   ├──────────────────┴──────────────────┤
 *   │  ▶ Play  ⏸ Pause  ⏭ Step   status │
 *   └─────────────────────────────────────┘
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import { DemoGraph } from './DemoGraph';
import type { DemoScript, DemoGraphState } from './types';

// Same theme as markdown.tsx code blocks
const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.7' },
  'pre[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.7', background: 'transparent', padding: 0, margin: 0, overflow: 'visible' },
  comment: { color: 'var(--text-muted)' },
  string: { color: 'var(--color-positive, #4ade80)' },
  keyword: { color: 'var(--accent)' },
  function: { color: 'var(--color-warning, #fbbf24)' },
  number: { color: 'var(--color-warning, #f59e0b)' },
  operator: { color: 'var(--text-secondary)' },
  'class-name': { color: 'var(--accent)' },
  builtin: { color: 'var(--accent)' },
  punctuation: { color: 'var(--text-secondary)' },
  decorator: { color: 'var(--color-warning, #f59e0b)' },
  boolean: { color: 'var(--color-warning, #f59e0b)' },
};

// ── Code Block with Syntax Highlighting + Line Highlight ───────────────────

function HighlightedCode({ code, activeLine }: { code: string; activeLine: number }) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      padding: '8px 0',
      overflow: 'auto',
      height: '100%',
    }}>
      <SyntaxHighlighter
        style={codeTheme as any}
        language="python"
        PreTag="div"
        customStyle={{ background: 'transparent', padding: 0, margin: 0 }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)', fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0, "calt" 0' } }}
        showLineNumbers
        lineNumberStyle={(lineNum) => ({
          width: 28,
          minWidth: 28,
          paddingRight: 12,
          textAlign: 'right',
          color: lineNum === activeLine ? 'var(--accent)' : 'var(--text-muted)',
          userSelect: 'none',
          transition: 'color 0.2s',
        })}
        wrapLines
        lineProps={(lineNum) => ({
          style: {
            display: 'block',
            padding: '0 12px',
            background: lineNum === activeLine ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
            borderLeft: lineNum === activeLine ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'background 0.2s, border-color 0.2s',
          },
        })}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ── Playback Controls ──────────────────────────────────────────────────────

function Controls({ playing, onPlay, onPause, onStep, onReset, stepIndex, totalSteps, statusLabel }: {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  stepIndex: number;
  totalSteps: number;
  statusLabel?: string;
}) {
  const atEnd = stepIndex >= totalSteps;
  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-bright)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    transition: 'background 0.15s',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 0',
    }}>
      {atEnd ? (
        <button style={btnStyle} onClick={onReset}>
          <RotateCcw size={12} /> Reset
        </button>
      ) : playing ? (
        <button style={btnStyle} onClick={onPause}>
          <Pause size={12} /> Pause
        </button>
      ) : (
        <button style={btnStyle} onClick={onPlay}>
          <Play size={12} /> Play
        </button>
      )}
      <button
        style={{ ...btnStyle, opacity: atEnd ? 0.4 : 1, cursor: atEnd ? 'default' : 'pointer' }}
        onClick={onStep}
        disabled={atEnd}
      >
        <SkipForward size={12} /> Step
      </button>
      <span style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        marginLeft: 'auto',
      }}>
        {statusLabel || `${stepIndex}/${totalSteps}`}
      </span>
    </div>
  );
}

// ── Main DemoPlayer ────────────────────────────────────────────────────────

export function DemoPlayer({ script }: { script: DemoScript }) {
  const [stepIndex, setStepIndex] = useState(-1); // -1 = initial state
  const [playing, setPlaying] = useState(false);
  const [graphState, setGraphState] = useState<DemoGraphState>(script.initialState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = stepIndex >= 0 && stepIndex < script.steps.length
    ? script.steps[stepIndex]
    : null;

  const activeLine = currentStep?.codeLine || 0;

  // Apply step
  const applyStep = useCallback((index: number) => {
    if (index < 0 || index >= script.steps.length) return;
    const step = script.steps[index];
    setGraphState(prev => step.apply(prev));
    setStepIndex(index);
  }, [script.steps]);

  // Step forward
  const doStep = useCallback(() => {
    const next = stepIndex + 1;
    if (next < script.steps.length) {
      applyStep(next);
    } else {
      setPlaying(false);
    }
  }, [stepIndex, applyStep, script.steps.length]);

  // Auto-play
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const nextIdx = stepIndex + 1;
    if (nextIdx >= script.steps.length) {
      setPlaying(false);
      return;
    }
    const duration = currentStep?.durationMs || 1200;
    timerRef.current = setTimeout(() => doStep(), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, stepIndex, doStep, currentStep?.durationMs, script.steps.length]);

  const onPlay = () => {
    if (stepIndex >= script.steps.length - 1) {
      // Reset then play
      setGraphState(script.initialState);
      setStepIndex(-1);
      setTimeout(() => {
        applyStep(0);
        setPlaying(true);
      }, 50);
    } else {
      if (stepIndex === -1) applyStep(0);
      setPlaying(true);
    }
  };
  const onPause = () => setPlaying(false);
  const onStep_ = () => { setPlaying(false); doStep(); };
  const onReset = () => {
    setPlaying(false);
    setStepIndex(-1);
    setGraphState(script.initialState);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      width: '100%',
    }}>
      {/* Code + Graph side by side */}
      <div style={{
        display: 'flex',
        gap: 10,
        height: 260,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HighlightedCode code={script.code} activeLine={activeLine} />
        </div>
        <div style={{ width: 280, flexShrink: 0 }}>
          <DemoGraph state={graphState} />
        </div>
      </div>
      {/* Controls */}
      <Controls
        playing={playing}
        onPlay={onPlay}
        onPause={onPause}
        onStep={onStep_}
        onReset={onReset}
        stepIndex={stepIndex + 1}
        totalSteps={script.steps.length}
        statusLabel={graphState.statusLabel}
      />
    </div>
  );
}
