/**
 * ActiveQuestsPanel — shows in-progress quests on the left side of the screen.
 * Clicking a quest opens the QuestGuideDialog.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronRight, Gift, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QuestGuideDialog } from './QuestGuideDialog';

const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80', 2: '#60a5fa', 3: '#a78bfa', 4: '#ef4444', 5: '#f59e0b', 6: '#00d4aa',
};

export function ActiveQuestsPanel() {
  const [quests, setQuests] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<any>(null);
  const { questSummary } = useGameStore();

  // Fetch active quests
  useEffect(() => {
    axios.get('/api/quests').then(r => {
      const all = r.data.quests || [];
      // Show available + completed (not locked, not claimed)
      const active = all.filter((q: any) => q.status === 'available' || q.status === 'completed');
      setQuests(active);
    }).catch(() => {});
  }, [questSummary]);

  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const handleClaim = useCallback(async (questId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.post(`/api/quests/${questId}/claim`);
      setClaimedIds(prev => new Set([...prev, questId]));
      // Remove after animation completes
      setTimeout(() => setClaimedIds(prev => { const n = new Set(prev); n.delete(questId); return n; }), 1500);
    } catch {}
  }, []);

  if (quests.length === 0) return null;

  return (
    <>
      <motion.div
        style={{
          position: 'fixed',
          left: 16,
          top: 72,
          width: 220,
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          zIndex: 40,
          overflow: 'hidden',
          maxHeight: 'calc(50vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={12} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              ACTIVE QUESTS
            </span>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)',
              color: '#60a5fa', fontFamily: 'var(--font-mono)',
            }}>
              {quests.length}
            </span>
          </div>
          {collapsed ? <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {/* Quest list */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '6px 4px', overflowY: 'auto', maxHeight: 'calc(50vh - 130px)' }}>
                {quests.map(q => {
                  const color = CHAPTER_COLORS[q.chapter] || '#9ca3af';
                  const allMet = q.objectives.every((o: any) => o.met);
                  const progress = q.objectives.length > 0
                    ? q.objectives.reduce((sum: number, o: any) => sum + Math.min(1, o.current / o.target), 0) / q.objectives.length
                    : 0;

                  const justClaimed = claimedIds.has(q.id);

                  return (
                    <motion.div
                      key={q.id}
                      layout
                      initial={{ opacity: 1, x: 0 }}
                      animate={justClaimed ? { opacity: 0, x: -60, scale: 0.9 } : { opacity: 1, x: 0, scale: 1 }}
                      transition={justClaimed ? { duration: 0.5, delay: 0.6 } : { duration: 0.15 }}
                    >
                      <button
                        onClick={() => !justClaimed && setSelectedQuest(q)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', marginBottom: 2,
                          background: justClaimed ? 'rgba(74,222,128,0.08)' : 'none',
                          border: justClaimed ? '1px solid rgba(74,222,128,0.2)' : 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: justClaimed ? 'default' : 'pointer', textAlign: 'left',
                          transition: 'all 0.3s',
                        }}
                        onMouseEnter={e => { if (!justClaimed) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { if (!justClaimed) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Status indicator */}
                        <motion.div
                          animate={justClaimed ? { scale: [1, 1.4, 1], rotate: [0, 360] } : {}}
                          transition={{ duration: 0.5 }}
                          style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: justClaimed ? 'rgba(74,222,128,0.2)' : allMet ? `${color}20` : 'var(--bg-primary)',
                            border: `1.5px solid ${justClaimed ? '#4ade80' : allMet ? color : 'var(--border)'}`,
                          }}
                        >
                          {justClaimed ? <Check size={10} style={{ color: '#4ade80' }} /> : allMet ? <Gift size={9} style={{ color }} /> : null}
                        </motion.div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            color: justClaimed ? '#4ade80' : 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            textDecoration: justClaimed ? 'line-through' : 'none',
                          }}>
                            {q.name}
                          </div>
                          {!justClaimed && (
                            <div style={{ height: 2, borderRadius: 1, background: 'var(--bg-primary)', marginTop: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progress * 100}%`, background: color, borderRadius: 1, transition: 'width 0.3s' }} />
                            </div>
                          )}
                        </div>

                        {/* Claim button / claimed state / chapter badge */}
                        {justClaimed ? (
                          <motion.span
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#4ade80', flexShrink: 0 }}
                          >
                            Done!
                          </motion.span>
                        ) : allMet && q.status === 'completed' ? (
                          <button
                            onClick={(e) => handleClaim(q.id, e)}
                            style={{
                              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--accent)', color: '#000', border: 'none',
                              fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
                              cursor: 'pointer', flexShrink: 0,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <Gift size={8} /> Claim
                          </button>
                        ) : (
                          <span style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            Ch.{q.chapter}
                          </span>
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Guide dialog */}
      <AnimatePresence>
        {selectedQuest && (
          <QuestGuideDialog quest={selectedQuest} onClose={() => setSelectedQuest(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
