import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Keyboard } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const EDGE_STYLES = [
  { value: 'straight', label: 'Straight', description: 'Direct lines between nodes' },
  { value: 'smoothstep', label: 'Smooth Step', description: 'Right-angle paths with rounded corners' },
  { value: 'bezier', label: 'Bezier', description: 'Curved connections' },
] as const;

const KEYBINDINGS = [
  { key: 'E', action: 'Toggle Inventory' },
  { key: 'A', action: 'Toggle Achievements' },
  { key: 'Q', action: 'Toggle Quest Tree' },
  { key: 'Esc', action: 'Toggle Settings' },
];

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 36, height: 20, borderRadius: 10,
      background: value ? 'var(--accent)' : 'var(--bg-primary)',
      border: `1px solid ${value ? 'var(--accent)' : 'var(--border-bright)'}`,
      cursor: 'pointer', position: 'relative',
      transition: 'all 0.2s',
      padding: 0,
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: value ? '#000' : 'var(--text-muted)',
        position: 'absolute', top: 2,
        left: value ? 19 : 2,
        transition: 'all 0.2s',
      }} />
    </button>
  );
}

export function SettingsPanel() {
  const { settingsOpen, toggleSettings, settings, updateSettings } = useGameStore();

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
              width: 440, maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 0,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>SETTINGS</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>[Esc]</span>
              </div>
              <button onClick={toggleSettings} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* ── Preferences ── */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 12 }}>
                  PREFERENCES
                </div>

                {/* Edge Style */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    Edge Style
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {EDGE_STYLES.map(es => (
                      <button
                        key={es.value}
                        onClick={() => updateSettings({ edgeStyle: es.value })}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 'var(--radius-sm)',
                          background: settings.edgeStyle === es.value ? 'var(--accent-dim)' : 'var(--bg-primary)',
                          border: `1px solid ${settings.edgeStyle === es.value ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
                          color: settings.edgeStyle === es.value ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: settings.edgeStyle === es.value ? 700 : 500,
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}
                      >
                        <span>{es.label}</span>
                        <span style={{ fontSize: 8, opacity: 0.6 }}>{es.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle: Traffic Dots */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Traffic Dots</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Animated dots on edges when workers move</div>
                  </div>
                  <ToggleSwitch value={settings.showTrafficDots} onChange={v => updateSettings({ showTrafficDots: v })} />
                </div>

                {/* Toggle: Worker Dots */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Worker Dots</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Show worker positions on nodes</div>
                  </div>
                  <ToggleSwitch value={settings.showWorkerDots} onChange={v => updateSettings({ showWorkerDots: v })} />
                </div>
              </div>

              {/* ── Keybindings ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Keyboard size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                    KEYBINDINGS
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {KEYBINDINGS.map(kb => (
                    <div key={kb.key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-primary)',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{kb.action}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}>
                        {kb.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── About ── */}
              <div style={{
                padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                textAlign: 'center', lineHeight: 1.6,
              }}>
                NetCrawl v0.1.0 -- A programming education game<br />
                Learn to code by building network automation workers
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
