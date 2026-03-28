import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Mountain, Database, Wifi, WifiOff, Package } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useRef, useEffect, useState } from 'react';

function ResourceItem({ icon: Icon, value, label, color }: {
  icon: any;
  value: number;
  label: string;
  color: string;
}) {
  const prevRef = useRef(value);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 300);
      prevRef.current = value;
    }
  }, [value]);

  return (
    <motion.div
      className="flex items-center gap-2 px-4 py-2 rounded-lg"
      style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }}
      animate={pulse ? { scale: [1, 1.08, 1] } : {}}
      transition={{ duration: 0.25 }}
    >
      <Icon size={16} style={{ color }} />
      <div>
        <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</div>
        <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {value.toLocaleString()}
        </div>
      </div>
    </motion.div>
  );
}

export function ResourceBar() {
  const { resources, tick, connected, gameOver, inventoryOpen, toggleInventory, playerInventory } = useGameStore();
  const totalItems = playerInventory.reduce((sum, i) => sum + i.count, 0);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3"
      style={{
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="text-lg font-bold tracking-wider" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          NETCRAWL
        </div>
        {gameOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-3 py-1 rounded text-xs font-bold"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            GAME OVER — HUB INFECTED
          </motion.div>
        )}
      </div>

      {/* Resources */}
      <div className="flex items-center gap-3">
        <ResourceItem icon={Zap} value={resources.energy} label="Energy" color="var(--energy-color)" />
        <ResourceItem icon={Mountain} value={resources.ore} label="Ore" color="var(--ore-color)" />
        <ResourceItem icon={Database} value={resources.data} label="Data" color="var(--data-color)" />
      </div>

      {/* Right side: Inventory + Tick + Connection */}
      <div className="flex items-center gap-3">
        {/* Inventory button */}
        <motion.button
          onClick={toggleInventory}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: inventoryOpen ? 'var(--accent)' : 'var(--bg-glass)',
            border: `1px solid ${inventoryOpen ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '8px',
            padding: '6px 12px',
            color: inventoryOpen ? '#000' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
            position: 'relative',
          }}
        >
          <Package size={13} />
          Inventory
          {totalItems > 0 && (
            <span
              style={{
                background: inventoryOpen ? '#000' : 'var(--accent)',
                color: inventoryOpen ? 'var(--accent)' : '#000',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 700,
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </motion.button>

        <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          TICK #{tick}
        </div>
        <div className="flex items-center gap-1">
          {connected ? (
            <Wifi size={14} style={{ color: 'var(--success)' }} />
          ) : (
            <WifiOff size={14} style={{ color: 'var(--danger)' }} />
          )}
          <span className="text-xs" style={{ color: connected ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );
}
