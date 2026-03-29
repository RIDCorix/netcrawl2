import { motion, AnimatePresence } from 'framer-motion';
import { Database, Cpu, Star, Wifi, WifiOff, ShieldAlert, Activity, Package, Trophy, BookOpen, Settings, Zap, Layers } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useRef, useEffect, useState } from 'react';
import { useT } from '../hooks/useT';

function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1000000) return `${(n / 1000).toFixed(1)} kB`;
  if (n < 1000000000) return `${(n / 1000000).toFixed(1)} MB`;
  return `${(n / 1000000000).toFixed(1)} GB`;
}

function ResourceItem({ icon: Icon, value, label, color, prevValue, formatFn }: {
  icon: any;
  value: number;
  label: string;
  color: string;
  prevValue: number;
  formatFn?: (n: number) => string;
}) {
  const [pulse, setPulse] = useState(false);
  const diff = (value ?? 0) - (prevValue ?? 0);

  useEffect(() => {
    if (diff !== 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)',
        border: `1px solid ${pulse ? color : 'var(--border)'}`,
        transition: 'border-color 0.3s',
        position: 'relative',
      }}
    >
      <Icon size={14} style={{ color }} />
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {formatFn ? formatFn(value ?? 0) : (value ?? 0).toLocaleString()}
      </span>

      {/* Delta indicator */}
      <AnimatePresence>
        {pulse && diff !== 0 && (
          <motion.div
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: diff > 0 ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {diff > 0 ? `+${diff}` : diff}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ResourceBar() {
  const { resources, tick, connected, gameOver, inventoryOpen, toggleInventory, playerInventory, achievements, toggleAchievements, questSummary, toggleQuests, toggleSettings, levelSummary, toggleLevel, activeLayer, layerMeta, openLayerSelect } = useGameStore();
  const totalItems = playerInventory.reduce((sum, i) => sum + i.count, 0);
  const prevRef = useRef(resources);
  const [prev, setPrev] = useState(resources);
  const t = useT();

  useEffect(() => {
    setPrev(prevRef.current);
    prevRef.current = resources;
  }, [resources]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border-bright)',
        flexWrap: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Activity size={16} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: '0.12em',
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
        }}>
          NETCRAWL
        </span>
      </div>

      {/* Game Over */}
      {gameOver && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="game-over-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-dim)',
            border: '1px solid var(--danger)',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: 'var(--danger)',
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={11} />
          HUB DOWN
        </motion.div>
      )}

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'var(--border-bright)', flexShrink: 0 }} />

      {/* Resources — inline */}
      <ResourceItem icon={Database} value={resources.data} label="Data" color="var(--data-color)" prevValue={prev.data} formatFn={formatBytes} />
      <ResourceItem icon={Cpu} value={resources.rp} label="RP" color="var(--rp-color)" prevValue={prev.rp} />
      <ResourceItem icon={Star} value={resources.credits} label="Credits" color="var(--credits-color)" prevValue={prev.credits} />

      {/* Level + XP bar */}
      <motion.button
        onClick={toggleLevel}
        whileTap={{ scale: 0.96 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 10px',
          color: 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Zap size={12} style={{ color: '#00d4aa' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#00d4aa' }}>
              Lv.{levelSummary.level}
            </span>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {levelSummary.level >= levelSummary.maxLevel
                ? 'MAX'
                : `${Math.floor(levelSummary.xpToNext > 0 ? (levelSummary.xp / levelSummary.xpToNext) * 100 : 100)}%`}
            </span>
          </div>
          {/* XP progress bar */}
          <div style={{ width: 64, height: 3, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${levelSummary.xpToNext > 0 ? (levelSummary.xp / levelSummary.xpToNext) * 100 : 100}%`,
              height: '100%',
              background: levelSummary.level >= levelSummary.maxLevel ? '#f59e0b' : '#00d4aa',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      </motion.button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Layers */}
      <motion.button
        onClick={openLayerSelect}
        whileTap={{ scale: 0.96 }}
        title="Network Layers"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 8px',
          color: 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0,
          position: 'relative',
        }}
      >
        <Layers size={12} style={{ color: '#60a5fa' }} />
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: '#60a5fa',
        }}>
          {activeLayer}
        </span>
        {/* Dot indicator when unlocked layers > 1 */}
        {layerMeta.filter(l => l.unlocked).length > 1 && (
          <span style={{
            position: 'absolute',
            top: 2, right: 2,
            width: 5, height: 5,
            borderRadius: '50%',
            background: '#4ade80',
          }} />
        )}
      </motion.button>

      {/* Quests */}
      <motion.button
        onClick={toggleQuests}
        whileTap={{ scale: 0.96 }}
        data-tutorial="quests-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 8px',
          color: 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <BookOpen size={12} style={{ color: '#60a5fa' }} />
        {questSummary.completed > 0 && (
          <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#4ade80' }}>
            {questSummary.completed}
          </span>
        )}
      </motion.button>

      {/* Achievements */}
      <motion.button
        onClick={toggleAchievements}
        whileTap={{ scale: 0.96 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 8px',
          color: 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Trophy size={12} style={{ color: '#f59e0b' }} />
        {achievements.totalUnlocked > 0 && (
          <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
            {achievements.totalUnlocked}
          </span>
        )}
      </motion.button>

      {/* Inventory */}
      <motion.button
        onClick={toggleInventory}
        whileTap={{ scale: 0.96 }}
        title={t('hud.inventory')}
        data-tutorial="inventory-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: inventoryOpen ? 'var(--accent)' : 'var(--bg-elevated)',
          border: `1px solid ${inventoryOpen ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '5px 10px',
          color: inventoryOpen ? '#000' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Package size={12} />
        {totalItems > 0 && (
          <span style={{
            background: inventoryOpen ? '#000' : 'var(--accent)',
            color: inventoryOpen ? 'var(--accent)' : '#000',
            borderRadius: '999px',
            fontSize: 9,
            fontWeight: 800,
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
      </motion.button>

      {/* Cycle */}
      <div style={{
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>#{tick}</span>
      </div>

      {/* Connection */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}>
        {connected ? (
          <Wifi size={12} style={{ color: 'var(--success)' }} />
        ) : (
          <WifiOff size={12} style={{ color: 'var(--danger)' }} />
        )}
      </div>

      {/* Settings */}
      <motion.button
        onClick={toggleSettings}
        whileTap={{ scale: 0.96 }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 5,
          color: 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Settings size={12} />
      </motion.button>
    </div>
  );
}
