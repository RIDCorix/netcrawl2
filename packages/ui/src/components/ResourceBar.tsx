import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Mountain, Database, Wifi, WifiOff, ShieldAlert, Activity, Package } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useRef, useEffect, useState } from 'react';

function ResourceItem({ icon: Icon, value, label, color, prevValue }: {
  icon: any;
  value: number;
  label: string;
  color: string;
  prevValue: number;
}) {
  const [pulse, setPulse] = useState(false);
  const diff = value - prevValue;

  useEffect(() => {
    if (diff !== 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <motion.div
      className="flex items-center gap-3"
      animate={pulse ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 0.3 }}
      style={{
        padding: '8px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        border: `1px solid ${pulse ? color : 'var(--border)'}`,
        transition: 'border-color 0.3s',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 130,
      }}
    >
      {/* Subtle color bar at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.5,
      }} />

      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}>
        <Icon size={16} style={{ color }} />
      </div>

      <div>
        <div style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value.toLocaleString()}
        </div>
      </div>

      {/* Delta indicator */}
      <AnimatePresence>
        {pulse && diff !== 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'absolute',
              top: 4,
              right: 8,
              fontSize: 10,
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
  const { resources, tick, connected, gameOver, inventoryOpen, toggleInventory, playerInventory } = useGameStore();
  const totalItems = playerInventory.reduce((sum, i) => sum + i.count, 0);
  const prevRef = useRef(resources);
  const [prev, setPrev] = useState(resources);

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
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border-bright)',
      }}
    >
      {/* Left: Title + Game Over */}
      <div className="flex items-center gap-4" style={{ minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} style={{ color: 'var(--accent)' }} />
          <span style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: '0.15em',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
          }}>
            NETCRAWL
          </span>
        </div>

        {gameOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="game-over-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-dim)',
              border: '1px solid var(--danger)',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--danger)',
              letterSpacing: '0.05em',
            }}
          >
            <ShieldAlert size={12} />
            HUB COMPROMISED
          </motion.div>
        )}
      </div>

      {/* Center: Resources */}
      <div className="flex items-center gap-3">
        <ResourceItem icon={Zap} value={resources.energy} label="Energy" color="var(--energy-color)" prevValue={prev.energy} />
        <ResourceItem icon={Mountain} value={resources.ore} label="Ore" color="var(--ore-color)" prevValue={prev.ore} />
        <ResourceItem icon={Database} value={resources.data} label="Data" color="var(--data-color)" prevValue={prev.data} />
      </div>

      {/* Right: Inventory + Tick + Connection */}
      <div className="flex items-center gap-3" style={{ minWidth: 220, justifyContent: 'flex-end' }}>
        {/* Inventory button */}
        <motion.button
          onClick={toggleInventory}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: inventoryOpen ? 'var(--accent)' : 'var(--bg-elevated)',
            border: `1px solid ${inventoryOpen ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            color: inventoryOpen ? '#000' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Package size={13} />
          Inventory
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

        <div style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          CYCLE <span style={{ color: 'var(--accent)', fontWeight: 700 }}>#{tick}</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          background: connected ? 'rgba(46, 213, 115, 0.08)' : 'var(--danger-dim)',
          border: `1px solid ${connected ? 'rgba(46, 213, 115, 0.2)' : 'rgba(255, 71, 87, 0.2)'}`,
        }}>
          {connected ? (
            <Wifi size={12} style={{ color: 'var(--success)' }} />
          ) : (
            <WifiOff size={12} style={{ color: 'var(--danger)' }} />
          )}
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: connected ? 'var(--success)' : 'var(--danger)',
            letterSpacing: '0.08em',
          }}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );
}
