import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';

const DOCS_URL = 'https://dist-theta-seven-35.vercel.app';

const LIGHT_THEMES = new Set(['cloud', 'sakura', 'arctic']);

export function DocsDialog() {
  const { docsOpen, toggleDocs, settings } = useGameStore();
  const t = useT();
  const isLight = LIGHT_THEMES.has(settings.theme);

  return (
    <AnimatePresence>
      {docsOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0,
            background: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)', zIndex: 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={toggleDocs}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'calc(100vw - 80px)',
              height: 'calc(100vh - 80px)',
              maxWidth: 1200,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                color: 'var(--text-primary)', letterSpacing: '0.05em',
              }}>
                {t('hud.docs')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: 4, display: 'flex',
                  }}
                >
                  <ExternalLink size={14} />
                </a>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleDocs}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: 4, display: 'flex',
                  }}
                >
                  <X size={16} />
                </motion.button>
              </div>
            </div>

            {/* Iframe */}
            <iframe
              src={DOCS_URL}
              title="NetCrawl Docs"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              style={{
                flex: 1, width: '100%', border: 'none',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
