import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Cpu, Star, Lock, AlertTriangle, MousePointer, Upload, Pickaxe, ArrowUp, Info, Shield, Radio, Box, Server, Globe, Zap, Bug } from 'lucide-react';
import { useGameStore, GameNode, Resources } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { ChipSlotManager } from './ChipSlotManager';
import { NODE_DIALOG_REGISTRY, NodeDialogConfig, NodeInfoDialog } from './NodeInfoDialog';
import { DeployDialog } from './DeployDialog';
import { useT } from '../hooks/useT';

function CostBadge({ cost }: { cost: Partial<Resources> }) {
  const icons: any = { data: Database, rp: Cpu, credits: Star };
  const colors: any = { data: 'var(--data-color)', rp: 'var(--rp-color)', credits: 'var(--credits-color)' };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(cost).map(([key, val]) => {
        const Icon = icons[key];
        return (
          <div key={key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            background: `color-mix(in srgb, ${colors[key]} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${colors[key]} 20%, transparent)`,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: colors[key],
          }}>
            {Icon && <Icon size={10} />}
            {val}
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({ onClick, children, variant = 'primary', disabled = false }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
}) {
  const styles: any = {
    primary: { bg: 'var(--accent)', text: '#000' },
    danger: { bg: 'var(--danger)', text: '#fff' },
    secondary: { bg: 'var(--bg-elevated)', text: 'var(--text-primary)' },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'var(--bg-elevated)' : s.bg,
        color: disabled ? 'var(--text-muted)' : s.text,
        border: disabled ? '1px solid var(--border)' : 'none',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        width: '100%',
        letterSpacing: '0.03em',
      }}
    >
      {children}
    </button>
  );
}

import { SectionLabel, Divider } from './ui/primitives';

function toSnakeCase(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const NODE_TYPE_ICONS: Record<string, any> = {
  hub: Shield,
  resource: Database,
  relay: Radio,
  compute: Cpu,
  empty: Box,
  cache: Server,
  api: Globe,
  infected: Bug,
  locked: Lock,
};

function StatusMessage({ msg }: { msg: string }) {
  if (!msg) return null;
  const isError = msg.startsWith('Error') || msg.includes('failed') || msg.includes('enough');
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        fontSize: 11,
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        background: isError ? 'var(--danger-dim)' : 'rgba(46, 213, 115, 0.1)',
        border: `1px solid ${isError ? 'rgba(255, 71, 87, 0.2)' : 'rgba(46, 213, 115, 0.2)'}`,
        color: isError ? 'var(--danger)' : 'var(--success)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {msg}
    </motion.div>
  );
}

