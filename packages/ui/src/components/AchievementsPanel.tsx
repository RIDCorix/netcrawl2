import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Lock, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';

const CATEGORY_COLORS: Record<string, string> = {
  resources: '#4ade80',
  workers: '#60a5fa',
  crafting: '#f59e0b',
  nodes: '#a78bfa',
  chips: '#fbbf24',
  secret: '#ef4444',
};

const CATEGORY_LABELS: Record<string, string> = {
  resources: 'Resources',
  workers: 'Workers',
  crafting: 'Crafting',
  nodes: 'Nodes',
  chips: 'Chips',
  secret: 'Secret',
};

interface AchievementItem {
  id: string;
  name: string;
  description: string;
  category: string;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
}

export function AchievementsPanel() {
  const { achievementsOpen, toggleAchievements, achievements: summary } = useGameStore();
  const [items, setItems] = useState<AchievementItem[]>([]);

  useEffect(() => {
    if (!achievementsOpen) return;
    axios.get('/api/achievements').then(r => setItems(r.data.achievements || [])).catch(() => {});
  }, [achievementsOpen, summary.totalUnlocked]);

  // Group by category
  const groups: Record<string, AchievementItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }

  const categoryOrder = ['resources', 'workers', 'crafting', 'nodes', 'chips', 'secret'];

  return (
    <AnimatePresence>
      {achievementsOpen && (
        <motion.div
          key="achievements-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={toggleAchievements}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
              padding: 20, width: 520, maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy size={16} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>ACHIEVEMENTS</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>[A]</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {summary.totalUnlocked}/{summary.totalAchievements}
                </span>
                <button onClick={toggleAchievements} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{
              height: 4, borderRadius: 2,
              background: 'var(--bg-primary)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${summary.totalAchievements > 0 ? (summary.totalUnlocked / summary.totalAchievements) * 100 : 0}%`,
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>

            {/* Categories */}
            {categoryOrder.map(cat => {
              const catItems = groups[cat];
              if (!catItems || catItems.length === 0) return null;
              const color = CATEGORY_COLORS[cat] || '#9ca3af';
              const unlockedCount = catItems.filter(i => i.unlocked).length;

              return (
                <div key={cat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {unlockedCount}/{catItems.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {catItems.map(item => (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                        background: item.unlocked ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                        border: `1px solid ${item.unlocked ? `${color}30` : 'var(--border)'}`,
                        opacity: item.unlocked ? 1 : 0.5,
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: item.unlocked ? `${color}15` : 'transparent',
                          border: `1px solid ${item.unlocked ? `${color}30` : 'var(--border)'}`,
                        }}>
                          {item.unlocked ? <Check size={12} style={{ color }} /> : <Lock size={10} style={{ color: 'var(--text-muted)' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{item.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{item.description}</div>
                          {item.progress && !item.unlocked && (
                            <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden', maxWidth: 120 }}>
                              <div style={{ height: '100%', width: `${Math.min(100, (item.progress.current / item.progress.target) * 100)}%`, background: color, borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                        {item.progress && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {item.progress.current}/{item.progress.target}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
