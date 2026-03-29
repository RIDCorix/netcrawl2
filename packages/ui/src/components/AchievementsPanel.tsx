import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Lock, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { CATEGORY_COLORS } from '../constants/colors';
import { useT } from '../hooks/useT';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  resources: 'Resources',
  workers: 'Workers',
  crafting: 'Crafting',
  nodes: 'Nodes',
  chips: 'Chips',
  secret: 'Secret',
};

const CATEGORY_ORDER = ['all', 'resources', 'workers', 'crafting', 'nodes', 'chips', 'secret'];

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
  const t = useT();
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (!achievementsOpen) return;
    axios.get('/api/achievements').then(r => setItems(r.data.achievements || [])).catch(() => {});
  }, [achievementsOpen, summary.totalUnlocked]);

  // Filtered items
  const filtered = useMemo(() => {
    if (activeTab === 'all') return items;
    return items.filter(i => i.category === activeTab);
  }, [items, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, { total: number; unlocked: number }> = {};
    for (const cat of CATEGORY_ORDER) {
      const catItems = cat === 'all' ? items : items.filter(i => i.category === cat);
      counts[cat] = { total: catItems.length, unlocked: catItems.filter(i => i.unlocked).length };
    }
    return counts;
  }, [items]);

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
              width: 560, maxWidth: 'calc(100vw - 48px)',
              height: 520,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
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
            <div style={{ padding: '0 20px', flexShrink: 0 }}>
              <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden', marginTop: 10 }}>
                <div style={{ height: '100%', width: `${summary.totalAchievements > 0 ? (summary.totalUnlocked / summary.totalAchievements) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Category tabs */}
            <div style={{ padding: '10px 20px 0', display: 'flex', gap: 2, flexShrink: 0, overflowX: 'auto' }}>
              {CATEGORY_ORDER.map(cat => {
                const isActive = cat === activeTab;
                const color = CATEGORY_COLORS[cat] || '#9ca3af';
                const counts = tabCounts[cat] || { total: 0, unlocked: 0 };
                if (cat !== 'all' && counts.total === 0) return null;

                return (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    style={{
                      padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                      background: isActive ? `${color}15` : 'transparent',
                      border: `1px solid ${isActive ? `${color}30` : 'transparent'}`,
                      color: isActive ? color : 'var(--text-muted)',
                      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.1s',
                      display: 'flex', alignItems: 'center', gap: 4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                    <span style={{ fontSize: 8, opacity: 0.7 }}>{counts.unlocked}/{counts.total}</span>
                  </button>
                );
              })}
            </div>

            {/* Achievement list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(item => {
                  const color = CATEGORY_COLORS[item.category] || '#9ca3af';
                  return (
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{t('ach.' + item.id + '.name') || item.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{t('ach.' + item.id + '.desc') || item.description}</div>
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
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '20px 0' }}>
                    No achievements in this category.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
