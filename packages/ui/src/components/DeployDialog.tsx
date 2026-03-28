import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Pickaxe, Shield, Radio, Package, Zap, Mountain, Database, Check, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect, useCallback, DragEvent } from 'react';
import axios from 'axios';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ── Config ──────────────────────────────────────────────────────────────────

const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe, pickaxe_iron: Pickaxe, pickaxe_diamond: Pickaxe,
  shield: Shield, beacon: Radio,
};
const ITEM_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe', pickaxe_iron: 'Iron Pickaxe', pickaxe_diamond: 'Diamond Pickaxe',
  shield: 'Shield', beacon: 'Beacon',
};
const ITEM_COLORS: Record<string, string> = {
  pickaxe_basic: '#9ca3af', pickaxe_iron: '#c0c0c0', pickaxe_diamond: '#60a5fa',
  shield: '#4ade80', beacon: '#00d4aa',
};
const SLOT_ACCEPTS: Record<string, string[]> = {
  Pickaxe: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'],
  Shield: ['shield'],
  Beacon: ['beacon'],
};

interface WorkerClassEntry {
  class_id: string;
  class_name: string;
  fields: Record<string, { type: string; field: string; description: string; item_type?: string }>;
  docstring: string;
  file: string;
  language: string;
}

// ── Step indicator ──────────────────────────────────────────────────────────

