import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Terminal, Globe, Loader } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';
import { SERVER_URL, WS_URL, apiFetch } from '../lib/api';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleCopy}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: copied ? 'var(--success)' : 'var(--text-muted)',
        padding: 4, display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontFamily: 'var(--font-mono)',
      }}
    >
      {copied ? <><Check size={12} /> {t('connect.copied')}</> : <Copy size={12} />}
    </motion.button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '8px 12px',
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)',
        wordBreak: 'break-all',
      }}>
        <span>{code}</span>
        <CopyButton text={code} />
      </div>
    </div>
  );
}

export function ConnectDialog() {
  const { connectOpen, toggleConnect } = useGameStore();
  const t = useT();
  const [codeServerConnected, setCodeServerConnected] = useState(false);

  // Poll for code server registration status
  useEffect(() => {
    if (!connectOpen) return;
    let alive = true;
    const check = () => {
      apiFetch('/api/worker-classes').then(r => r.json()).then(data => {
        if (alive) setCodeServerConnected(Array.isArray(data?.classes) && data.classes.length > 0);
      }).catch(() => {});
    };
    check();
    const interval = setInterval(check, 3000);
    return () => { alive = false; clearInterval(interval); };
  }, [connectOpen]);

  const serverUrl = SERVER_URL;
  const wsUrl = WS_URL;

  const pythonCode = `app = NetCrawl(server="${serverUrl}")`;
  const jsCode = `const app = new NetCrawl({ server: '${serverUrl}' });`;

  return (
    <AnimatePresence>
      {connectOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)', zIndex: 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={toggleConnect}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 460, maxWidth: 'calc(100vw - 40px)',
              background: 'var(--bg-glass-heavy)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Terminal size={14} style={{ color: 'var(--accent)' }} />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                  color: 'var(--text-primary)', letterSpacing: '0.05em',
                }}>
                  {t('connect.title')}
                </span>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleConnect}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Content */}
            <div style={{ padding: 16 }}>
              {/* Status */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
                fontSize: 11, fontFamily: 'var(--font-mono)',
                color: codeServerConnected ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {codeServerConnected ? <Globe size={12} /> : <Loader size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                <span>{codeServerConnected ? 'Code server connected' : 'Waiting for code server...'}</span>
              </div>

              {/* Description */}
              <p style={{
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                marginBottom: 16,
              }}>
                {t('connect.description')}
              </p>

              {/* URLs */}
              <CodeBlock label={t('connect.server_url')} code={serverUrl} />
              <CodeBlock label={t('connect.ws_url')} code={wsUrl} />

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

              {/* Code examples */}
              <div style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {t('connect.python_example')}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12,
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
              }}>
                <code>
                  <span style={{ color: '#9ca3af' }}>app = </span>
                  <span style={{ color: '#4ade80' }}>NetCrawl</span>
                  <span style={{ color: '#9ca3af' }}>(server=</span>
                  <span style={{ color: '#f59e0b' }}>"{serverUrl}"</span>
                  <span style={{ color: '#9ca3af' }}>)</span>
                </code>
                <CopyButton text={pythonCode} />
              </div>

              <div style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {t('connect.js_example')}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '8px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
              }}>
                <code>
                  <span style={{ color: '#60a5fa' }}>const </span>
                  <span style={{ color: '#9ca3af' }}>app = </span>
                  <span style={{ color: '#4ade80' }}>new NetCrawl</span>
                  <span style={{ color: '#9ca3af' }}>({"{"} server: </span>
                  <span style={{ color: '#f59e0b' }}>'{serverUrl}'</span>
                  <span style={{ color: '#9ca3af' }}> {"}"})</span>
                </code>
                <CopyButton text={jsCode} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
