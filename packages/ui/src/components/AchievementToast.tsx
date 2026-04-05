import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useEffect, useRef } from 'react';
import { CATEGORY_COLORS } from '../constants/colors';
import { playSfx } from '../hooks/useSfx';

export function AchievementToast() {
  const { achievementToasts, removeAchievementToast } = useGameStore();
  const prevCount = useRef(achievementToasts.length);

  useEffect(() => {
    if (achievementToasts.length > prevCount.current) playSfx('questComplete');
    prevCount.current = achievementToasts.length;
  }, [achievementToasts.length]);

  // Auto-dismiss after 4s
  useEffect(() => {
    for (const toast of achievementToasts) {
      const timer = setTimeout(() => removeAchievementToast(toast.id), 4000);
      return () => clearTimeout(timer);
    }
  }, [achievementToasts]);

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 16, zIndex: 60,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {achievementToasts.map(toast => {
          const color = CATEGORY_COLORS[toast.category] || '#9ca3af';
          return (
            <motion.div
              key={toast.id}
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                background: 'var(--bg-glass-heavy)',
                backdropFilter: 'blur(24px)',
                border: `1px solid ${color}40`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 'var(--radius-md)',
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 16px ${color}20`,
                minWidth: 240,
                pointerEvents: 'auto',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}15`,
                border: `1px solid ${color}30`,
              }}>
                <Trophy size={16} style={{ color }} />
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Achievement Unlocked
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 1 }}>
                  {toast.name}
                </div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 1 }}>
                  {toast.description}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
