import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Zap, Mountain, Database, Pickaxe, PauseCircle } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';

const PICKAXE_ITEM_TYPES = ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'];
const PICKAXE_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe (1.0×)',
  pickaxe_iron: 'Iron Pickaxe (1.5×)',
  pickaxe_diamond: 'Diamond Pickaxe (2.5×)',
};

interface WorkerClassEntry {
  class_name: string;
  fields: Record<string, { type: string; field: string; description: string; item_type?: string }>;
  docstring: string;
  file: string;
  language: string;
}

export function DeployDialog({ nodeId, nodeName, onClose }: {
  nodeId: string;
  nodeName: string;
  onClose: () => void;
}) {
  const { workers, playerInventory } = useGameStore();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [workerClasses, setWorkerClasses] = useState<WorkerClassEntry[]>([]);
  const [selectedRevision, setSelectedRevision] = useState('HEAD');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedPickaxe, setSelectedPickaxe] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const blockingWorker = workers.find(
    w => w.node_id === nodeId && (w.status === 'running' || w.status === 'suspending')
  );

  const availablePickaxes = playerInventory.filter(
    i => PICKAXE_ITEM_TYPES.includes(i.itemType) && i.count > 0
  );

  const selectedClassEntry = workerClasses.find(c => c.class_name === selectedClass);
  const requiresPickaxe = selectedClassEntry?.fields
    ? Object.values(selectedClassEntry.fields).some(
        (f: any) => f.item_type === 'Pickaxe' || f.type === 'item'
      )
    : false;

  useEffect(() => {
    Promise.all([
      axios.get('/api/revisions').then(r => setRevisions(r.data.revisions || [])).catch(() => {}),
      axios.get('/api/worker-classes').then(r => {
        const cls = r.data.classes || [];
        setWorkerClasses(cls);
        if (cls.length > 0) setSelectedClass(cls[0].class_name);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

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
      setMessage(`Deployed: ${res.data.workerId}`);
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeploying(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    width: '100%',
    outline: 'none',
  };

  const canDeploy = selectedClass && !deploying && !blockingWorker &&
    !(requiresPickaxe && !selectedPickaxe && availablePickaxes.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          width: 440,
          maxWidth: 'calc(100vw - 64px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              DEPLOY TO
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              marginTop: 2,
            }}>
              {nodeName}
            </div>
          </div>
          <button
            onClick={onClose}
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

        {loading ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '20px 0', textAlign: 'center' }}>
            Loading worker classes...
          </div>
        ) : workerClasses.length === 0 ? (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            padding: '20px 0',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            No worker classes found.<br />
            Create a worker class in workspace/ to get started.
          </div>
        ) : (
          <>
            {/* Worker class selection */}
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
                WORKER CLASS
              </label>
              <select style={selectStyle} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                {workerClasses.map(c => (
                  <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                ))}
              </select>
            </div>

            {/* Selected class info */}
            {selectedClassEntry && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                  {selectedClassEntry.docstring || 'No description.'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
                  {selectedClassEntry.file} · {selectedClassEntry.language}
                </div>
              </div>
            )}

            {/* Revision */}
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
                REVISION
              </label>
              <select style={selectStyle} value={selectedRevision} onChange={e => setSelectedRevision(e.target.value)}>
                <option value="HEAD">HEAD (latest)</option>
                {revisions.map((r: any) => (
                  <option key={r.hash} value={r.hash}>{r.shortHash} — {r.message}</option>
                ))}
              </select>
            </div>

            {/* Pickaxe selector */}
            {availablePickaxes.length > 0 && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
                  <Pickaxe size={11} />
                  EQUIPMENT
                </label>
                <select style={selectStyle} value={selectedPickaxe} onChange={e => setSelectedPickaxe(e.target.value)}>
                  <option value="">-- None --</option>
                  {availablePickaxes.map(item => (
                    <option key={item.itemType} value={item.itemType}>
                      {PICKAXE_LABELS[item.itemType] || item.itemType} (×{item.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Warnings */}
            {requiresPickaxe && !selectedPickaxe && availablePickaxes.length === 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-dim)',
                border: '1px solid rgba(255, 71, 87, 0.25)',
                fontSize: 11,
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
              }}>
                <Pickaxe size={12} />
                No pickaxes — craft one in Inventory first
              </div>
            )}

            {blockingWorker && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(250,204,21,0.08)',
                border: '1px solid rgba(250,204,21,0.25)',
                fontSize: 11,
                color: '#facc15',
                fontFamily: 'var(--font-mono)',
              }}>
                <PauseCircle size={12} />
                Suspend active worker at this node first
              </div>
            )}

            {/* Deploy button */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={!canDeploy}
                style={{
                  flex: 2,
                  background: canDeploy ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: canDeploy ? '#000' : 'var(--text-muted)',
                  border: canDeploy ? 'none' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  cursor: canDeploy ? 'pointer' : 'not-allowed',
                  opacity: canDeploy ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  letterSpacing: '0.05em',
                }}
              >
                <Upload size={14} />
                {deploying ? 'DEPLOYING...' : 'DEPLOY WORKER'}
              </button>
            </div>

            {/* Status message */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  fontSize: 11,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: message.startsWith('Error') ? 'var(--danger-dim)' : 'rgba(46, 213, 115, 0.1)',
                  border: `1px solid ${message.startsWith('Error') ? 'rgba(255, 71, 87, 0.2)' : 'rgba(46, 213, 115, 0.2)'}`,
                  color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                {message}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
