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
import { CHAPTER_COLORS } from '../constants/colors';
import { useT } from '../hooks/useT';

function formatStat(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(value);
}

export function ActiveQuestsPanel() {
  const t = useT();
  const [quests, setQuests] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<any>(null);
  // Subscribe to primitive fields so new object refs from polling don't retrigger effects
  const questTotal = useGameStore(s => s.questSummary.total);
  const questClaimed = useGameStore(s => s.questSummary.claimed);
  const questCompleted = useGameStore(s => s.questSummary.completed);
  const questAvailable = useGameStore(s => s.questSummary.available);

  // Fetch active quests
  useEffect(() => {
    axios.get('/api/quests').then(r => {
      const all = r.data.quests || [];
      // Show available + completed (not locked, not claimed)
      const active = all.filter((q: any) => q.status === 'available' || q.status === 'completed');
      setQuests(active);
    }).catch(() => {});
  }, [questTotal, questClaimed, questCompleted, questAvailable]);

  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  // Snapshot quests that are mid-animation so they don't vanish on refetch
  const [claimedSnapshots, setClaimedSnapshots] = useState<Record<string, any>>({});

  const handleClaim = useCallback(async (questId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Snapshot the quest data before claiming
    const quest = quests.find(q => q.id === questId);
    if (quest) {
      setClaimedSnapshots(prev => ({ ...prev, [questId]: quest }));
    }
    try {
      await axios.post(`/api/quests/${questId}/claim`);
      setClaimedIds(prev => new Set([...prev, questId]));
      // Remove after sweep (0.3s) + hold (0.4s) + collapse (0.3s) + buffer
      setTimeout(() => {
        setClaimedIds(prev => { const n = new Set(prev); n.delete(questId); return n; });
        setClaimedSnapshots(prev => { const n = { ...prev }; delete n[questId]; return n; });
      }, 1300);
    } catch {}
  }, [quests]);

  // Merge: show fetched quests + any claimed snapshots still animating
  const displayQuests = [...quests];
  for (const [id, snap] of Object.entries(claimedSnapshots)) {
    if (!displayQuests.find(q => q.id === id)) {
      displayQuests.push(snap);
    }
  }

  if (displayQuests.length === 0) return null;

  return (
    <>
      <motion.div
        style={{
          position: 'fixed',
          left: 16,
          top: 72,
          width: 250,
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
              {t('ui.active_quests')}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)',
              color: '#60a5fa', fontFamily: 'var(--font-mono)',
            }}>
              {quests.length /* don't count snapshots in badge */}
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
                {/* Claim All button */}
                {(() => {
                  const claimable = quests.filter(q => q.status === 'completed' && !claimedIds.has(q.id));
                  if (claimable.length < 2) return null;
                  return (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await axios.post('/api/quests/claim-all');
                          for (const q of claimable) {
                            setClaimedSnapshots(prev => ({ ...prev, [q.id]: q }));
                            setClaimedIds(prev => new Set([...prev, q.id]));
                          }
                          setTimeout(() => {
                            for (const q of claimable) {
                              setClaimedIds(prev => { const n = new Set(prev); n.delete(q.id); return n; });
                              setClaimedSnapshots(prev => { const n = { ...prev }; delete n[q.id]; return n; });
                            }
                          }, 1300);
                        } catch {}
                      }}
                      style={{
                        width: 'calc(100% - 8px)', margin: '0 4px 4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '5px 0', borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent)', border: 'none', color: '#000',
                        fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                      }}
                    >
                      <Gift size={9} /> {t('quest.claim_all')} ({claimable.length})
                    </button>
                  );
                })()}
                {displayQuests.map(q => {
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
                      initial={{ opacity: 1, height: 'auto' }}
                      animate={justClaimed
                        ? { height: 0, opacity: 0, marginBottom: 0 }
                        : { height: 'auto', opacity: 1 }}
                      transition={justClaimed
                        ? { height: { duration: 0.3, delay: 0.7, ease: 'easeInOut' }, opacity: { duration: 0.15, delay: 0.85 }, marginBottom: { duration: 0.3, delay: 0.7 } }
                        : { duration: 0.15 }}
                      style={{ overflow: 'hidden', position: 'relative' }}
                    >
                      <button
                        onClick={() => !justClaimed && setSelectedQuest(q)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '6px 8px', marginBottom: 2,
                          background: 'none', border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: justClaimed ? 'default' : 'pointer', textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (!justClaimed) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { if (!justClaimed) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Status indicator */}
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: 1,
                          background: allMet ? `${color}20` : 'var(--bg-primary)',
                          border: `1.5px solid ${allMet ? color : 'var(--border)'}`,
                        }}>
                          {allMet ? <Gift size={9} style={{ color }} /> : null}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {q.name}
                          </div>
                          {/* Objective rows with border-bottom progress */}
                          {q.objectives.map((obj: any) => {
                            const objProgress = Math.min(1, obj.current / obj.target);
                            return (
                              <div key={obj.id} style={{
                                marginTop: 3, paddingBottom: 2,
                                borderBottom: '2px solid var(--bg-primary)',
                                position: 'relative',
                              }}>
                                {/* Progress bar as border-bottom overlay */}
                                <div style={{
                                  position: 'absolute', bottom: -2, left: 0,
                                  width: `${objProgress * 100}%`, height: 2,
                                  background: obj.met ? '#4ade80' : color,
                                  borderRadius: 1, transition: 'width 0.3s',
                                }} />
                                <div style={{
                                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4,
                                }}>
                                  <span style={{
                                    fontSize: 9, color: obj.met ? '#4ade80' : 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    flex: 1, minWidth: 0,
                                  }}>
                                    {obj.met ? '✓' : '│'} {obj.description}
                                  </span>
                                  <span style={{
                                    fontSize: 8, color: obj.met ? '#4ade80' : 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)', flexShrink: 0, opacity: 0.8,
                                  }}>
                                    {formatStat(obj.current)}/{formatStat(obj.target)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Claim button / chapter badge */}
                        {allMet && q.status === 'completed' && !justClaimed ? (
                          <span
                            role="button"
                            onClick={(e) => handleClaim(q.id, e)}
                            style={{
                              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--accent)', color: '#000',
                              fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
                              cursor: 'pointer', flexShrink: 0,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <Gift size={8} /> {t('ui.claim')}
                          </span>
                        ) : !justClaimed ? (
                          <span style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            Ch.{q.chapter}
                          </span>
                        ) : null}
                      </button>

                      {/* COMPLETED sweep overlay */}
                      <AnimatePresence>
                        {justClaimed && (
                          <motion.div
                            initial={{ clipPath: 'inset(0 100% 0 0)' }}
                            animate={{ clipPath: 'inset(0 0% 0 0)' }}
                            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                            style={{
                              position: 'absolute', inset: 0,
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-elevated)',
                              border: '1px solid rgba(74,222,128,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            <Check size={12} style={{ color: '#4ade80' }} />
                            <span style={{
                              fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)',
                              color: '#4ade80', letterSpacing: '0.12em',
                            }}>
                              COMPLETED
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
