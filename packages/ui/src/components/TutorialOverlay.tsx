/**
 * TutorialOverlay — inline step-by-step onboarding guide.
 * BLOCKS all other interactions. Some steps require the user to click specific UI elements.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, BookOpen, Terminal, Cpu, Package, Zap } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';

interface TutorialStep {
  id: string;
  target?: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  icon: any;
  title: string;
  content: string;
  nextLabel?: string;
  /** If set, the "Next" button is hidden. Step advances when this condition is met. */
  waitFor?: 'questsOpen' | 'selectedQuest' | 'workerDeployed';
  /** Allow clicking only the target element (pass-through clicks to it). */
  allowTargetClick?: boolean;
  action?: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    placement: 'center',
    icon: Zap,
    title: 'tutorial.welcome.title',
    content: 'tutorial.welcome.content',
    nextLabel: 'tutorial.btn.start',
  },
  {
    id: 'open_quests',
    target: '[data-tutorial="quests-btn"]',
    placement: 'bottom',
    icon: BookOpen,
    title: 'tutorial.quests.title',
    content: 'tutorial.quests.content',
    waitFor: 'questsOpen',
    allowTargetClick: true,
  },
  {
    id: 'click_first_quest',
    target: '[data-id="q_setup"]',
    placement: 'right',
    icon: BookOpen,
    title: 'tutorial.quest_select.title',
    content: 'tutorial.quest_select.content',
    waitFor: 'selectedQuest',
    allowTargetClick: true,
  },
  {
    id: 'setup_code',
    placement: 'center',
    icon: Terminal,
    title: 'tutorial.setup.title',
    content: 'tutorial.setup.content',
    nextLabel: 'tutorial.btn.next',
    action: () => {
      // Close quest tree so user can see the game
      const state = useGameStore.getState();
      if (state.questsOpen) state.toggleQuests();
    },
  },
  {
    id: 'deploy_worker',
    target: '[data-tutorial="hub-node"]',
    placement: 'right',
    icon: Cpu,
    title: 'tutorial.deploy.title',
    content: 'tutorial.deploy.content',
    nextLabel: 'tutorial.btn.next',
  },
  {
    id: 'inventory',
    target: '[data-tutorial="inventory-btn"]',
    placement: 'bottom',
    icon: Package,
    title: 'tutorial.inventory.title',
    content: 'tutorial.inventory.content',
    nextLabel: 'tutorial.btn.done',
  },
];

const STORAGE_KEY = 'netcrawl-tutorial';

function loadTutorialState(): { step: number; dismissed: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { step: 0, dismissed: false };
  } catch {
    return { step: 0, dismissed: false };
  }
}

