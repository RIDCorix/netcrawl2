import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Keyboard, Sliders } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState } from 'react';

const EDGE_STYLES = [
  { value: 'straight', label: 'Straight', desc: 'Direct lines' },
  { value: 'smoothstep', label: 'Smooth', desc: 'Right-angle paths' },
  { value: 'bezier', label: 'Bezier', desc: 'Curved lines' },
] as const;

const KEYBINDING_ACTIONS = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'quests', label: 'Quest Tree' },
  { key: 'settings', label: 'Settings' },
];

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 36, height: 20, borderRadius: 10,
      background: value ? 'var(--accent)' : 'var(--bg-primary)',
      border: `1px solid ${value ? 'var(--accent)' : 'var(--border-bright)'}`,
      cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: value ? '#000' : 'var(--text-muted)',
        position: 'absolute', top: 2, left: value ? 19 : 2, transition: 'all 0.2s',
      }} />
    </button>
  );
}

const displayKey = (k: string) => {
  if (k === 'Escape') return 'Esc';
  if (k === ' ') return 'Space';
  return k.toUpperCase();
};

function KeyCapture({ value, onChange, allBindings, actionKey }: {
  value: string;
  onChange: (key: string) => void;
  allBindings: Record<string, string>;
  actionKey: string;
}) {
  const [listening, setListening] = useState(false);
  const [conflict, setConflict] = useState('');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => { setListening(true); setConflict(''); }}
        onKeyDown={e => {
          if (!listening) return;
          e.preventDefault();
          e.stopPropagation();

          // Esc cancels capture — revert to original
          if (e.key === 'Escape') {
            setListening(false);
            setConflict('');
            return;
          }

          // Check for duplicate — is this key used by another action?
          const conflictAction = Object.entries(allBindings).find(
            ([k, v]) => k !== actionKey && (v === e.key || v.toLowerCase() === e.key.toLowerCase())
          );
          if (conflictAction) {
            setConflict(`Already used by "${conflictAction[0]}"`);
            return;
          }

          setConflict('');
          onChange(e.key);
          setListening(false);
        }}
        onBlur={() => { setListening(false); setConflict(''); }}
        style={{
          padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          background: listening ? 'var(--accent-dim)' : conflict ? 'var(--danger-dim)' : 'var(--bg-elevated)',
          border: `1px solid ${listening ? 'var(--accent)' : conflict ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`,
          color: listening ? 'var(--accent)' : conflict ? 'var(--danger)' : 'var(--text-primary)',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
          cursor: 'pointer', minWidth: 50, textAlign: 'center',
          transition: 'all 0.15s', outline: 'none',
        }}
      >
        {listening ? 'Press key...' : displayKey(value)}
      </button>
      {conflict && (
        <span style={{ fontSize: 8, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>{conflict}</span>
      )}
    </div>
  );
}

const TABS = [
  { key: 'preferences', label: 'Preferences', icon: Sliders },
  { key: 'keybindings', label: 'Keybindings', icon: Keyboard },
];

export function SettingsPanel() {
  const { settingsOpen, toggleSettings, settings, updateSettings } = useGameStore();
  const [tab, setTab] = useState('preferences');

  const updateKeybinding = (action: string, key: string) => {
    updateSettings({ keybindings: { ...settings.keybindings, [action]: key } });
  };

  const resetKeybindings = () => {
    updateSettings({
      keybindings: { inventory: 'e', achievements: 'a', quests: 'q', settings: 'Escape' },
    });
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={toggleSettings}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
              width: 460, maxWidth: 'calc(100vw - 48px)', height: 420,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>SETTINGS</span>
              </div>
              <button onClick={toggleSettings} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ padding: '8px 20px 0', display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {TABS.map(t => {
                const isActive = t.key === tab;
                const Icon = t.icon;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 14px', borderRadius: '8px 8px 0 0',
                    background: isActive ? 'var(--bg-elevated)' : 'transparent',
                    border: 'none', borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                    <Icon size={12} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {tab === 'preferences' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Edge Style */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>Edge Style</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {EDGE_STYLES.map(es => (
                        <button key={es.value} onClick={() => updateSettings({ edgeStyle: es.value })} style={{
                          flex: 1, padding: '8px 6px', borderRadius: 'var(--radius-sm)',
                          background: settings.edgeStyle === es.value ? 'var(--accent-dim)' : 'var(--bg-primary)',
                          border: `1px solid ${settings.edgeStyle === es.value ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
                          color: settings.edgeStyle === es.value ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: settings.edgeStyle === es.value ? 700 : 500,
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}>
                          <span>{es.label}</span>
                          <span style={{ fontSize: 8, opacity: 0.6 }}>{es.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Traffic Dots</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Moving dots on edges</div>
                    </div>
                    <ToggleSwitch value={settings.showTrafficDots} onChange={v => updateSettings({ showTrafficDots: v })} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Worker Dots</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Worker positions on nodes</div>
                    </div>
                    <ToggleSwitch value={settings.showWorkerDots} onChange={v => updateSettings({ showWorkerDots: v })} />
                  </div>

                  {/* About */}
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border)', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.6, marginTop: 8 }}>
                    NetCrawl v0.1.0 -- Learn to code by building network automation workers
                  </div>
                </div>
              )}

              {tab === 'keybindings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    Click a key to rebind, then press the new key.
                  </div>

                  {KEYBINDING_ACTIONS.map(kb => (
                    <div key={kb.key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{kb.label}</span>
                      {kb.key === 'settings' ? (
                        // Settings key is locked to Esc
                        <span style={{
                          padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          color: 'var(--text-muted)', fontSize: 11, fontWeight: 700,
                          fontFamily: 'var(--font-mono)', minWidth: 50, textAlign: 'center',
                          opacity: 0.5,
                        }}>
                          {displayKey(settings.keybindings[kb.key] || 'Escape')}
                        </span>
                      ) : (
                        <KeyCapture
                          value={settings.keybindings[kb.key] || ''}
                          onChange={key => updateKeybinding(kb.key, key)}
                          allBindings={settings.keybindings}
                          actionKey={kb.key}
                        />
                      )}
                    </div>
                  ))}

                  <button onClick={resetKeybindings} style={{
                    marginTop: 8, padding: '8px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}>
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
