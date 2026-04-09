import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Pickaxe, Shield, Radio, Package, Zap, Mountain, Database, Check, ChevronRight, ArrowLeftRight, Cpu, MemoryStick } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect, useCallback, DragEvent } from 'react';
import axios from 'axios';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { getWorkerIcon } from '../constants/workerIcons';

import { ITEM_LABELS, ITEM_COLORS } from '../constants/colors';
import { useT } from '../hooks/useT';

// ── Config ──────────────────────────────────────────────────────────────────

const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe, pickaxe_iron: Pickaxe, pickaxe_diamond: Pickaxe,
  shield: Shield, beacon: Radio,
  cpu_basic: Cpu, cpu_advanced: Cpu,
  ram_basic: MemoryStick, ram_advanced: MemoryStick,
};
const SLOT_ACCEPTS: Record<string, string[]> = {
  Pickaxe: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'],
  Shield: ['shield'],
  Beacon: ['beacon'],
  CPU: ['cpu_basic', 'cpu_advanced'],
  RAM: ['ram_basic', 'ram_advanced'],
};

interface WorkerClassEntry {
  class_id: string;
  class_name: string;
  class_icon?: string;
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
  const { workers, playerInventory, nodes: gameNodes, edges: gameEdges, setEdgeSelectMode, setNodeSelectMode, setState, workerClasses: storeWorkerClasses } = useGameStore();
  const t = useT();
  const workerClasses = storeWorkerClasses as WorkerClassEntry[];
  const [selectedClass, setSelectedClass] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false); // true after successful deploy
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [unitCount, setUnitCount] = useState(1);
  // Per-unit equipment: equippedPerUnit[unitIndex][slotName] = itemType
  const [equippedPerUnit, setEquippedPerUnit] = useState<Record<string, string>[]>([{}]);
  // Per-unit hardware: cpuPerUnit[unitIndex], ramPerUnit[unitIndex]
  const [cpuPerUnit, setCpuPerUnit] = useState<number[]>([0]);
  const [ramPerUnit, setRamPerUnit] = useState<number[]>([0]);
  const [currentUnitIdx, setCurrentUnitIdx] = useState(0);
  // For Edge fields: stores [{ id, source, target }] (single edge)
  // For Route fields: stores nodeIds as string[] in routeNodes, resolved to edges at deploy
  const [routes, setRoutes] = useState<Record<string, { id: string; source: string; target: string }[]>>({});
  const [routeNodes, setRouteNodes] = useState<Record<string, string[]>>({});
  const [step, setStep] = useState(0);
  const [selectingRoute, setSelectingRoute] = useState<string | null>(null);

  const selectedClassEntry = workerClasses.find(c => c.class_id === selectedClass);

  const classItemSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'item').map(([name, f]) => ({ name, itemType: f.item_type || '', description: f.description }))
    : [];
  const itemSlots = classItemSlots;
  const routeSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'route' || f.type === 'edge').map(([name, f]) => ({ name, description: f.description, fieldType: f.type as 'route' | 'edge' }))
    : [];

  const hasRoutes = routeSlots.length > 0;
  const hasEquipment = true; // always show equipment step for hardware + items

  const steps: { label: string; key: string }[] = [{ label: 'Class', key: 'class' }];
  if (hasRoutes) steps.push({ label: 'Routes', key: 'routes' });
  if (hasEquipment) steps.push({ label: 'Equipment', key: 'equipment' });
  steps.push({ label: 'Deploy', key: 'deploy' });

  const currentStepKey = steps[step]?.key || 'class';

  // Current unit's equipment (for the equipment step)
  const equipped = equippedPerUnit[currentUnitIdx] || {};

  // Count ALL equipped items across all units (including CPU/RAM)
  const equippedCounts: Record<string, number> = {};
  for (const unitEquip of equippedPerUnit) {
    for (const t of Object.values(unitEquip)) equippedCounts[t] = (equippedCounts[t] || 0) + 1;
  }
  // Add CPU/RAM counts
  const totalCpuUsed = cpuPerUnit.reduce((s, n) => s + n, 0);
  const totalRamUsed = ramPerUnit.reduce((s, n) => s + n, 0);
  equippedCounts['cpu_basic'] = (equippedCounts['cpu_basic'] || 0) + totalCpuUsed;
  equippedCounts['ram_basic'] = (equippedCounts['ram_basic'] || 0) + totalRamUsed;
  const availableInventory = playerInventory.map(i => ({ ...i, count: i.count - (equippedCounts[i.itemType] || 0) })).filter(i => i.count > 0);

  // Current unit's hardware
  const currentCpu = cpuPerUnit[currentUnitIdx] || 0;
  const currentRam = ramPerUnit[currentUnitIdx] || 0;
  const baseCompute = 1;
  const totalCompute = baseCompute + currentCpu; // each cpu_basic = 1 compute point
  const baseCapacity = 50;
  const totalCapacity = baseCapacity + currentRam * 50; // each ram_basic = 50

  // Compute cost of all equipped items for current unit
  const COMPUTE_COSTS: Record<string, number> = { pickaxe_basic: 1, pickaxe_iron: 1, pickaxe_diamond: 2, beacon: 1 };
  const usedCompute = Object.values(equipped).reduce((s, itemType) => s + (COMPUTE_COSTS[itemType] || 0), 0);

  // Max CPU/RAM available globally
  const cpuOwned = playerInventory.find(i => i.itemType === 'cpu_basic')?.count || 0;
  const ramOwned = playerInventory.find(i => i.itemType === 'ram_basic')?.count || 0;
  const cpuAvailForUnit = cpuOwned - cpuPerUnit.reduce((s, n, i) => i === currentUnitIdx ? s : s + n, 0);
  const ramAvailForUnit = ramOwned - ramPerUnit.reduce((s, n, i) => i === currentUnitIdx ? s : s + n, 0);

  // Only class-defined item slots are required; CPU/RAM hardware slots are optional
  const allSlotsFilled = equippedPerUnit.every(ue => classItemSlots.every(s => !!ue[s.name]));
  const allRoutesFilled = routeSlots.every(s => routes[s.name]?.length > 0);

  // Initialize selected class from the store-provided list (WS-pushed).
  useEffect(() => {
    if (!selectedClass && workerClasses.length > 0) {
      setSelectedClass(workerClasses[0].class_id);
    }
  }, [workerClasses, selectedClass]);

  // Reset when class changes
  useEffect(() => {
    setEquippedPerUnit([{}]);
    setCurrentUnitIdx(0);
    setUnitCount(1);
    setRoutes({});
    setRouteNodes({});
    setStep(0);
    setDeployed(false);
    setMessage('');
  }, [selectedClass]);

  // Clean up selection modes on unmount
  useEffect(() => () => { setEdgeSelectMode(null); setNodeSelectMode(null); setState({ routePath: [] }); }, []);

  // Helper: find edge between two adjacent nodes
  const findEdgeBetween = useCallback((a: string, b: string) => {
    return gameEdges.find(e =>
      (e.source === a && e.target === b) || (e.source === b && e.target === a)
    );
  }, [gameEdges]);

  // Start selection mode
  const startRouteSelect = useCallback((fieldName: string, fieldType: 'edge' | 'route') => {
    setSelectingRoute(fieldName);
    if (fieldType === 'edge') {
      // Edge: single edge click, auto-done
      setEdgeSelectMode({
        fieldName,
        onSelect: (edge) => {
          setRoutes(prev => ({ ...prev, [fieldName]: [edge] }));
          setSelectingRoute(null);
          setEdgeSelectMode(null);
        },
      });
    } else {
      // Route: click nodes to build path
      setRouteNodes(prev => ({ ...prev, [fieldName]: [] }));
      setRoutes(prev => ({ ...prev, [fieldName]: [] }));
      setNodeSelectMode({
        fieldName,
        onSelect: (nodeId) => {
          setRouteNodes(prev => {
            const existing = prev[fieldName] || [];
            if (existing[existing.length - 1] === nodeId) return prev;
            const updated = [...existing, nodeId];

            // Resolve edges from node path
            const edges: { id: string; source: string; target: string }[] = [];
            for (let i = 0; i < updated.length - 1; i++) {
              const e = gameEdges.find(e =>
                (e.source === updated[i] && e.target === updated[i + 1]) ||
                (e.source === updated[i + 1] && e.target === updated[i])
              );
              if (e) edges.push({ id: e.id, source: updated[i], target: updated[i + 1] });
            }
            setRoutes(r => ({ ...r, [fieldName]: edges }));

            // Sync path to store for visual feedback
            setState({ routePath: updated });

            return { ...prev, [fieldName]: updated };
          });
        },
      });
    }
  }, [setEdgeSelectMode, setNodeSelectMode, gameEdges]);

  const finishRouteSelect = useCallback(() => {
    setSelectingRoute(null);
    setEdgeSelectMode(null);
    setNodeSelectMode(null);
    setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode]);

  const cancelRouteSelect = useCallback(() => {
    if (selectingRoute) {
      setRoutes(prev => { const n = { ...prev }; delete n[selectingRoute]; return n; });
      setRouteNodes(prev => { const n = { ...prev }; delete n[selectingRoute]; return n; });
    }
    setSelectingRoute(null);
    setEdgeSelectMode(null);
    setNodeSelectMode(null);
    setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode, selectingRoute]);

  const getNodeLabel = (id: string) => gameNodes.find(n => n.id === id)?.data?.label || id;

  const handleDeploy = async () => {
    if (!selectedClass || deploying || deployed) return;
    setDeploying(true);
    setMessage('');

    const routePayload: Record<string, string | string[]> = {};
    for (const [field, edges] of Object.entries(routes)) {
      if (!edges?.length) continue;
      // Find the slot to know if it's edge (single) or route (multi)
      const slot = routeSlots.find(s => s.name === field);
      if (slot?.fieldType === 'edge') {
        routePayload[field] = edges[0].id; // single edge ID
      } else {
        routePayload[field] = edges.map(e => e.id); // array of edge IDs
      }
    }

    try {
      const ids: string[] = [];
      for (let i = 0; i < unitCount; i++) {
        const body: any = { nodeId, classId: selectedClass };
        const unitEquip = { ...(equippedPerUnit[i] || {}) };
        // Add CPU/RAM counts to equippedItems
        const cpuN = cpuPerUnit[i] || 0;
        const ramN = ramPerUnit[i] || 0;
        if (cpuN > 0) { unitEquip.cpuCount = String(cpuN); unitEquip.cpuType = 'cpu_basic'; }
        if (ramN > 0) { unitEquip.ramCount = String(ramN); unitEquip.ramType = 'ram_basic'; }
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
      // Check only required (class-defined) item slots, not optional hardware slots
      for (const slot of classItemSlots) {
        const accepts = SLOT_ACCEPTS[slot.itemType] || [];
        const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
        if (owned < unitCount) return false;
      }
      return true;
    }
    if (currentStepKey === 'routes') return allRoutesFilled;
    if (currentStepKey === 'equipment') {
      if (!allSlotsFilled) return false;
      // Check compute budget for all units
      for (let i = 0; i < unitCount; i++) {
        const unitEquip = equippedPerUnit[i] || {};
        const unitCpu = cpuPerUnit[i] || 0;
        const unitCompute = 1 + unitCpu;
        const unitCost = Object.values(unitEquip).reduce((s, t) => s + (COMPUTE_COSTS[t] || 0), 0);
        if (unitCost > unitCompute) return false;
      }
      return true;
    }
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
            {routeSlot?.fieldType === 'route'
              ? `Click nodes to build path: ${routeSlot?.name}`
              : `Select an edge: ${routeSlot?.name}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {routeSlot?.fieldType === 'route'
              ? `Click nodes in order to define the path (${(routeNodes[selectingRoute!] || []).length} nodes selected)`
              : (routeSlot?.description || 'Click on a connection between two nodes')}
          </div>
        </div>
        {routeSlot?.fieldType === 'route' && (routeNodes[selectingRoute!] || []).length >= 2 && (
          <button onClick={finishRouteSelect} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)', border: 'none',
            color: '#000', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
          }}>
            Done
          </button>
        )}
        <button onClick={cancelRouteSelect} style={{
          padding: '6px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
        }}>
          {t('common.cancel')}
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
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>{t('ui.deploy_to')}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{nodeName}</div>
          </div>
          <button onClick={handleClose} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>

        {/* Progress */}
        {steps.length > 2 && <StepBar steps={steps} currentStep={step} />}

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center' }}>{t('ui.loading')}</div>
        ) : workerClasses.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center', lineHeight: 1.6 }}>
            {t('ui.no_worker_classes')}<br />{t('ui.run_code_server')}
          </div>
        ) : (
          <>
            {/* STEP: Class */}
            {currentStepKey === 'class' && (() => {
              // Check requirements
              const reqsMet = classItemSlots.every(slot => {
                const accepts = SLOT_ACCEPTS[slot.itemType] || [];
                const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
                return owned >= unitCount;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>{t('ui.worker_class')}</div>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {workerClasses.map(c => {
                          const Icon = getWorkerIcon(c.class_icon);
                          return <SelectItem key={c.class_id} value={c.class_id}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {c.class_name}</span></SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Class signature panel */}
                  {selectedClassEntry && (
                    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: `1px solid ${!reqsMet && classItemSlots.length > 0 ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Title */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(() => { const Icon = getWorkerIcon(selectedClassEntry.class_icon); return <Icon size={18} style={{ color: 'var(--accent)' }} />; })()}
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
                      {classItemSlots.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>
                            {t('ui.requires')}
                          </div>
                          {classItemSlots.map(slot => {
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
                            {t('ui.spec')}
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
                      {!reqsMet && classItemSlots.length > 0 && (
                        <div style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--danger)',
                          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--danger-dim)', border: '1px solid rgba(255,71,87,0.2)',
                        }}>
                          {t('ui.not_enough_items')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unit count selector */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {t('ui.deploy_count')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => { const n = Math.max(1, unitCount - 1); setUnitCount(n); setEquippedPerUnit(prev => prev.slice(0, n)); setCpuPerUnit(prev => prev.slice(0, n)); setRamPerUnit(prev => prev.slice(0, n)); setCurrentUnitIdx(i => Math.min(i, n - 1)); }}
                        style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        -
                      </button>
                      <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 32, textAlign: 'center' }}>
                        {unitCount}
                      </span>
                      <button onClick={() => { const n = unitCount + 1; setUnitCount(n); setEquippedPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push({}); return next; }); setCpuPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next; }); setRamPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next; }); }}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.configure_routes')}</div>
                {routeSlots.map(slot => {
                  const edges = routes[slot.name] || [];
                  const isEdge = slot.fieldType === 'edge';
                  const isSelecting = selectingRoute === slot.name;
                  const filled = edges.length > 0;
                  return (
                    <div key={slot.name} style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${isSelecting ? '#f59e0b' : filled ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{slot.name}</span>
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: isEdge ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)', color: isEdge ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              {isEdge ? 'Edge' : 'Route'}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{slot.description}</div>
                        </div>
                        {!isSelecting ? (
                          <button
                            onClick={() => startRouteSelect(slot.name, slot.fieldType)}
                            style={{
                              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                              background: filled ? 'var(--bg-primary)' : 'var(--accent)',
                              border: filled ? '1px solid var(--border)' : 'none',
                              color: filled ? 'var(--text-secondary)' : '#000',
                              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                            }}
                          >
                            {filled ? t('ui.change') : t('ui.select_on_map')}
                          </button>
                        ) : (
                          <button
                            onClick={finishRouteSelect}
                            style={{
                              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                              background: '#f59e0b', border: 'none', color: '#000',
                              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                              animation: 'pulse-connect 1.5s ease-in-out infinite',
                            }}
                          >
                            Done ({edges.length})
                          </button>
                        )}
                      </div>
                      {/* Show selected path */}
                      {filled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                          {isEdge ? (
                            // Edge: show source ↔ target
                            <span><span style={{ fontWeight: 700 }}>{getNodeLabel(edges[0].source)}</span> <span style={{ color: 'var(--text-muted)' }}>↔</span> <span style={{ fontWeight: 700 }}>{getNodeLabel(edges[0].target)}</span></span>
                          ) : (
                            // Route: show node path
                            (routeNodes[slot.name] || []).map((nid, i, arr) => (
                              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontWeight: 700 }}>{getNodeLabel(nid)}</span>
                                {i < arr.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                              </span>
                            ))
                          )}
                        </div>
                      )}
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
                      const unitFilled = classItemSlots.every(s => !!(equippedPerUnit[i] || {})[s.name]);
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

                {/* Hardware: CPU + RAM number inputs with summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                    HARDWARE
                  </div>

                  {/* Summary badges */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    }}>
                      <Cpu size={12} style={{ color: usedCompute > totalCompute ? 'var(--danger)' : '#f59e0b' }} />
                      <span style={{ color: usedCompute > totalCompute ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {usedCompute}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>/</span>
                      <span style={{ color: '#f59e0b' }}>{totalCompute}</span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    }}>
                      <MemoryStick size={12} style={{ color: '#a78bfa' }} />
                      <span style={{ color: '#a78bfa' }}>{totalCapacity}</span>
                    </div>
                  </div>

                  {/* CPU row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flex: 1 }}>CPU</span>
                    <button onClick={() => setCpuPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = Math.max(0, (n[currentUnitIdx] || 0) - 1); return n; })}
                      disabled={currentCpu <= 0}
                      style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)', cursor: currentCpu <= 0 ? 'not-allowed' : 'pointer', opacity: currentCpu <= 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      -
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>
                      {currentCpu}
                    </span>
                    <button onClick={() => setCpuPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = (n[currentUnitIdx] || 0) + 1; return n; })}
                      disabled={currentCpu >= cpuAvailForUnit}
                      style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)', cursor: currentCpu >= cpuAvailForUnit ? 'not-allowed' : 'pointer', opacity: currentCpu >= cpuAvailForUnit ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      +
                    </button>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ({cpuAvailForUnit})
                    </span>
                  </div>

                  {/* RAM row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MemoryStick size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flex: 1 }}>RAM</span>
                    <button onClick={() => setRamPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = Math.max(0, (n[currentUnitIdx] || 0) - 1); return n; })}
                      disabled={currentRam <= 0}
                      style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)', cursor: currentRam <= 0 ? 'not-allowed' : 'pointer', opacity: currentRam <= 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      -
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>
                      {currentRam}
                    </span>
                    <button onClick={() => setRamPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = (n[currentUnitIdx] || 0) + 1; return n; })}
                      disabled={currentRam >= ramAvailForUnit}
                      style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)', cursor: currentRam >= ramAvailForUnit ? 'not-allowed' : 'pointer', opacity: currentRam >= ramAvailForUnit ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      +
                    </button>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ({ramAvailForUnit})
                    </span>
                  </div>
                </div>

                {/* Equipment slots (class-defined items) */}
                {classItemSlots.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                      {t('ui.equipment')}
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
                  </>
                )}

                {/* Inventory (for drag-drop) */}
                {classItemSlots.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.inventory')}</div>
                    {availableInventory.filter(i => !['cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced'].includes(i.itemType)).length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '12px 0' }}>{t('ui.no_items_craft')}</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {availableInventory.filter(i => !['cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced'].includes(i.itemType)).map(item => (
                          <InvItem key={item.itemType} item={item}
                            disabled={!itemSlots.some(s => (SLOT_ACCEPTS[s.itemType] || []).includes(item.itemType))} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP: Deploy (confirm) */}
            {currentStepKey === 'deploy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.confirm_deploy')}</div>
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
                  {Object.entries(routes).map(([name, edges]) => (
                    <div key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{name}: </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {edges.map((e, i) => (i === 0 ? getNodeLabel(e.source) + ' → ' : '') + getNodeLabel(e.target)).join(' → ')}
                      </span>
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
                }}>{t('ui.back')}</button>
              )}
              {step === 0 && (
                <button onClick={handleClose} style={{
                  flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  padding: '12px', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}>{t('common.cancel')}</button>
              )}
              {isLastStep ? (
                <button onClick={handleDeploy} disabled={deploying || deployed} style={{
                  flex: 2, background: deploying || deployed ? 'var(--bg-elevated)' : 'var(--accent)', color: deploying || deployed ? 'var(--text-muted)' : '#000',
                  border: deploying || deployed ? '1px solid var(--border)' : 'none', borderRadius: 'var(--radius-sm)',
                  padding: '12px', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
                  cursor: deploying || deployed ? 'not-allowed' : 'pointer', opacity: deploying || deployed ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Upload size={14} /> {deploying ? t('ui.deploying', { n: unitCount }) : t(unitCount > 1 ? 'ui.deploy_n_plural' : 'ui.deploy_n', { n: unitCount })}
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
                  {t('ui.next')} <ChevronRight size={14} />
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
