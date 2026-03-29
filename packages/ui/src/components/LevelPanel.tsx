import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Star, Shield, Pickaxe, ChevronRight, Lock, Check, Gift } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const MILESTONE_COLORS: Record<string, string> = {
  flop_bonus: '#00d4aa',
  max_workers_bonus: '#60a5fa',
  passive: '#a78bfa',
  recipe_unlock: '#f59e0b',
  items: '#ec4899',
};

function rewardIcon(kind: string) {
  switch (kind) {
    case 'flop_bonus': return <Zap size={12} style={{ color: MILESTONE_COLORS.flop_bonus }} />;
    case 'max_workers_bonus': return <Star size={12} style={{ color: MILESTONE_COLORS.max_workers_bonus }} />;
    case 'passive': return <Shield size={12} style={{ color: MILESTONE_COLORS.passive }} />;
    case 'recipe_unlock': return <Pickaxe size={12} style={{ color: MILESTONE_COLORS.recipe_unlock }} />;
    case 'items': return <Gift size={12} style={{ color: MILESTONE_COLORS.items }} />;
    default: return <ChevronRight size={12} />;
  }
}

function rewardLabel(reward: any): string {
  switch (reward.kind) {
    case 'flop_bonus': return `+${reward.value} FLOP`;
    case 'max_workers_bonus': return `+${reward.value} Worker Slot`;
    case 'passive': return reward.description;
    case 'recipe_unlock': return `Unlock: ${reward.name}`;
    case 'items': return reward.items.map((i: any) => `${i.count}x ${i.itemType}`).join(', ');
    default: return JSON.stringify(reward);
  }
}

export function LevelPanel() {
  const { levelOpen, toggleLevel, levelSummary } = useGameStore();
  const { level, xp, xpToNext, totalXp, title, titleZh, maxLevel, maxWorkersBonus, flopBonus, milestones } = levelSummary;
  const isMaxLevel = level >= maxLevel;
  const xpPercent = isMaxLevel ? 100 : xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;

  return (
    <AnimatePresence>
      {levelOpen && (
        <motion.div
          key="level-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={toggleLevel}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
              width: 520, maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 80px)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={16} style={{ color: '#00d4aa' }} />
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  LEVEL {level}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {title}
                </span>
              </div>
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleLevel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                <X size={16} />
              </motion.button>
            </div>

            {/* Level info + XP bar */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              {/* Title display */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#00d4aa', fontFamily: 'var(--font-mono)' }}>
                    {titleZh}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Total XP: {totalXp.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    +{flopBonus} FLOP | +{maxWorkersBonus} Workers
                  </div>
                </div>
              </div>

              {/* XP Progress Bar */}
              <div style={{ position: 'relative', height: 20, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPercent}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{
                    height: '100%',
                    background: isMaxLevel
                      ? 'linear-gradient(90deg, #f59e0b, #ec4899, #8b5cf6)'
                      : 'linear-gradient(90deg, #00d4aa, #60a5fa)',
                    borderRadius: 10,
                  }}
                />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}>
                  {isMaxLevel ? 'MAX LEVEL' : `${xp.toLocaleString()} / ${xpToNext.toLocaleString()} XP`}
                </div>
              </div>
            </div>

            {/* Milestones */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.08em' }}>
                MILESTONES
              </div>

              {/* Per-level base reward note */}
              <div style={{
                padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                marginBottom: 10,
              }}>
                <Zap size={10} style={{ color: '#00d4aa', marginRight: 4, verticalAlign: 'middle' }} />
                Every level: +3 FLOP capacity
              </div>

              {milestones.map((m) => {
                const isReached = level >= m.level;
                const isCurrent = level < m.level && milestones.filter(mm => mm.level <= level).length === milestones.indexOf(m);

                return (
                  <div
                    key={m.level}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: isReached ? 'rgba(0, 212, 170, 0.06)' : 'var(--bg-elevated)',
                      border: `1px solid ${isReached ? 'rgba(0, 212, 170, 0.2)' : isCurrent ? 'var(--border-bright)' : 'var(--border)'}`,
                      marginBottom: 6,
                      opacity: isReached ? 1 : 0.7,
                    }}
                  >
                    {/* Milestone header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {isReached ? (
                        <Check size={12} style={{ color: '#4ade80' }} />
                      ) : (
                        <Lock size={12} style={{ color: 'var(--text-muted)' }} />
                      )}
                      <span style={{
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        color: isReached ? '#00d4aa' : 'var(--text-secondary)',
                      }}>
                        Level {m.level}
                      </span>
                    </div>

                    {/* Reward items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 20 }}>
                      {m.rewards.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {rewardIcon(r.kind)}
                          <span>{rewardLabel(r)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