function saveTutorialState(state: { step: number; dismissed: boolean }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function TutorialOverlay() {
  const t = useT();
  const { workers, questsOpen, selectedQuestId } = useGameStore();
  const [tutState, setTutState] = useState(loadTutorialState);
  const [highlightRect, setHighlightRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { step, dismissed } = tutState;
  const currentStep = TUTORIAL_STEPS[step];
  const isActive = !dismissed && step < TUTORIAL_STEPS.length;

  const advance = useCallback(() => {
    const cs = TUTORIAL_STEPS[tutState.step];
    if (cs?.action) cs.action();
    setTutState(s => {
      const next = { step: s.step + 1, dismissed: s.step + 1 >= TUTORIAL_STEPS.length };
      saveTutorialState(next);
      return next;
    });
  }, [tutState.step]);

  const dismiss = useCallback(() => {
    const next = { step, dismissed: true };
    saveTutorialState(next);
    setTutState(next);
  }, [step]);

  // Auto-advance on waitFor conditions
  useEffect(() => {
    if (!isActive || !currentStep?.waitFor) return;
    if (currentStep.waitFor === 'questsOpen' && questsOpen) advance();
    if (currentStep.waitFor === 'selectedQuest' && selectedQuestId) advance();
    if (currentStep.waitFor === 'workerDeployed' && workers.length > 0) advance();
  }, [isActive, currentStep?.waitFor, questsOpen, selectedQuestId, workers.length, advance]);

  // Update highlight rect
  useEffect(() => {
    if (!isActive || !currentStep) return;
    const updateRect = () => {
      if (!currentStep.target) {
        setHighlightRect(null);
        setTooltipPos(null);
        return;
      }
      const el = document.querySelector(currentStep.target);
      if (!el) { setHighlightRect(null); setTooltipPos(null); return; }
      const rect = el.getBoundingClientRect();
      const pad = 6;
      setHighlightRect({ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
      const gap = 16;
      if (currentStep.placement === 'bottom') setTooltipPos({ top: rect.bottom + gap, left: rect.left + rect.width / 2 });
      else if (currentStep.placement === 'top') setTooltipPos({ top: rect.top - gap, left: rect.left + rect.width / 2 });
      else if (currentStep.placement === 'right') setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + gap });
      else if (currentStep.placement === 'left') setTooltipPos({ top: rect.top + rect.height / 2, left: rect.left - gap });
    };
    updateRect();
    intervalRef.current = setInterval(updateRect, 300);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, currentStep, step]);

  if (!isActive || !currentStep) return null;

  const Icon = currentStep.icon;
  const isCenter = currentStep.placement === 'center' || !currentStep.target || !tooltipPos;
  const hasNextButton = !currentStep.waitFor;

  const tooltipCard = (
    <motion.div
      key={`tooltip-${step}`}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      style={{
        background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,170,0.1)',
        width: 320, padding: '16px 20px',
        display: 'flex', flexDirection: 'column' as const, gap: 10,
        pointerEvents: 'auto' as const,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: 'rgba(0,212,170,0.15)', border: '1px solid rgba(0,212,170,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
            {t(currentStep.title) || currentStep.title}
          </span>
        </div>
        <button onClick={dismiss} title="Skip tutorial" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', borderRadius: 4 }}>
          <X size={12} />
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.7, margin: 0 }}>
        {t(currentStep.content) || currentStep.content}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 14 : 5, height: 5, borderRadius: 3,
              background: i === step ? 'var(--accent)' : i < step ? 'rgba(0,212,170,0.4)' : 'var(--border-bright)',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={dismiss} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
            {t('tutorial.btn.skip')}
          </button>
          {hasNextButton && (
            <button onClick={advance} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 800,
              color: '#000', background: 'var(--accent)', border: 'none',
              cursor: 'pointer', padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            }}>
              {t(currentStep.nextLabel || 'tutorial.btn.next')} <ChevronRight size={10} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      {/* Full-screen blocker */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Pass-through click zone for the highlighted target */}
      {currentStep.allowTargetClick && highlightRect && (
        <div style={{
          position: 'fixed',
          top: highlightRect.top, left: highlightRect.left,
          width: highlightRect.width, height: highlightRect.height,
          zIndex: 91, borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
        }} />
      )}

      <div style={{ position: 'fixed', inset: 0, zIndex: 90, pointerEvents: 'none' }}>
        {/* Highlight ring */}
        <AnimatePresence>
          {highlightRect && (
            <motion.div
              key={`highlight-${step}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                position: 'fixed', ...highlightRect,
                borderRadius: 'var(--radius-md)',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 20px rgba(0,212,170,0.4)',
                pointerEvents: 'none', zIndex: 91,
                animation: currentStep.waitFor ? 'pulse-ring 1.5s ease-in-out infinite' : undefined,
              }}
            />
          )}
        </AnimatePresence>

        {/* Tooltip */}
        <AnimatePresence mode="wait">
          {isCenter ? (
            <div key={`center-${step}`} style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 92 }}>
              {tooltipCard}
            </div>
          ) : tooltipPos ? (
            <div key={`pos-${step}`} style={{
              position: 'fixed',
              top: currentStep.placement === 'bottom' ? tooltipPos.top : currentStep.placement === 'top' ? tooltipPos.top - 180 : tooltipPos.top - 90,
              left: currentStep.placement === 'right' ? tooltipPos.left : currentStep.placement === 'left' ? tooltipPos.left - 336 : tooltipPos.left - 160,
              zIndex: 92, pointerEvents: 'none',
            }}>
              {tooltipCard}
            </div>
          ) : null}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 20px rgba(0,212,170,0.4); }
          50% { box-shadow: 0 0 30px rgba(0,212,170,0.7), 0 0 60px rgba(0,212,170,0.2); }
        }
      `}</style>
    </>
  );
}