function StepBar({ steps, currentStep }: { steps: { label: string; key: string }[]; currentStep: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: isCurrent ? 'var(--accent-dim)' : 'transparent',
              border: isCurrent ? '1px solid rgba(0,212,170,0.25)' : '1px solid transparent',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
                background: isDone ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--bg-elevated)',
                color: isDone || isCurrent ? '#000' : 'var(--text-muted)',
                border: `1px solid ${isDone || isCurrent ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {isDone ? <Check size={10} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-muted)', margin: '0 2px' }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Equip slot ──────────────────────────────────────────────────────────────

function EquipSlot({ slotName, acceptType, equipped, onEquip, onUnequip }: {
  slotName: string; acceptType: string; equipped: InventoryItem | null;
  onEquip: (t: string) => void; onUnequip: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const accepts = SLOT_ACCEPTS[acceptType] || [];
  const handleDragOver = (e: DragEvent) => {
    const t = e.dataTransfer.types.find(t => t.startsWith('item/'));
    if (t && accepts.includes(t.replace('item/', ''))) { e.preventDefault(); setDragOver(true); }
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const t = e.dataTransfer.getData('itemType');
    if (t && accepts.includes(t)) onEquip(t);
  };
  const Icon = equipped ? (ITEM_ICONS[equipped.itemType] || Package) : null;
  const color = equipped ? (ITEM_COLORS[equipped.itemType] || '#666') : 'var(--border-bright)';

  return (
    <div onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
      onClick={() => equipped && onUnequip()}
      style={{
        width: 90, height: 100, borderRadius: 'var(--radius-md)',
        border: `2px ${equipped ? 'solid' : 'dashed'} ${dragOver ? 'var(--accent)' : equipped ? color : 'var(--border-bright)'}`,
        background: dragOver ? 'var(--accent-dim)' : equipped ? 'var(--bg-elevated)' : 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: equipped ? 'pointer' : 'default', transition: 'all 0.15s', position: 'relative',
      }}
      title={equipped ? 'Click to unequip' : `Drag ${acceptType}`}
    >
      {equipped ? (
        <>
          {Icon && <Icon size={24} style={{ color }} />}
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center' }}>
            {ITEM_LABELS[equipped.itemType] || equipped.itemType}
          </span>
          <div style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>×</div>
        </>
      ) : (
        <>
          <div style={{ width: 28, height: 28, borderRadius: 8, border: '1px dashed var(--border-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>?</span>
          </div>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center' }}>{slotName}</span>
        </>
      )}
    </div>
  );
}

function InvItem({ item, disabled }: { item: InventoryItem; disabled: boolean }) {
  const Icon = ITEM_ICONS[item.itemType] || Package;
  const color = ITEM_COLORS[item.itemType] || '#666';
  return (
    <div draggable={!disabled} onDragStart={e => {
      if (disabled) { e.preventDefault(); return; }
      e.dataTransfer.setData('itemType', item.itemType);
      e.dataTransfer.setData(`item/${item.itemType}`, '1');
    }} style={{
      width: 72, height: 80, borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      cursor: disabled ? 'not-allowed' : 'grab', opacity: disabled ? 0.3 : 1, position: 'relative',
    }}>
      <Icon size={20} style={{ color }} />
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center' }}>
        {ITEM_LABELS[item.itemType] || item.itemType}
      </span>
      <div style={{ position: 'absolute', top: -5, right: -5, background: color, color: '#000', borderRadius: '999px', fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.count}</div>
    </div>
  );
}

// ── Deploy Dialog ───────────────────────────────────────────────────────────

export function DeployDialog({ nodeId, nodeName, onClose }: {
  nodeId: string; nodeName: string; onClose: () => void;
}) {
  const { workers, playerInventory, nodes: gameNodes, setEdgeSelectMode } = useGameStore();
  const [workerClasses, setWorkerClasses] = useState<WorkerClassEntry[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false); // true after successful deploy
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [unitCount, setUnitCount] = useState(1);
  // Per-unit equipment: equippedPerUnit[unitIndex][slotName] = itemType
  const [equippedPerUnit, setEquippedPerUnit] = useState<Record<string, string>[]>([{}]);
  const [currentUnitIdx, setCurrentUnitIdx] = useState(0);
  const [routes, setRoutes] = useState<Record<string, { id: string; source: string; target: string }>>({});
  const [step, setStep] = useState(0);
  const [selectingRoute, setSelectingRoute] = useState<string | null>(null);

  const selectedClassEntry = workerClasses.find(c => c.class_id === selectedClass);

  const itemSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'item').map(([name, f]) => ({ name, itemType: f.item_type || '', description: f.description }))
    : [];
  const routeSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'route').map(([name, f]) => ({ name, description: f.description }))
    : [];

  const hasRoutes = routeSlots.length > 0;
  const hasEquipment = itemSlots.length > 0;

  const steps: { label: string; key: string }[] = [{ label: 'Class', key: 'class' }];
  if (hasRoutes) steps.push({ label: 'Routes', key: 'routes' });
  if (hasEquipment) steps.push({ label: 'Equipment', key: 'equipment' });
  steps.push({ label: 'Deploy', key: 'deploy' });

  const currentStepKey = steps[step]?.key || 'class';

  // Current unit's equipment (for the equipment step)
  const equipped = equippedPerUnit[currentUnitIdx] || {};

  // Count ALL equipped items across all units
  const equippedCounts: Record<string, number> = {};
  for (const unitEquip of equippedPerUnit) {
    for (const t of Object.values(unitEquip)) equippedCounts[t] = (equippedCounts[t] || 0) + 1;
  }
  const availableInventory = playerInventory.map(i => ({ ...i, count: i.count - (equippedCounts[i.itemType] || 0) })).filter(i => i.count > 0);

  const allSlotsFilled = equippedPerUnit.every(ue => itemSlots.every(s => !!ue[s.name]));
  const allRoutesFilled = routeSlots.every(s => !!routes[s.name]);

  useEffect(() => {
    axios.get('/api/worker-classes').then(r => {
      const cls = r.data.classes || [];
      setWorkerClasses(cls);
      if (cls.length > 0) setSelectedClass(cls[0].class_id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Reset when class changes
  useEffect(() => {
    setEquippedPerUnit([{}]);
    setCurrentUnitIdx(0);
    setUnitCount(1);
    setRoutes({});
    setStep(0);
    setDeployed(false);
    setMessage('');
  }, [selectedClass]);

  // Clean up edge select mode on unmount
  useEffect(() => () => setEdgeSelectMode(null), []);

  // Start edge selection mode for a route field
  const startRouteSelect = useCallback((fieldName: string) => {
    setSelectingRoute(fieldName);
    setEdgeSelectMode({
      fieldName,
      onSelect: (edge) => {
        setRoutes(prev => ({ ...prev, [fieldName]: edge }));
        setSelectingRoute(null);
        setEdgeSelectMode(null);
      },
    });
  }, [setEdgeSelectMode]);

  const cancelRouteSelect = useCallback(() => {
    setSelectingRoute(null);
    setEdgeSelectMode(null);
  }, [setEdgeSelectMode]);

  const getNodeLabel = (id: string) => gameNodes.find(n => n.id === id)?.data?.label || id;

  const handleDeploy = async () => {
    if (!selectedClass || deploying || deployed) return;
    setDeploying(true);
    setMessage('');

    const routePayload: Record<string, string> = {};
    for (const [field, edge] of Object.entries(routes)) {
      routePayload[field] = edge.id; // Send edge ID
    }

    try {
      const ids: string[] = [];
      for (let i = 0; i < unitCount; i++) {
        const body: any = { nodeId, classId: selectedClass };
        const unitEquip = equippedPerUnit[i] || {};
        if (Object.keys(unitEquip).length > 0) body.equippedItems = unitEquip;
        if (Object.keys(routePayload).length > 0) body.routes = routePayload;
        const res = await axios.post('/api/deploy', body);
        ids.push(res.data.workerId);
      }
      setDeployed(true);
      setMessage(`Deployed ${ids.length} unit${ids.length > 1 ? 's' : ''}`);
      // Close immediately
      onClose();
    } catch (err: any) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
      setDeploying(false);
    }
  };

  const canGoNext = () => {
    if (currentStepKey === 'class') {
      if (!selectedClass || unitCount < 1) return false;
      // Check item requirements satisfiable for N units
      for (const slot of itemSlots) {
        const accepts = SLOT_ACCEPTS[slot.itemType] || [];
        const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
        if (owned < unitCount) return false;
      }
      return true;
    }
    if (currentStepKey === 'routes') return allRoutesFilled;
    if (currentStepKey === 'equipment') return allSlotsFilled;
    return true;
  };

  const isLastStep = step === steps.length - 1;

  const handleClose = () => {
    setEdgeSelectMode(null);
    onClose();
  };

  // If in route selection mode, show minimal overlay
  if (selectingRoute) {
    const routeSlot = routeSlots.find(s => s.name === selectingRoute);
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)',
          padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
          boxShadow: '0 0 8px var(--accent)', animation: 'pulse-glow 1.5s infinite',
        }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            Select an edge for: {routeSlot?.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {routeSlot?.description || 'Click on a connection between two nodes'}
          </div>
        </div>
        <button onClick={cancelRouteSelect} style={{
          padding: '6px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
        }}>
          Cancel
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
          padding: 24, width: 520, maxWidth: 'calc(100vw - 64px)',
          maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>DEPLOY TO</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{nodeName}</div>
          </div>
          <button onClick={handleClose} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>

        {/* Progress */}
        {steps.length > 2 && <StepBar steps={steps} currentStep={step} />}

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center' }}>Loading...</div>
        ) : workerClasses.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center', lineHeight: 1.6 }}>
            No worker classes found.<br />Run <span style={{ color: 'var(--accent)' }}>uv run main.py</span> in workspace/.
          </div>
        ) : (
          <>
            {/* STEP: Class */}
            {currentStepKey === 'class' && (() => {
              // Check requirements
              const reqsMet = itemSlots.every(slot => {
                const accepts = SLOT_ACCEPTS[slot.itemType] || [];
                const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
                return owned >= unitCount;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>WORKER CLASS</div>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {workerClasses.map(c => <SelectItem key={c.class_id} value={c.class_id}>{c.class_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Class signature panel */}
                  {selectedClassEntry && (
                    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: `1px solid ${!reqsMet && itemSlots.length > 0 ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Title */}
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {selectedClassEntry.class_name}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                          ({selectedClassEntry.class_id})
                        </span>
                      </div>

                      {/* Description */}
                      {selectedClassEntry.docstring && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                          {selectedClassEntry.docstring}
                        </div>
                      )}

                      {/* Requirements (items) */}
                      {itemSlots.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>
                            REQUIRES
                          </div>
                          {itemSlots.map(slot => {
                            const accepts = SLOT_ACCEPTS[slot.itemType] || [];
                            const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
                            const met = owned >= unitCount;
                            const Icon = ITEM_ICONS[accepts[0]] || Package;
                            return (
                              <div key={slot.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                                <Icon size={14} style={{ color: met ? (ITEM_COLORS[accepts[0]] || '#666') : 'var(--danger)' }} />
                                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: met ? 'var(--text-primary)' : 'var(--danger)', fontWeight: 600 }}>
                                  {slot.itemType}
                                </span>
                                <span style={{
                                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                                  color: met ? 'var(--success)' : 'var(--danger)',
                                  marginLeft: 'auto',
                                }}>
                                  {owned}/{unitCount}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Spec (routes) */}
                      {routeSlots.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>
                            SPEC
                          </div>
                          {routeSlots.map(slot => (
                            <div key={slot.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                              <Radio size={14} style={{ color: 'var(--accent-secondary)' }} />
                              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                                Route {slot.name}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                                {slot.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* File info */}
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        {selectedClassEntry.file.split('/').pop()} · {selectedClassEntry.language}
                      </div>

                      {/* Requirements not met warning */}
                      {!reqsMet && itemSlots.length > 0 && (
                        <div style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--danger)',
                          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--danger-dim)', border: '1px solid rgba(255,71,87,0.2)',
                        }}>
                          Not enough items for {unitCount} unit{unitCount > 1 ? 's' : ''} — craft more in Inventory
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unit count selector */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>
                      DEPLOY COUNT
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => { const n = Math.max(1, unitCount - 1); setUnitCount(n); setEquippedPerUnit(prev => prev.slice(0, n)); setCurrentUnitIdx(i => Math.min(i, n - 1)); }}
                        style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        -
                      </button>
                      <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 32, textAlign: 'center' }}>
                        {unitCount}
                      </span>
                      <button onClick={() => { const n = unitCount + 1; setUnitCount(n); setEquippedPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push({}); return next; }); }}
                        style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* STEP: Routes */}
            {currentStepKey === 'routes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>CONFIGURE ROUTES</div>
                {routeSlots.map(slot => {
                  const selected = routes[slot.name];
                  return (
                    <div key={slot.name} style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{slot.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{slot.description}</div>
                        {selected && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                              {getNodeLabel(selected.source)} <ArrowLeftRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {getNodeLabel(selected.target)}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => startRouteSelect(slot.name)}
                        style={{
                          padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                          background: selected ? 'var(--bg-primary)' : 'var(--accent)',
                          border: selected ? '1px solid var(--border)' : 'none',
                          color: selected ? 'var(--text-secondary)' : '#000',
                          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                        }}
                      >
                        {selected ? 'Change' : 'Select on map'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* STEP: Equipment (per-unit tabs) */}
            {currentStepKey === 'equipment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Unit tabs */}
                {unitCount > 1 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: unitCount }).map((_, i) => {
                      const unitFilled = itemSlots.every(s => !!(equippedPerUnit[i] || {})[s.name]);
                      return (
                        <button key={i} onClick={() => setCurrentUnitIdx(i)} style={{
                          padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                          background: i === currentUnitIdx ? 'var(--accent-dim)' : 'transparent',
                          border: `1px solid ${i === currentUnitIdx ? 'rgba(0,212,170,0.25)' : 'var(--border)'}`,
                          color: i === currentUnitIdx ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          Unit {i + 1}
                          {unitFilled && <Check size={10} style={{ color: 'var(--success)' }} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                  {unitCount > 1 ? `UNIT ${currentUnitIdx + 1} EQUIPMENT` : 'EQUIPMENT'}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {itemSlots.map(slot => (
                    <EquipSlot key={slot.name} slotName={slot.name} acceptType={slot.itemType}
                      equipped={equipped[slot.name] ? playerInventory.find(i => i.itemType === equipped[slot.name]) || null : null}
                      onEquip={t => {
                        setEquippedPerUnit(prev => {
                          const next = [...prev];
                          next[currentUnitIdx] = { ...(next[currentUnitIdx] || {}), [slot.name]: t };
                          return next;
                        });
                      }}
                      onUnequip={() => {
                        setEquippedPerUnit(prev => {
                          const next = [...prev];
                          const u = { ...(next[currentUnitIdx] || {}) };
                          delete u[slot.name];
                          next[currentUnitIdx] = u;
                          return next;
                        });
                      }} />
                  ))}
                </div>
                {!allSlotsFilled && <div style={{ fontSize: 10, color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>
                  {unitCount > 1 ? `Fill equipment for all ${unitCount} units` : 'Drag items from below to fill slots'}
                </div>}
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>INVENTORY</div>
                {availableInventory.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '12px 0' }}>No items. Craft some in Inventory.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {availableInventory.map(item => (
                      <InvItem key={item.itemType} item={item}
                        disabled={!itemSlots.some(s => (SLOT_ACCEPTS[s.itemType] || []).includes(item.itemType))} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP: Deploy (confirm) */}
            {currentStepKey === 'deploy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>CONFIRM DEPLOYMENT</div>
                <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Class: </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedClassEntry?.class_name}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 8 }}>x{unitCount}</span>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Node: </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{nodeName}</span>
                  </div>
                  {Object.entries(routes).map(([name, edge]) => (
                    <div key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{name}: </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{getNodeLabel(edge.source)} <ArrowLeftRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {getNodeLabel(edge.target)}</span>
                    </div>
                  ))}
                  {Object.entries(equipped).map(([name, itemType]) => (
                    <div key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{name}: </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{ITEM_LABELS[itemType] || itemType}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 10 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} style={{
                  flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  padding: '12px', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}>Back</button>
              )}
              {step === 0 && (
                <button onClick={handleClose} style={{
                  flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  padding: '12px', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}>Cancel</button>
              )}
              {isLastStep ? (
                <button onClick={handleDeploy} disabled={deploying || deployed} style={{
                  flex: 2, background: deploying || deployed ? 'var(--bg-elevated)' : 'var(--accent)', color: deploying || deployed ? 'var(--text-muted)' : '#000',
                  border: deploying || deployed ? '1px solid var(--border)' : 'none', borderRadius: 'var(--radius-sm)',
                  padding: '12px', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
                  cursor: deploying || deployed ? 'not-allowed' : 'pointer', opacity: deploying || deployed ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Upload size={14} /> {deploying ? `DEPLOYING ${unitCount}...` : `DEPLOY ${unitCount} WORKER${unitCount > 1 ? 'S' : ''}`}
                </button>
              ) : (
                <button onClick={() => setStep(s => s + 1)} disabled={!canGoNext()} style={{
                  flex: 2, background: canGoNext() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: canGoNext() ? '#000' : 'var(--text-muted)',
                  border: canGoNext() ? 'none' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '12px', fontSize: 13, fontWeight: 800,
                  fontFamily: 'var(--font-mono)', cursor: canGoNext() ? 'pointer' : 'not-allowed',
                  opacity: canGoNext() ? 1 : 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {message && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{
                  fontSize: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: message.startsWith('Error') ? 'var(--danger-dim)' : 'rgba(46,213,115,0.1)',
                  border: `1px solid ${message.startsWith('Error') ? 'rgba(255,71,87,0.2)' : 'rgba(46,213,115,0.2)'}`,
                  color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)', textAlign: 'center',
                }}>{message}</motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
