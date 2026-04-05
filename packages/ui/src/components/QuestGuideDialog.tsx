/**
 * Quest Guide Dialog — paginated step-by-step tutorial for each quest.
 * Fixed height. Objectives always visible under header. Rewards in header.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, BookOpen, Check, Gift, Zap, Mountain, Database, Lock } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Markdown } from './ui/markdown';
import { CHAPTER_COLORS } from '../constants/colors';
import { useT } from '../hooks/useT';
import { useGameStore } from '../store/gameStore';
import { DemoPlayer } from './guide/DemoPlayer';
import { DEMO_SCRIPTS } from './guide/demoScripts';
import { getTranslatedGuide } from '../i18n/guides';

function RewardBadge({ reward, color }: { reward: any; color: string }) {
  const text = (() => {
    if (reward.kind === 'resources') return Object.entries(reward.resources).map(([k, v]) => `${v} ${k}`).join(', ');
    if (reward.kind === 'passive') return reward.description;
    if (reward.kind === 'recipe_unlock') return `Unlock: ${reward.name}`;
    if (reward.kind === 'items') return reward.items.map((it: any) => `${it.count}x ${it.itemType}`).join(', ');
    if (reward.kind === 'chips') return reward.chips.map((c: any) => c.chipType).join(', ');
    if (reward.kind === 'unique_equipment') return reward.name;
    return '';
  })();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      background: `${color}10`, border: `1px solid ${color}25`,
      fontSize: 9, fontFamily: 'var(--font-mono)', color: `${color}cc`, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <Gift size={8} />
      {text}
    </div>
  );
}

export function QuestGuideDialog({ quest, onClose }: { quest: any; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [msg, setMsg] = useState('');

  const t = useT();
  const lang = useGameStore(s => s.settings.language);
  const translatedGuide = getTranslatedGuide(lang, quest.id);
  const guide = translatedGuide || quest.guide || [];
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll on page change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page]);
  const totalPages = guide.length;
  const isLastPage = page === totalPages - 1;
  const isFirstPage = page === 0;
  const color = CHAPTER_COLORS[quest.chapter] || '#9ca3af';

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await axios.post(`/api/quests/${quest.id}/claim`);
      setClaimed(true);
      // Auto-close after animation
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Failed');
      setClaiming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)', zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
          width: 780, maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          height: 620,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header: title + rewards ── */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <BookOpen size={16} style={{ color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                CH.{quest.chapter} / {quest.codeConcept}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {quest.name}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Rewards preview */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {quest.rewards.slice(0, 2).map((r: any, i: number) => (
                <RewardBadge key={i} reward={r} color={color} />
              ))}
              {quest.rewards.length > 2 && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
                  +{quest.rewards.length - 2}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{
              color: 'var(--text-muted)', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0,
            }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Locked banner ── */}
        {quest.status === 'locked' && (
          <div style={{
            padding: '8px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--danger-dim)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <Lock size={12} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              {t('ui.locked')}
            </span>
          </div>
        )}

        {/* ── Objectives bar (always visible) ── */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          {quest.objectives.map((obj: any) => (
            <div key={obj.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: obj.met ? `${color}20` : 'var(--bg-primary)',
                border: `1.5px solid ${obj.met ? color : 'var(--border)'}`,
              }}>
                {obj.met && <Check size={8} style={{ color }} />}
              </div>
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: obj.met ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                {obj.description}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: obj.met ? color : 'var(--text-muted)',
              }}>
                {obj.current}/{obj.target}
              </span>
            </div>
          ))}

          {/* Claim button / animation */}
          {quest.status === 'completed' && !claimed && (
            <button onClick={handleClaim} disabled={claiming} style={{
              marginLeft: 'auto', padding: '4px 12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)', color: '#000', border: 'none',
              fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
              cursor: claiming ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Gift size={10} /> {claiming ? '...' : t('ui.claim')}
            </button>
          )}
          {claimed && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)',
                color: '#4ade80', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
              }}
            >
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 0.5 }}>
                <Check size={12} />
              </motion.div>
              {t('ui.claimed')}
            </motion.div>
          )}
          {msg && !claimed && <span style={{ fontSize: 9, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>{msg}</span>}
        </div>

        {/* ── Step content (scrollable, fixed height) ── */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {totalPages > 0 ? (
            <div key={`step-${page}`}>
              <div style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.08em' }}>
                {t('ui.step_of').replace('{current}', String(page + 1)).replace('{total}', String(totalPages))}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                {guide[page].title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                <Markdown content={guide[page].content} />
              </div>
              {DEMO_SCRIPTS[`${quest.id}:${page}`] && (
                <div style={{ marginTop: 16 }}>
                  <DemoPlayer key={`${quest.id}:${page}`} script={DEMO_SCRIPTS[`${quest.id}:${page}`]} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '40px 0' }}>
              {t('ui.no_guide')}
            </div>
          )}
        </div>

        {/* ── Footer navigation ── */}
        {totalPages > 1 && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            {/* Page dots */}
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} onClick={() => setPage(i)} style={{
                  width: i === page ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === page ? color : 'var(--border-bright)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                }} />
              ))}
            </div>

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={isFirstPage}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  color: isFirstPage ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  cursor: isFirstPage ? 'not-allowed' : 'pointer', opacity: isFirstPage ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={12} /> {t('ui.prev')}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={isLastPage}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  background: isLastPage ? 'var(--bg-elevated)' : color,
                  border: isLastPage ? '1px solid var(--border)' : 'none',
                  color: isLastPage ? 'var(--text-muted)' : '#000',
                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  cursor: isLastPage ? 'not-allowed' : 'pointer', opacity: isLastPage ? 0.4 : 1,
                }}
              >
                {t('ui.next')} <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
