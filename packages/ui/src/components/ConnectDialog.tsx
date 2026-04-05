import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Terminal, Globe, Loader } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';
import { SERVER_URL, WS_URL, apiFetch } from '../lib/api';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

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
        padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}
    >
      {copied ? <><Check size={12} /> Copied</> : <Copy size={12} />}
    </motion.button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '6px 10px',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)',
        overflow: 'hidden',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

/** Simple syntax highlight for Python/JS code */
function SyntaxBlock({ lang, code, copyText }: { lang: string; code: React.ReactNode; copyText: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {lang}
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        background: '#0d1117', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '10px 12px',
        fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
        overflow: 'auto',
      }}>
        <pre style={{ margin: 0, flex: 1, whiteSpace: 'pre' }}>{code}</pre>
        <CopyButton text={copyText} />
      </div>
    </div>
  );
}

// Syntax color tokens
const K = ({ children }: { children: string }) => <span style={{ color: '#ff7b72' }}>{children}</span>;  // keyword
const S = ({ children }: { children: string }) => <span style={{ color: '#a5d6ff' }}>{children}</span>;  // string
const F = ({ children }: { children: string }) => <span style={{ color: '#d2a8ff' }}>{children}</span>;  // function
const C = ({ children }: { children: string }) => <span style={{ color: '#8b949e' }}>{children}</span>;  // comment
const P = ({ children }: { children: string }) => <span style={{ color: '#c9d1d9' }}>{children}</span>;  // punctuation

export function ConnectDialog() {
  const { connectOpen, toggleConnect } = useGameStore();
  const t = useT();
  const [codeServerConnected, setCodeServerConnected] = useState(false);

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
  const isCloud = !!import.meta.env.VITE_API_URL;
  const apiKey = localStorage.getItem('netcrawl-token') || '';

  const pythonCopy = isCloud
    ? `app = NetCrawl(\n    server="${serverUrl}",\n    api_key="${apiKey}",\n)`
    : `app = NetCrawl(server="${serverUrl}")`;

  const jsCopy = isCloud
    ? `const app = new NetCrawl({\n  server: '${serverUrl}',\n  apiKey: '${apiKey}',\n});`
    : `const app = new NetCrawl({ server: '${serverUrl}' });`;

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
              width: 640, maxWidth: 'calc(100vw - 40px)',
              maxHeight: 'calc(100vh - 80px)',
              background: 'var(--bg-glass-heavy)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Terminal size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  {t('connect.title')}
                </span>
              </div>
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleConnect} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={16} />
              </motion.button>
            </div>

            {/* Scrollable content */}
            <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
              {/* Status */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
                fontSize: 11, fontFamily: 'var(--font-mono)',
                color: codeServerConnected ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {codeServerConnected ? <Globe size={12} /> : <Loader size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                <span>{codeServerConnected ? 'Code server connected' : 'Waiting for code server...'}</span>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14, margin: '0 0 14px' }}>
                {t('connect.description')}
              </p>

              {/* Connection info */}
              <InfoRow label={t('connect.server_url')} value={serverUrl} />
              {isCloud && apiKey && <InfoRow label="API KEY" value={apiKey} />}

              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />

              {/* Python example with syntax highlighting */}
              <SyntaxBlock lang="Python" copyText={pythonCopy} code={
                isCloud ? (<>
                  <P>{'app = '}</P><F>{'NetCrawl'}</F><P>{'('}</P>{'\n'}
                  <P>{'    server='}</P><S>{`"${serverUrl}"`}</S><P>{','}</P>{'\n'}
                  <P>{'    api_key='}</P><S>{`"${apiKey}"`}</S><P>{','}</P>{'\n'}
                  <P>{')'}</P>
                </>) : (<>
                  <P>{'app = '}</P><F>{'NetCrawl'}</F><P>{'(server='}</P><S>{`"${serverUrl}"`}</S><P>{')'}</P>
                </>)
              } />

              {/* JavaScript example with syntax highlighting */}
              <SyntaxBlock lang="JavaScript" copyText={jsCopy} code={
                isCloud ? (<>
                  <K>{'const '}</K><P>{'app = '}</P><K>{'new '}</K><F>{'NetCrawl'}</F><P>{'({'}</P>{'\n'}
                  <P>{'  server: '}</P><S>{`'${serverUrl}'`}</S><P>{','}</P>{'\n'}
                  <P>{'  apiKey: '}</P><S>{`'${apiKey}'`}</S><P>{','}</P>{'\n'}
                  <P>{'});'}</P>
                </>) : (<>
                  <K>{'const '}</K><P>{'app = '}</P><K>{'new '}</K><F>{'NetCrawl'}</F><P>{'({ server: '}</P><S>{`'${serverUrl}'`}</S><P>{' });'}</P>
                </>)
              } />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