function NodeUpgradeSection({ nodeId, node }: { nodeId: string; node: GameNode }) {
  const { resources } = useGameStore();
  const t = useT();
  const [upgradeData, setUpgradeData] = useState<any>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  useEffect(() => {
    axios.get(`/api/node/upgrades?nodeId=${nodeId}`)
      .then(r => setUpgradeData(r.data))
      .catch(() => {});
  }, [nodeId, node.data.upgradeLevel, node.data.nodeXp]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const res = await axios.post('/api/node/upgrade', { nodeId });
      setUpgradeMsg(`Upgraded to ${res.data.name}!`);
      setTimeout(() => setUpgradeMsg(''), 2000);
    } catch (err: any) {
      setUpgradeMsg(err.response?.data?.error || 'Upgrade failed');
      setTimeout(() => setUpgradeMsg(''), 2000);
    } finally {
      setUpgrading(false);
    }
  };

  if (!upgradeData) return null;
  const { currentLevel, maxLevel, levels } = upgradeData;
  const nextLevel = levels?.find((l: any) => l.level === currentLevel + 1);
  const chipSlots = node.data.chipSlots || 0;
  const installedChips = node.data.installedChips || [];

  return (
    <>
      <Divider />

      {/* Upgrade */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Upgrade</SectionLabel>
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
            background: currentLevel >= maxLevel ? 'rgba(245,158,11,0.15)' : 'var(--accent-dim)',
            color: currentLevel >= maxLevel ? '#f59e0b' : 'var(--accent)',
            border: `1px solid ${currentLevel >= maxLevel ? 'rgba(245,158,11,0.25)' : 'rgba(0,212,170,0.25)'}`,
          }}>
            {currentLevel >= maxLevel ? 'MAX' : `LV.${currentLevel}`}
          </span>
        </div>

        {nextLevel && (
          <div style={{
            padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {t('upgrade.' + toSnakeCase(nextLevel.name) + '.name') || nextLevel.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {t('upgrade.' + toSnakeCase(nextLevel.name) + '.desc') || nextLevel.description}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <CostBadge cost={nextLevel.cost} />
            </div>
          </div>
        )}

        {nextLevel && (
          <ActionButton onClick={handleUpgrade} disabled={upgrading || !nextLevel.affordable || !nextLevel.xpReady}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ArrowUp size={12} />
              {upgrading
                ? 'UPGRADING...'
                : !nextLevel.xpReady
                  ? 'NODE EXP NOT READY'
                  : nextLevel.affordable
                    ? `UPGRADE TO LV.${nextLevel.level}`
                    : 'INSUFFICIENT RESOURCES'}
            </span>
          </ActionButton>
        )}

        {upgradeMsg && <StatusMessage msg={upgradeMsg} />}
      </div>

    </>
  );
}

export function NodeDetailPanel() {
  const { selectedNodeId, nodes, resources, selectNode } = useGameStore();
  const [gathering, setGathering] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [msg, setMsg] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<NodeDialogConfig | null>(null);
  const t = useT();

  const node = nodes.find((n: any) => n.id === selectedNodeId);

  const handleGather = async () => {
    if (!node) return;
    setGathering(true);
    setMsg('');
    try {
      await axios.post('/api/gather', { nodeId: node.id });
      setMsg('+10 gathered!');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Gather failed');
    } finally {
      setGathering(false);
    }
  };

  const handleUnlock = async () => {
    if (!node) return;
    setUnlocking(true);
    setMsg('');
    try {
      await axios.post('/api/unlock', { nodeId: node.id });
      setMsg('Unlocked!');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  const canAffordUnlock = (cost: Partial<Resources>) =>
    Object.entries(cost).every(([k, v]) => (resources as any)[k] >= v);

  const BUILD_COSTS: Record<string, Record<string, number>> = {
    cache: { data: 1500, rp: 5 },
    api: { data: 2000, rp: 8 },
  };

  const handleBuild = async (structureType: string) => {
    if (!node) return;
    setBuilding(true);
    setMsg('');
    try {
      await axios.post('/api/node/build', { nodeId: node.id, structureType });
      setMsg(`Built ${structureType} node!`);
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Build failed');
    } finally {
      setBuilding(false);
    }
  };

  const getNodeColor = (n: GameNode) => {
    if (n.type === 'infected') return 'var(--danger)';
    if (n.type === 'hub') return 'var(--accent)';
    if (n.type === 'resource') {
      return 'var(--data-color)';
    }
    if (n.type === 'relay') return 'var(--accent-secondary)';
    if (n.type === 'cache') return '#a78bfa';
    if (n.type === 'api') return '#f59e0b';
    if (n.type === 'empty') return 'var(--text-muted)';
    return 'var(--text-muted)';
  };

  const canDeploy = node && (node.id === 'hub' || node.data.unlocked) && !node.data.infected;

  return (
    <>
      <AnimatePresence>
        {selectedNodeId && node && (
          <motion.div
            key={selectedNodeId}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            style={{
              position: 'fixed',
              right: 16,
              top: 72,
              bottom: 16,
              width: 320,
              background: 'var(--bg-glass-heavy)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              zIndex: 40,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Accent bar at top */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 20,
              right: 20,
              height: 2,
              borderRadius: '0 0 2px 2px',
              background: `linear-gradient(90deg, transparent, ${getNodeColor(node)}, transparent)`,
            }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Node type icon */}
                {(() => {
                  const NodeIcon = NODE_TYPE_ICONS[node.type] || Box;
                  return (
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                      background: `color-mix(in srgb, ${getNodeColor(node)} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${getNodeColor(node)} 25%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 2,
                    }}>
                      <NodeIcon size={18} style={{ color: getNodeColor(node) }} />
                    </div>
                  );
                })()}
                <div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: getNodeColor(node),
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}>
                    {node.type}
                  </div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2,
                  }}>
                    {node.data.label}
                  </div>
                </div>
              </div>
              <button
                onClick={() => selectNode(null)}
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Node XP */}
            {(() => {
              const nodeXp = node.data.nodeXp || 0;
              const nodeXpToNext = node.data.nodeXpToNext || 0;
              const upgradeLevel = node.data.upgradeLevel || 0;
              const hasXpSystem = nodeXpToNext > 0;
              const xpPercent = hasXpSystem ? Math.min(100, (nodeXp / nodeXpToNext) * 100) : 0;
              const xpFull = hasXpSystem && nodeXp >= nodeXpToNext;
              const isMax = !hasXpSystem;

              // Hide for locked nodes, and for unlocked nodes with no upgrade path
              if (!node.data.unlocked && node.id !== 'hub') return null;
              if (isMax && upgradeLevel === 0) return null;

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                }}>
                  <Zap size={12} style={{ color: '#00d4aa', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#00d4aa' }}>
                        Lv.{upgradeLevel}
                      </span>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {isMax ? 'MAX' : xpFull ? 'READY' : `${Math.floor(xpPercent)}%`}
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 3, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${isMax ? 100 : xpPercent}%`,
                        height: '100%',
                        background: isMax ? '#f59e0b' : '#00d4aa',
                        borderRadius: 2,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                  {hasXpSystem && (
                    <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {nodeXp}/{nodeXpToNext}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Node ID badge */}
            <div style={{
              fontSize: 12,
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              id: <span style={{ color: 'var(--text-secondary)' }}>{node.id}</span>
            </div>

            {/* Infected warning */}
            {(node.type === 'infected' || node.data.infected) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-dim)',
                border: '1px solid rgba(255, 71, 87, 0.25)',
              }}>
                <AlertTriangle size={14} color="var(--danger)" />
                <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {t('node.type.infected')} — Deploy a Guardian to repair
                </span>
              </div>
            )}

            <Divider />

            {/* Depletion status */}
            {node.data.depleted && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-dim)',
                border: '1px solid rgba(255, 71, 87, 0.25)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                  {t('node.depleted')} — {t('node.recover.in', { s: node.data.depletedUntil ? Math.max(0, Math.ceil((node.data.depletedUntil - Date.now()) / 1000)) : '?' })}
                </span>
              </div>
            )}

            {/* Drops on node */}
            {Array.isArray(node.data.drops) && node.data.drops.length > 0 && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(250,204,21,0.08)',
                border: '1px solid rgba(250,204,21,0.25)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, color: '#facc15', fontFamily: 'var(--font-mono)' }}>
                  DROPS ON GROUND ({node.data.drops.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {node.data.drops.map((drop: any) => (
                    <div key={drop.id} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      • {drop.type} ×{drop.amount}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resource info */}
            {node.type === 'resource' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Resource</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Type</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}>{node.data.resource}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Rate</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>+{node.data.rate}/harvest</div>
                  </div>
                </div>
                {node.data.mineable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Pickaxe size={11} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>mineable</span>
                  </div>
                )}
              </div>
            )}

            {/* Compute node info */}
            {node.type === 'compute' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Compute Puzzle</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Difficulty</div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
                      color: node.data.difficulty === 'easy' ? '#4ade80' : node.data.difficulty === 'medium' ? '#60a5fa' : '#f59e0b',
                    }}>
                      {node.data.difficulty || 'easy'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Reward</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--data-color)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.rewardResource || 'data'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Solved</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.solveCount || 0}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginTop: 4 }}>
                  Send a worker here, then <span style={{ color: 'var(--accent)' }}>node = self.get_current_node()</span> to get a ComputeNode. Call <span style={{ color: 'var(--accent)' }}>node.get_task()</span> and <span style={{ color: 'var(--accent)' }}>node.submit(task_id, answer)</span>.
                </div>
                {/* Pluggable dialog buttons */}
                {NODE_DIALOG_REGISTRY[node.type] && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {Object.entries(NODE_DIALOG_REGISTRY[node.type]).map(([key, configFn]) => {
                      const cfg = configFn(node.data);
                      return (
                        <button key={key} onClick={() => setActiveDialog(cfg)} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                          color: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>
                          <Info size={10} /> {cfg.buttonLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cache node info */}
            {node.type === 'cache' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Cache Service</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Range</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                      {node.data.cacheRange || 1} hop{(node.data.cacheRange || 1) > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Capacity</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                      {node.data.cacheCapacity || 10} keys
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Level</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.upgradeLevel || 1}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginTop: 4 }}>
                  <span style={{ color: 'var(--accent)' }}>cache = self.get_service("{node.id}")</span><br />
                  <span style={{ color: 'var(--accent)' }}>cache.set(key, val)</span> / <span style={{ color: 'var(--accent)' }}>cache.get(key)</span>
                </div>
              </div>
            )}

            {/* API Node spec */}
            {node.type === 'api' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>API Specification</SectionLabel>

                <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Pending</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                      {node.data.pendingRequests || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Level</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.upgradeLevel || 1}
                    </div>
                  </div>
                </div>

                {/* Endpoints */}
                <div style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    POST /compute
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}
                    {'{ op: "add"|"sub"|"mul"|"max"|"mod", a, b }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}
                    {'{ result: number }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Example:</span>{' '}
                    {'{ op:"add", a:12, b:8 } → { result: 20 }'}
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    POST /echo
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}
                    {'{ value: any }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}
                    {'{ value: any }'}
                  </div>
                </div>

                {/* Security warning */}
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    ⚠ SECURITY
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    Some requests arrive <span style={{ color: '#ef4444', fontWeight: 700 }}>without authentication</span> (has_token=False).
                    You MUST check <span style={{ color: 'var(--accent)' }}>request.has_token</span> and drop unauthenticated requests.
                    Responding to them causes a <span style={{ color: '#ef4444' }}>SECURITY BREACH</span> and infects this node.
                  </div>
                </div>

                {/* Code example */}
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginTop: 2 }}>
                  <span style={{ color: 'var(--accent)' }}>node = self.get_current_node()</span><br />
                  <span style={{ color: 'var(--accent)' }}>req = node.poll_for_request()</span><br />
                  <span style={{ color: '#ef4444' }}>if not req.has_token: return</span><br />
                  <span style={{ color: 'var(--accent)' }}>node.respond(req.id, {'{'} result {'}'} )</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {node.data.unlocked && node.type === 'resource' && (
                <>
                  <SectionLabel>Actions</SectionLabel>
                  <ActionButton onClick={handleGather} disabled={gathering}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <MousePointer size={12} />
                      {gathering ? 'GATHERING...' : `${t('node.gather')} (+10)`}
                    </span>
                  </ActionButton>
                </>
              )}

              {!node.data.unlocked && node.data.unlockCost && (
                <>
                  <SectionLabel>Unlock Cost</SectionLabel>
                  <CostBadge cost={node.data.unlockCost} />
                  <ActionButton
                    onClick={handleUnlock}
                    disabled={unlocking || !canAffordUnlock(node.data.unlockCost)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Lock size={12} />
                      {unlocking ? 'UNLOCKING...' : canAffordUnlock(node.data.unlockCost) ? t('node.unlock') : 'INSUFFICIENT RESOURCES'}
                    </span>
                  </ActionButton>
                </>
              )}

              {node.type === 'empty' && node.data.unlocked && (
                <>
                  <Divider />
                  <SectionLabel>Build Structure</SectionLabel>
                  {Object.entries(BUILD_COSTS).map(([type, cost]) => (
                    <div key={type} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 4, textTransform: 'uppercase' }}>
                        {type} Node
                      </div>
                      <CostBadge cost={cost} />
                      <ActionButton
                        onClick={() => handleBuild(type)}
                        disabled={building || !canAffordUnlock(cost)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {building ? 'BUILDING...' : canAffordUnlock(cost) ? `BUILD ${type.toUpperCase()}` : 'INSUFFICIENT RESOURCES'}
                        </span>
                      </ActionButton>
                    </div>
                  ))}
                </>
              )}

              {msg && <StatusMessage msg={msg} />}
            </div>

            {/* Upgrade + Chip section (unlocked nodes only) */}
            {(node.id === 'hub' || node.data.unlocked) && (
              <NodeUpgradeSection nodeId={node.id} node={node} />
            )}

            {/* Deploy button */}
            {canDeploy && (
              <>
                <Divider />
                <ActionButton onClick={() => setDeployOpen(true)}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Upload size={12} />
                    {t('worker.deploy')}
                  </span>
                </ActionButton>
              </>
            )}

            {/* Chip Slots — 4x2 grid at bottom */}
            {(node.id === 'hub' || node.data.unlocked) && (node.data.chipSlots || 0) > 0 && (
              <>
                <Divider />
                <ChipSlotManager nodeId={node.id} chipSlots={node.data.chipSlots || 0} installedChips={node.data.installedChips || []} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deploy dialog */}
      <AnimatePresence>
        {deployOpen && node && (
          <DeployDialog
            nodeId={node.id}
            nodeName={node.data.label}
            onClose={() => setDeployOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Node info dialog (pluggable) */}
      <AnimatePresence>
        {activeDialog && (
          <NodeInfoDialog config={activeDialog} onClose={() => setActiveDialog(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
