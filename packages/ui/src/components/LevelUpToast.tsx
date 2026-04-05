import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useEffect, useRef } from 'react';
import { playSfx } from '../hooks/useSfx';

export function LevelUpToast() {
  const { levelUpToasts, removeLevelUpToast } = useGameStore();
  const prevCount = useRef(levelUpToasts.length);

  useEffect(() => {
    if (levelUpToasts.length > prevCount.current) playSfx('levelUp');
    prevCount.current = levelUpToasts.length;
  }, [levelUpToasts.length]);

  useEffect(() => {
    for (const toast of levelUpToasts) {
      const timer = setTimeout(() => removeLevelUpToast(toast.level), 4000);
      return () => clearTimeout(timer);
    }
  }, [levelUpToasts, removeLevelUpToast]);

  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      <AnimatePresence>
        {levelUpToasts.map((toast) => (
          <motion.div
            key={`levelup-${toast.level}`}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px',
              background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.15), rgba(96, 165, 250, 0.15))',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(0, 212, 170, 0.4)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0, 212, 170, 0.2)',
            }}
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Zap size={18} style={{ color: '#00d4aa' }} />
            </motion.div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#00d4aa' }}>
                LEVEL UP! Lv.{toast.level}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {toast.titleZh} — {toast.title}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
