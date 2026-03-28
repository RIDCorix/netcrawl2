import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Mountain, Database, Play, Lock, AlertTriangle, MousePointer, PauseCircle, Pickaxe } from 'lucide-react';
import { useGameStore, GameNode, Resources, InventoryItem } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { CraftPanel } from './CraftPanel';

function CostBadge({ cost }: { cost: Partial<Resources> }) {
  const icons: any = { energy: Zap, ore: Mountain, data: Database };
  const colors: any = { energy: 'var(--energy-color)', ore: 'var(--ore-color)', data: 'var(--data-color)' };
  return (
    <div className="flex gap-2 flex-wrap mt-1">
      {Object.entries(cost).map(([key, val]) => {
        const Icon = icons[key];
        return (
          <div key={key} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: colors[key] }}>
            {Icon && <Icon size={11} />}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function Button({ onClick, children, variant = 'primary', disabled = false }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
}) {
  const colors: any = {
    primary: { bg: 'var(--accent)', text: '#000' },
    danger: { bg: 'var(--danger)', text: '#fff' },
    secondary: { bg: 'var(--bg-elevated)', text: 'var(--text-primary)' },
  };
  const c = colors[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'var(--bg-elevated)' : c.bg,
        color: disabled ? 'var(--text-muted)' : c.text,
        border: 'none',
        borderRadius: '6px',
        padding: '6px 14px',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s, transform 0.1s',
      }}
      onMouseDown={e => { if (!disabled) (e.target as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}

const PICKAXE_ITEM_TYPES = ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'];
const PICKAXE_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe (eff 1.0×)',
  pickaxe_iron: 'Iron Pickaxe (eff 1.5×)',
  pickaxe_diamond: 'Diamond Pickaxe (eff 2.5×)',
};

function DeployPanel({ nodeId, workerClasses }: { nodeId: string; workerClasses: any[] }) {
  const { workers, playerInventory } = useGameStore();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedRevision, setSelectedRevision] = useState('HEAD');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedPickaxe, setSelectedPickaxe] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState('');

  // Block deploy if there's already a running or suspending worker at this node
  const blockingWorker = workers.find(
    w => w.node_id === nodeId && (w.status === 'running' || w.status === 'suspending')
  );

  // Available pickaxes in inventory
  const availablePickaxes = playerInventory.filter(i => PICKAXE_ITEM_TYPES.includes(i.itemType) && i.count > 0);

  // Check if selected class requires a pickaxe
  const selectedClassEntry = workerClasses.find(c => c.class_name === selectedClass);
  const requiresPickaxe = selectedClassEntry?.fields
    ? Object.values(selectedClassEntry.fields as Record<string, any>).some(
        (f: any) => f.item_type === 'Pickaxe' || f.type === 'item'
      )
    : false;

  useEffect(() => {
    axios.get('/api/revisions').then(r => {
      const revs = r.data.revisions || [];
      setRevisions(revs);
    }).catch(() => {});

    axios.get('/api/classes').then(r => {
      const cls = r.data.classes || [];
      setClasses(cls);
      if (cls.length > 0) setSelectedClass(cls[0]);
    }).catch(() => {});
  }, []);

  // Auto-select first available pickaxe
  useEffect(() => {
    if (availablePickaxes.length > 0 && !selectedPickaxe) {
      setSelectedPickaxe(availablePickaxes[0].itemType);
    }
  }, [availablePickaxes, selectedPickaxe]);

  const handleDeploy = async () => {
    if (!selectedClass) return;
    setDeploying(true);
    setMessage('');
    try {
      const body: any = {
        nodeId,
        className: selectedClass,
        commitHash: selectedRevision,
      };
      if (requiresPickaxe && selectedPickaxe) {
        body.equippedItems = { pickaxe: selectedPickaxe };
      }
      const res = await axios.post('/api/deploy', body);
      setMessage(`Deployed worker: ${res.data.workerId}`);
    } catch (err: any) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeploying(false);
    }
  };

  const selectStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '6px',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    width: '100%',
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
      <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        DEPLOY WORKER
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Revision</label>
          <select style={selectStyle} value={selectedRevision} onChange={e => setSelectedRevision(e.target.value)}>
            <option value="HEAD">HEAD (latest)</option>
            {revisions.map((r: any) => (
              <option key={r.hash} value={r.hash}>{r.shortHash} — {r.message}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Class</label>
          <select style={selectStyle} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            {classes.length === 0 && <option value="">No workers found</option>}
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Pickaxe selector — shown for classes that require a pickaxe OR always if pickaxes are available */}
        {availablePickaxes.length > 0 && (
          <div>
            <label className="text-xs block mb-1 flex items-center gap-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <Pickaxe size={11} />
              Pickaxe (Equipment)
            </label>
            <select
              style={selectStyle}
              value={selectedPickaxe}
              onChange={e => setSelectedPickaxe(e.target.value)}
            >
              <option value="">-- None --</option>
              {availablePickaxes.map(item => (
                <option key={item.itemType} value={item.itemType}>
                  {PICKAXE_LABELS[item.itemType] || item.itemType} (×{item.count})
                </option>
              ))}
            </select>
            {requiresPickaxe && !selectedPickaxe && (
              <div className="text-xs mt-1" style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                This class requires a pickaxe
              </div>
            )}
          </div>
        )}

        {availablePickaxes.length === 0 && requiresPickaxe && (
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Pickaxe size={11} />
            No pickaxes in inventory — craft one first
          </div>
        )}

        {blockingWorker && (
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs"
            style={{
              background: 'rgba(250,204,21,0.08)',
              border: '1px solid rgba(250,204,21,0.25)',
              color: '#facc15',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <PauseCircle size={11} />
            Suspend active worker first
          </div>
        )}
        <Button onClick={handleDeploy} disabled={deploying || !selectedClass || !!blockingWorker || (requiresPickaxe && !selectedPickaxe && availablePickaxes.length === 0)}>
          {deploying ? 'Deploying...' : 'Deploy'}
        </Button>

        {message && (
          <div className="text-xs mt-1 px-2 py-1 rounded" style={{
            background: message.startsWith('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
            fontFamily: 'var(--font-mono)',
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export function NodeDetailPanel() {
  const { selectedNodeId, nodes, resources, selectNode } = useGameStore();
  const [gathering, setGathering] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState('');
  const [workerClasses, setWorkerClasses] = useState<any[]>([]);

  const node = nodes.find((n: any) => n.id === selectedNodeId);

  useEffect(() => {
    // Fetch worker classes to check if pickaxe is required
    axios.get('/api/worker-classes').then(r => {
      setWorkerClasses(r.data.classes || []);
    }).catch(() => {});
  }, []);

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

  const canAffordUnlock = (cost: Partial<Resources>) => {
    return Object.entries(cost).every(([k, v]) => (resources as any)[k] >= v);
  };

  return (
    <AnimatePresence>
      {selectedNodeId && node && (
        <motion.div
          key={selectedNodeId}
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            position: 'fixed',
            right: 16,
            top: 72,
            bottom: 16,
            width: 300,
            background: 'var(--bg-glass-heavy)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            zIndex: 40,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                {node.type.toUpperCase()}
              </div>
              <div className="text-base font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {node.data.label}
              </div>
            </div>
            <button
              onClick={() => selectNode(null)}
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Node ID */}
          <div className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            id: {node.id}
          </div>

          {/* Status */}
          {node.type === 'infected' || node.data.infected ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--danger)' }}>
              <AlertTriangle size={14} color="var(--danger)" />
              <span className="text-xs" style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>INFECTED — Deploy a Guardian to repair</span>
            </div>
          ) : null}

          {/* Depletion status */}
          {node.data.depleted && (
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span className="text-xs" style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                DEPLETED — recovers in {node.data.depletedUntil ? Math.max(0, Math.ceil((node.data.depletedUntil - Date.now()) / 1000)) : '?'}s
              </span>
            </div>
          )}

          {/* Drops on node */}
          {Array.isArray(node.data.drops) && node.data.drops.length > 0 && (
            <div className="px-2 py-1.5 rounded" style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)' }}>
              <div className="text-xs font-semibold mb-1" style={{ color: '#facc15', fontFamily: 'var(--font-mono)' }}>
                DROPS ON GROUND ({node.data.drops.length})
              </div>
              <div className="flex flex-col gap-0.5">
                {node.data.drops.map((drop: any) => (
                  <div key={drop.id} className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    • {drop.type} ×{drop.amount}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource info */}
          {node.type === 'resource' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                RESOURCE
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Type:</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{node.data.resource}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Rate:</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>+{node.data.rate}/harvest</span>
              </div>
              {node.data.mineable && (
                <div className="flex items-center gap-2 mt-1">
                  <Pickaxe size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>mineable</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }} className="flex flex-col gap-2">
            {/* Gather (unlocked resource nodes) */}
            {node.data.unlocked && node.type === 'resource' && (
              <>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                  ACTIONS
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleGather} disabled={gathering}>
                    <div className="flex items-center gap-1.5">
                      <MousePointer size={12} />
                      {gathering ? 'Gathering...' : 'Gather (+10)'}
                    </div>
                  </Button>
                </div>
              </>
            )}

            {/* Unlock */}
            {!node.data.unlocked && node.data.unlockCost && (
              <>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                  UNLOCK COST
                </div>
                <CostBadge cost={node.data.unlockCost} />
                <Button
                  onClick={handleUnlock}
                  disabled={unlocking || !canAffordUnlock(node.data.unlockCost)}
                >
                  <div className="flex items-center gap-1.5">
                    <Lock size={12} />
                    {unlocking ? 'Unlocking...' : canAffordUnlock(node.data.unlockCost) ? 'Unlock' : 'Cannot Afford'}
                  </div>
                </Button>
              </>
            )}

            {msg && (
              <div className="text-xs px-2 py-1 rounded" style={{
                background: msg.startsWith('Error') || msg.includes('failed') || msg.includes('enough') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: msg.startsWith('Error') || msg.includes('failed') || msg.includes('enough') ? 'var(--danger)' : 'var(--success)',
                fontFamily: 'var(--font-mono)',
              }}>
                {msg}
              </div>
            )}
          </div>

          {/* Craft panel (hub only) */}
          {node.id === 'hub' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <CraftPanel />
            </div>
          )}

          {/* Deploy panel for hub and unlocked nodes */}
          {(node.id === 'hub' || node.data.unlocked) && !node.data.infected && (
            <DeployPanel nodeId={node.id} workerClasses={workerClasses} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
