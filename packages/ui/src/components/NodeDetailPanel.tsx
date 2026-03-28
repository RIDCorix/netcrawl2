import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Mountain, Database, Lock, AlertTriangle, MousePointer, Upload, Pickaxe, ArrowUp } from 'lucide-react';
import { useGameStore, GameNode, Resources } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { ChipSlotManager } from './ChipSlotManager';
import { DeployDialog } from './DeployDialog';

function CostBadge({ cost }: { cost: Partial<Resources> }) {
  const icons: any = { energy: Zap, ore: Mountain, data: Database };
  const colors: any = { energy: 'var(--energy-color)', ore: 'var(--ore-color)', data: 'var(--data-color)' };
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

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em',
      marginBottom: 8,
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{
    height: 1,
    background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)',
    margin: '4px 0',
  }} />;
}

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
  const [upgradeData, setUpgradeData] = useState<any>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  useEffect(() => {
    axios.get(`/api/node/upgrades?nodeId=${nodeId}`)
      .then(r => setUpgradeData(r.data))
      .catch(() => {});
  }, [nodeId, node.data.upgradeLevel]);

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
              {nextLevel.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {nextLevel.description}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <CostBadge cost={nextLevel.cost} />
            </div>
          </div>
        )}

        {nextLevel && (
          <ActionButton onClick={handleUpgrade} disabled={upgrading || !nextLevel.affordable}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ArrowUp size={12} />
              {upgrading ? 'UPGRADING...' : nextLevel.affordable ? `UPGRADE TO LV.${nextLevel.level}` : 'INSUFFICIENT RESOURCES'}
            </span>
          </ActionButton>
        )}

        {upgradeMsg && <StatusMessage msg={upgradeMsg} />}
      </div>

      {/* Chip Slots */}
      {chipSlots > 0 && (
        <>
          <Divider />
          <ChipSlotManager nodeId={nodeId} chipSlots={chipSlots} installedChips={installedChips} />
        </>
      )}
    </>
  );
}

export function NodeDetailPanel() {
  const { selectedNodeId, nodes, resources, selectNode } = useGameStore();
  const [gathering, setGathering] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);

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

  const getNodeColor = (n: GameNode) => {
    if (n.type === 'infected') return 'var(--danger)';
    if (n.type === 'hub') return 'var(--accent)';
    if (n.type === 'resource') {
      const colors: any = { energy: 'var(--energy-color)', ore: 'var(--ore-color)', data: 'var(--data-color)' };
      return colors[n.data.resource || ''] || 'var(--accent)';
    }
    if (n.type === 'relay') return 'var(--accent-secondary)';
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
                  INFECTED — Deploy a Guardian to repair
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
                  DEPLETED — recovers in {node.data.depletedUntil ? Math.max(0, Math.ceil((node.data.depletedUntil - Date.now()) / 1000)) : '?'}s
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

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {node.data.unlocked && node.type === 'resource' && (
                <>
                  <SectionLabel>Actions</SectionLabel>
                  <ActionButton onClick={handleGather} disabled={gathering}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <MousePointer size={12} />
                      {gathering ? 'GATHERING...' : 'GATHER (+10)'}
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
                      {unlocking ? 'UNLOCKING...' : canAffordUnlock(node.data.unlockCost) ? 'UNLOCK NODE' : 'INSUFFICIENT RESOURCES'}
                    </span>
                  </ActionButton>
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
                    DEPLOY WORKER
                  </span>
                </ActionButton>
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
    </>
  );
}
