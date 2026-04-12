import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, ChevronRight } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useT } from '../hooks/useT';
import { StepBar } from './deploy/StepBar';
import { SLOT_ACCEPTS } from './deploy/EquipSlot';
import { ClassStep, WorkerClassEntry } from './deploy/ClassStep';
import { RoutesStep } from './deploy/RoutesStep';
import { EquipmentStep } from './deploy/EquipmentStep';
import { ConfirmStep } from './deploy/ConfirmStep';

// ── Constants ───────────────────────────────────────────────────────────────

const COMPUTE_COSTS: Record<string, number> = { pickaxe_basic: 1, pickaxe_iron: 1, pickaxe_diamond: 2, beacon: 1 };
const BASE_COMPUTE = 1;
const BASE_CAPACITY = 50;
const RAM_CAPACITY_MULT = 50;

// ── Deploy Dialog ───────────────────────────────────────────────────────────

export function DeployDialog({ nodeId, nodeName, onClose }: {
  nodeId: string; nodeName: string; onClose: () => void;
}) {
  const { workers, playerInventory, nodes: gameNodes, edges: gameEdges, setEdgeSelectMode, setNodeSelectMode, setState, workerClasses: storeWorkerClasses } = useGameStore();
  const t = useT();
  const workerClasses = storeWorkerClasses as WorkerClassEntry[];

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [unitCount, setUnitCount] = useState(1);
  const [equippedPerUnit, setEquippedPerUnit] = useState<Record<string, string>[]>([{}]);
  const [cpuPerUnit, setCpuPerUnit] = useState<number[]>([0]);
  const [ramPerUnit, setRamPerUnit] = useState<number[]>([0]);
  const [currentUnitIdx, setCurrentUnitIdx] = useState(0);
  const [routes, setRoutes] = useState<Record<string, { id: string; source: string; target: string }[]>>({});
  const [routeNodes, setRouteNodes] = useState<Record<string, string[]>>({});
  const [step, setStep] = useState(0);
  const [selectingRoute, setSelectingRoute] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedClassEntry = workerClasses.find(c => c.class_id === selectedClass);

  const classItemSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'item').map(([name, f]) => ({ name, itemType: f.item_type || '', description: f.description }))
    : [];
  const routeSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields).filter(([, f]) => f.type === 'route' || f.type === 'edge').map(([name, f]) => ({ name, description: f.description, fieldType: f.type as 'route' | 'edge' }))
    : [];

  const hasRoutes = routeSlots.length > 0;
  const steps: { label: string; key: string }[] = [{ label: 'Class', key: 'class' }];
  if (hasRoutes) steps.push({ label: 'Routes', key: 'routes' });
  steps.push({ label: 'Equipment', key: 'equipment' });
  steps.push({ label: 'Deploy', key: 'deploy' });
  const currentStepKey = steps[step]?.key || 'class';
  const isLastStep = step === steps.length - 1;

  const equipped = equippedPerUnit[currentUnitIdx] || {};

  // Available inventory (subtract already-equipped counts)
  const equippedCounts: Record<string, number> = {};
  for (const unitEquip of equippedPerUnit) {
    for (const t of Object.values(unitEquip)) equippedCounts[t] = (equippedCounts[t] || 0) + 1;
  }
  const totalCpuUsed = cpuPerUnit.reduce((s, n) => s + n, 0);
  const totalRamUsed = ramPerUnit.reduce((s, n) => s + n, 0);
  equippedCounts['cpu_basic'] = (equippedCounts['cpu_basic'] || 0) + totalCpuUsed;
  equippedCounts['ram_basic'] = (equippedCounts['ram_basic'] || 0) + totalRamUsed;
  const availableInventory = playerInventory.map(i => ({ ...i, count: i.count - (equippedCounts[i.itemType] || 0) })).filter(i => i.count > 0);

  const currentCpu = cpuPerUnit[currentUnitIdx] || 0;
  const currentRam = ramPerUnit[currentUnitIdx] || 0;
  const totalCompute = BASE_COMPUTE + currentCpu;
  const totalCapacity = BASE_CAPACITY + currentRam * RAM_CAPACITY_MULT;
  const usedCompute = Object.values(equipped).reduce((s, itemType) => s + (COMPUTE_COSTS[itemType] || 0), 0);

  const cpuOwned = playerInventory.find(i => i.itemType === 'cpu_basic')?.count || 0;
  const ramOwned = playerInventory.find(i => i.itemType === 'ram_basic')?.count || 0;
  const cpuAvailForUnit = cpuOwned - cpuPerUnit.reduce((s, n, i) => i === currentUnitIdx ? s : s + n, 0);
  const ramAvailForUnit = ramOwned - ramPerUnit.reduce((s, n, i) => i === currentUnitIdx ? s : s + n, 0);

  const allSlotsFilled = equippedPerUnit.every(ue => classItemSlots.every(s => !!ue[s.name]));
  const allRoutesFilled = routeSlots.every(s => routes[s.name]?.length > 0);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedClass && workerClasses.length > 0) setSelectedClass(workerClasses[0].class_id);
  }, [workerClasses, selectedClass]);

  useEffect(() => {
    setEquippedPerUnit([{}]); setCurrentUnitIdx(0); setUnitCount(1);
    setRoutes({}); setRouteNodes({}); setStep(0); setDeployed(false); setMessage('');
  }, [selectedClass]);

  useEffect(() => () => { setEdgeSelectMode(null); setNodeSelectMode(null); setState({ routePath: [] }); }, []);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const getNodeLabel = (id: string) => gameNodes.find(n => n.id === id)?.data?.label || id;

  const startRouteSelect = useCallback((fieldName: string, fieldType: 'edge' | 'route') => {
    setSelectingRoute(fieldName);
    if (fieldType === 'edge') {
      setEdgeSelectMode({
        fieldName,
        onSelect: (edge) => {
          setRoutes(prev => ({ ...prev, [fieldName]: [edge] }));
          setSelectingRoute(null);
          setEdgeSelectMode(null);
        },
      });
    } else {
      setRouteNodes(prev => ({ ...prev, [fieldName]: [] }));
      setRoutes(prev => ({ ...prev, [fieldName]: [] }));
      setNodeSelectMode({
        fieldName,
        onSelect: (nodeId) => {
          setRouteNodes(prev => {
            const existing = prev[fieldName] || [];
            if (existing[existing.length - 1] === nodeId) return prev;
            const updated = [...existing, nodeId];
            const edges: { id: string; source: string; target: string }[] = [];
            for (let i = 0; i < updated.length - 1; i++) {
              const e = gameEdges.find(e =>
                (e.source === updated[i] && e.target === updated[i + 1]) ||
                (e.source === updated[i + 1] && e.target === updated[i])
              );
              if (e) edges.push({ id: e.id, source: updated[i], target: updated[i + 1] });
            }
            setRoutes(r => ({ ...r, [fieldName]: edges }));
            setState({ routePath: updated });
            return { ...prev, [fieldName]: updated };
          });
        },
      });
    }
  }, [setEdgeSelectMode, setNodeSelectMode, gameEdges]);

  const finishRouteSelect = useCallback(() => {
    setSelectingRoute(null); setEdgeSelectMode(null); setNodeSelectMode(null); setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode]);

  const cancelRouteSelect = useCallback(() => {
    if (selectingRoute) {
      setRoutes(prev => { const n = { ...prev }; delete n[selectingRoute]; return n; });
      setRouteNodes(prev => { const n = { ...prev }; delete n[selectingRoute]; return n; });
    }
    setSelectingRoute(null); setEdgeSelectMode(null); setNodeSelectMode(null); setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode, selectingRoute]);

  const handleDeploy = async () => {
    if (!selectedClass || deploying || deployed) return;
    setDeploying(true);
    setMessage('');

    const routePayload: Record<string, string | string[]> = {};
    for (const [field, edges] of Object.entries(routes)) {
      if (!edges?.length) continue;
      const slot = routeSlots.find(s => s.name === field);
      if (slot?.fieldType === 'edge') routePayload[field] = edges[0].id;
      else routePayload[field] = edges.map(e => e.id);
    }

    try {
      const ids: string[] = [];
      for (let i = 0; i < unitCount; i++) {
        const body: any = { nodeId, classId: selectedClass };
        const unitEquip = { ...(equippedPerUnit[i] || {}) };
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
      onClose();
    } catch (err: any) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
      setDeploying(false);
    }
  };

  const canGoNext = () => {
    if (currentStepKey === 'class') {
      if (!selectedClass || unitCount < 1) return false;
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

  const handleClose = () => { setEdgeSelectMode(null); onClose(); };

  // ── Route selection overlay ────────────────────────────────────────────────
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
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', animation: 'pulse-glow 1.5s infinite' }} />
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

  // ── Main dialog ────────────────────────────────────────────────────────────
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

        {steps.length > 2 && <StepBar steps={steps} currentStep={step} />}

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center' }}>{t('ui.loading')}</div>
        ) : workerClasses.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '24px 0', textAlign: 'center', lineHeight: 1.6 }}>
            {t('ui.no_worker_classes')}<br />{t('ui.run_code_server')}
          </div>
        ) : (
          <>
            {currentStepKey === 'class' && (
              <ClassStep
                workerClasses={workerClasses} selectedClass={selectedClass} setSelectedClass={setSelectedClass}
                selectedClassEntry={selectedClassEntry} classItemSlots={classItemSlots} routeSlots={routeSlots}
                playerInventory={playerInventory} unitCount={unitCount} setUnitCount={setUnitCount}
                setEquippedPerUnit={setEquippedPerUnit} setCpuPerUnit={setCpuPerUnit}
                setRamPerUnit={setRamPerUnit} setCurrentUnitIdx={setCurrentUnitIdx}
              />
            )}

            {currentStepKey === 'routes' && (
              <RoutesStep
                routeSlots={routeSlots} routes={routes} routeNodes={routeNodes}
                selectingRoute={selectingRoute} startRouteSelect={startRouteSelect}
                finishRouteSelect={finishRouteSelect} getNodeLabel={getNodeLabel}
              />
            )}

            {currentStepKey === 'equipment' && (
              <EquipmentStep
                unitCount={unitCount} currentUnitIdx={currentUnitIdx} setCurrentUnitIdx={setCurrentUnitIdx}
                equippedPerUnit={equippedPerUnit} setEquippedPerUnit={setEquippedPerUnit}
                cpuPerUnit={cpuPerUnit} setCpuPerUnit={setCpuPerUnit}
                ramPerUnit={ramPerUnit} setRamPerUnit={setRamPerUnit}
                classItemSlots={classItemSlots} playerInventory={playerInventory}
                availableInventory={availableInventory} totalCompute={totalCompute}
                totalCapacity={totalCapacity} usedCompute={usedCompute}
                currentCpu={currentCpu} currentRam={currentRam}
                cpuAvailForUnit={cpuAvailForUnit} ramAvailForUnit={ramAvailForUnit}
                allSlotsFilled={allSlotsFilled}
              />
            )}

            {currentStepKey === 'deploy' && (
              <ConfirmStep
                selectedClassEntry={selectedClassEntry} unitCount={unitCount}
                nodeName={nodeName} routes={routes} equipped={equipped}
                getNodeLabel={getNodeLabel}
              />
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
