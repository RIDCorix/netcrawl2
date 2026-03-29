/**
 * LayerSelectScreen — full-screen layer/map selection overlay.
 * Opens when the user clicks the Layers button in the ResourceBar.
 * Shows all layers, their unlock status, and lets the player switch maps.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, CheckCircle, ArrowRight, AlertTriangle, Globe } from 'lucide-react';
import { useGameStore, type LayerMeta } from '../store/gameStore';
import { useState } from 'react';

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(current: number, max: number): number {
  return Math.min(100, max > 0 ? Math.floor((current / max) * 100) : 0);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

// ── ThresholdBar ──────────────────────────────────────────────────────────────

function ThresholdBar({ label, current, required, color }: {
  label: string; current: number; required: number; color: string;
}) {
  const p = pct(current, required);
  const done = p >= 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: done ? '#4ade80' : 'var(--text-muted)' }}>
          {done ? '✓ ' : ''}{label}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: done ? '#4ade80' : 'var(--text-secondary)' }}>
          {fmt(current)} / {fmt(required)}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${p}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', background: done ? '#4ade80' : color, borderRadius: 2 }}
        />
      </div>
    </div>
  );
}

// ── LayerCard ──────────────────────────────────────────────────────────────────

function LayerCard({
  layer, isActive, onEnter, switching,
}: {
  layer: LayerMeta;
  isActive: boolean;
  onEnter: () => void;
  switching: boolean;
}) {
  const hasThresholds = Object.keys(layer.thresholds).length > 0;
  const thresholdEntries = Object.entries(layer.thresholds) as Array<[string, number]>;

  const THRESHOLD_LABELS: Record<string, string> = {
    total_data_deposited: 'Data Deposited',
    rp: 'Research Points',
    credits: 'Credits',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: isActive
          ? `linear-gradient(135deg, ${layer.color}18, var(--bg-elevated))`
          : 'var(--bg-elevated)',
        border: `1px solid ${isActive ? layer.color : layer.unlocked ? 'var(--border-bright)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: !layer.unlocked ? 0.7 : 1,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 260,
        flex: '1 1 260px',
        maxWidth: 380,
      }}
    >
      {/* Active indicator */}
      {isActive && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: layer.color,
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 48, height: 48,
          borderRadius: 10,
          background: layer.unlocked ? `${layer.color}22` : 'var(--bg-primary)',
          border: `1px solid ${layer.unlocked ? layer.color + '55' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>
          {layer.unlocked ? layer.emoji : '🔒'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 14,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: layer.unlocked ? layer.color : 'var(--text-muted)',
              letterSpacing: '0.05em',
            }}>
              LAYER {layer.id}
            </span>
            {isActive && (
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: layer.color,
                background: `${layer.color}22`,
                border: `1px solid ${layer.color}44`,
                borderRadius: 4,
                padding: '1px 5px',
                letterSpacing: '0.08em',
              }}>
                ACTIVE
              </span>
            )}
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: layer.unlocked ? 'var(--text-primary)' : 'var(--text-secondary)',
            marginTop: 2,
          }}>
            {layer.name}
          </div>
          <div style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            marginTop: 2,
          }}>
            {layer.tagline}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        margin: 0,
      }}>
        {layer.description}
      </p>

      {/* Unlock progress */}
      {!layer.unlocked && hasThresholds && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px',
          background: 'var(--bg-primary)',
          borderRadius: 8,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Lock size={11} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              UNLOCK REQUIREMENTS
            </span>
          </div>
          {thresholdEntries.map(([key, required]) => (
            <ThresholdBar
              key={key}
              label={THRESHOLD_LABELS[key] ?? key}
              current={(layer.progress as any)[key] ?? 0}
              required={required}
              color={layer.color}
            />
          ))}
        </div>
      )}

      {/* Unlocked badge */}
      {layer.unlocked && !isActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <CheckCircle size={12} style={{ color: '#4ade80' }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#4ade80' }}>
            Unlocked
          </span>
        </div>
      )}

      {/* Enter button */}
      {layer.unlocked && !isActive && (
        <motion.button
          onClick={onEnter}
          disabled={switching}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: layer.color,
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            cursor: switching ? 'not-allowed' : 'pointer',
            opacity: switching ? 0.6 : 1,
            letterSpacing: '0.05em',
          }}
        >
          {switching ? 'Switching...' : 'Enter Layer'}
          {!switching && <ArrowRight size={14} />}
        </motion.button>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LayerSelectScreen() {
  const { layerSelectOpen, layerMeta, activeLayer, workers, closeLayerSelect } = useGameStore();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const hasActiveWorkers = workers.some(w =>
    ['running', 'moving', 'harvesting'].includes(w.status)
  );

  async function handleEnterLayer(layerId: number) {
    setSwitchError(null);
    setSwitching(true);
    try {
      const res = await fetch('/api/layer/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSwitchError(data.error || 'Failed to switch layer');
      } else {
        closeLayerSelect();
      }
    } catch (e) {
      setSwitchError('Network error');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <AnimatePresence>
      {layerSelectOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '60px 24px 40px',
            overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeLayerSelect(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            style={{
              width: '100%',
              maxWidth: 1100,
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Globe size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <h1 style={{
                    fontSize: 22,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    margin: 0,
                    letterSpacing: '0.08em',
                  }}>
                    NETWORK LAYERS
                  </h1>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Select a network depth to infiltrate
                  </p>
                </div>
              </div>
              <motion.button
                onClick={closeLayerSelect}
                whileTap={{ scale: 0.93 }}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 6,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Worker warning */}
            {hasActiveWorkers && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: '#f59e0b',
                }}
              >
                <AlertTriangle size={14} />
                Active workers detected. Suspend all workers before switching layers.
              </motion.div>
            )}

            {/* Error message */}
            {switchError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={14} />
                {switchError}
              </motion.div>
            )}

            {/* Layer cards */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              justifyContent: 'flex-start',
            }}>
              {(layerMeta.length > 0 ? layerMeta : PLACEHOLDER_LAYERS).map((layer) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  isActive={layer.id === activeLayer}
                  onEnter={() => handleEnterLayer(layer.id)}
                  switching={switching}
                />
              ))}
            </div>

            {/* Footer note */}
            <p style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              margin: 0,
              opacity: 0.6,
            }}>
              Resources are shared across all layers. Worker progress is saved per-layer.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Placeholder layers (shown before server sends layerMeta) ─────────────────

const PLACEHOLDER_LAYERS: LayerMeta[] = [
  {
    id: 0,
    name: 'Surface Network',
    tagline: 'The open internet',
    description: 'Scattered nodes, raw data mines, and your first API endpoints. The starting point.',
    color: '#00d4aa',
    emoji: '🌐',
    unlocked: true,
    thresholds: {},
    progress: {},
  },
  {
    id: 1,
    name: 'Corp Intranet',
    tagline: 'Internal corporate network',
    description: 'High-security API nodes, multi-factor auth, corporate databases. Valuable — but defended.',
    color: '#60a5fa',
    emoji: '🏢',
    unlocked: false,
    thresholds: { total_data_deposited: 5000, rp: 50, credits: 20 },
    progress: {},
  },
  {
    id: 2,
    name: 'Dark Subnet',
    tagline: 'Unindexed. Encrypted.',
    description: 'No one knows what runs here. Rare chips, extreme compute, unusual node types.',
    color: '#a78bfa',
    emoji: '🌑',
    unlocked: false,
    thresholds: { total_data_deposited: 25000, rp: 200, credits: 100 },
    progress: {},
  },
  {
    id: 3,
    name: 'The Core',
    tagline: 'Root access',
    description: 'The heart of the network. Few reach this depth. Fewer survive it.',
    color: '#ef4444',
    emoji: '⚡',
    unlocked: false,
    thresholds: { total_data_deposited: 100000, rp: 1000, credits: 500 },
    progress: {},
  },
];
