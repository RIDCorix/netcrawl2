/**
 * Quest Guide Dialog — paginated step-by-step tutorial for each quest.
 * Opened by clicking a quest in the sidebar or quest tree.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, BookOpen, Check, Gift } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';

const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80', 2: '#60a5fa', 3: '#a78bfa', 4: '#ef4444', 5: '#f59e0b', 6: '#00d4aa',
};

export function QuestGuideDialog({ quest, onClose }: { quest: any; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState('');

  const guide = quest.guide || [];
  const totalPages = guide.length + 1; // guide steps + objectives/rewards summary page
  const isLastPage = page === totalPages - 1;
  const color = CHAPTER_COLORS[quest.chapter] || '#9ca3af';

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await axios.post(`/api/quests/${quest.id}/claim`);
      setMsg('Rewards claimed!');
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Failed');
    } finally {
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
          width: 560, maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={16} style={{ color }} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                CH.{quest.chapter} / {quest.codeConcept}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {quest.name}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            color: 'var(--text-muted)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', minHeight: 250 }}>
          <AnimatePresence mode="wait">
            {page < guide.length ? (
              // Guide step page
              <motion.div
                key={`step-${page}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-mono)', marginBottom: 12, letterSpacing: '0.08em' }}>
                  STEP {page + 1} OF {guide.length}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>
                  {guide[page].title}
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                  lineHeight: 1.8, whiteSpace: 'pre-wrap',
                }}>
                  {guide[page].content.split('\n').map((line: string, i: number) => {
                    // Simple code block detection
                    const isCode = line.startsWith('  ') || line.startsWith('from ') || line.startsWith('class ') || line.startsWith('def ') || line.match(/^[a-z_]+\s*[=(]/);
                    if (isCode) {
                      return (
                        <div key={i} style={{
                          background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
                          padding: '2px 8px', margin: '2px 0',
                          fontFamily: 'var(--font-mono)', fontSize: 12,
                          color: 'var(--accent)', borderLeft: `2px solid ${color}`,
                        }}>
                          {line}
                        </div>
                      );
                    }
                    return <div key={i}>{line || <br />}</div>;
                  })}
                </div>
              </motion.div>
            ) : (
              // Summary page (objectives + rewards)
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                  OBJECTIVES
                </div>
                {quest.objectives.map((obj: any) => (
                  <div key={obj.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: obj.met ? `${color}20` : 'var(--bg-primary)',
                      border: `1.5px solid ${obj.met ? color : 'var(--border)'}`,
                    }}>
                      {obj.met && <Check size={10} style={{ color }} />}
                    </div>
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: obj.met ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {obj.description}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: obj.met ? color : 'var(--text-muted)' }}>
                      {obj.current}/{obj.target}
                    </span>
                  </div>
                ))}

                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />

                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                  REWARDS
                </div>
                {quest.rewards.map((r: any, i: number) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Gift size={12} style={{ color, flexShrink: 0 }} />
                    {r.kind === 'resources' && Object.entries(r.resources).map(([k, v]) => `${v} ${k}`).join(', ')}
                    {r.kind === 'passive' && r.description}
                    {r.kind === 'recipe_unlock' && `Unlock: ${r.name}`}
                    {r.kind === 'items' && r.items.map((it: any) => `${it.count}x ${it.itemType}`).join(', ')}
                    {r.kind === 'chips' && r.chips.map((c: any) => `${c.chipType} (${c.rarity})`).join(', ')}
                    {r.kind === 'unique_equipment' && `${r.name}`}
                  </div>
                ))}

                {/* Claim button */}
                {quest.status === 'completed' && (
                  <button onClick={handleClaim} disabled={claiming} style={{
                    padding: '12px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent)', color: '#000', border: 'none',
                    fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
                    cursor: claiming ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Gift size={14} /> {claiming ? 'Claiming...' : 'CLAIM REWARDS'}
                  </button>
                )}

                {quest.status === 'claimed' && (
                  <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                    Rewards claimed
                  </div>
                )}

                {msg && <div style={{ fontSize: 11, color: msg.includes('claimed') ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{msg}</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Page dots */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i)} style={{
                width: i === page ? 16 : 6, height: 6, borderRadius: 3,
                background: i === page ? color : 'var(--border-bright)',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <ChevronLeft size={12} /> Prev
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
                cursor: isLastPage ? 'not-allowed' : 'pointer',
                opacity: isLastPage ? 0.4 : 1,
              }}
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
