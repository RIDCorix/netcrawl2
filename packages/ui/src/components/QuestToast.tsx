import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useEffect } from 'react';

export function QuestToast() {
  const { questToasts, removeQuestToast } = useGameStore();

  useEffect(() => {
    for (const toast of questToasts) {
      const timer = setTimeout(() => removeQuestToast(toast.id), 5000);
      return () => clearTimeout(timer);
    }
  }, [questToasts]);

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, zIndex: 60,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {questToasts.map(toast => (
          <motion.div
            key={`${toast.id}-${toast.type}`}
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              background: 'var(--bg-glass-heavy)',
              backdropFilter: 'blur(24px)',
              border: `1px solid ${toast.type === 'completed' ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)'}`,
              borderLeft: `3px solid ${toast.type === 'completed' ? '#4ade80' : '#60a5fa'}`,
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 220,
              pointerEvents: 'auto',
            }}
          >
            {toast.type === 'completed' ? (
              <CheckCircle size={16} style={{ color: '#4ade80' }} />
            ) : (
              <BookOpen size={16} style={{ color: '#60a5fa' }} />
            )}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: toast.type === 'completed' ? '#4ade80' : '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {toast.type === 'completed' ? 'Quest Complete' : 'New Quest'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 1 }}>
                {toast.name}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
