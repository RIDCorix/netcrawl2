import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, ChevronRight } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useT } from '../hooks/useT';
import { StepBar } from './deploy/StepBar';
import { SLOT_ACCEPTS } from './deploy/EquipSlot';
import { ClassStep, WorkerClassEntry } from './deploy/ClassStep';
import { RoutesStep } from './deploy/RoutesStep';
import { EquipmentStep } from './deploy/EquipmentStep';
import { ConfirmStep } from './deploy/ConfirmStep';
import { getEquipmentDefinition } from '@netcrawl/equipment-catalog';

// ── Constants ───────────────────────────────────────────────────────────────

const getComputeCost = (itemType: string) => getEquipmentDefinition(itemType)?.computeCost ?? 0;
const BASE_COMPUTE = 1;
const BASE_CAPACITY = 50;
const RAM_CAPACITY_MULT = 50;
const DIALOG_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

const TUTORIAL_STEP_BY_STAGE: Partial<Record<TutorialDeployStage, number>> = {
  hello_deploy_open: 0,
  hello_deploy_confirm: 1,
  hello_deploy_execute: 1,
  miner_deploy_open: 0,
  miner_edge_select: 1,
  miner_pickaxe_equip: 2,
  miner_deploy_confirm: 3,
  miner_deploy_execute: 3,
};

export type TutorialDeployStage =
  | 'hello_preview'
  | 'hello_deploy_open'
  | 'hello_deploy_confirm'
  | 'hello_deploy_execute'
  | 'hello_log'
  | 'miner_preview'
  | 'miner_deploy_open'
  | 'miner_edge_select'
  | 'miner_pickaxe_equip'
  | 'miner_deploy_confirm'
  | 'miner_deploy_execute'
  | 'handoff';

export type TutorialDeployDescriptor = {
  active: true;
  phase: 'hello' | 'miner';
  stage: TutorialDeployStage;
  session?: { world?: { deployTutorial?: { selectedEdgeId?: string | null; selectedPickaxeType?: string | null } } };
};

// ── Deploy Dialog ───────────────────────────────────────────────────────────

export function DeployDialog({
  nodeId,
  nodeName,
  onClose,
  tutorial,
  eligibility,
}: {
  nodeId: string;
  nodeName: string;
  onClose: () => void;
  tutorial?: TutorialDeployDescriptor;
  eligibility?: string;
}) {
  const {
    workers,
    playerInventory,
    nodes: gameNodes,
    edges: gameEdges,
    setEdgeSelectMode,
    setNodeSelectMode,
    setState,
    workerClasses: storeWorkerClasses,
  } = useGameStore();
  const t = useT();
  const tutorialMode = !!tutorial;
  const expectedTutorialClass = tutorial?.phase === 'hello' ? 'helloworker' : 'miner';
  const workerClasses = storeWorkerClasses as WorkerClassEntry[];
  const eligibleWorkerClasses = eligibility ? workerClasses.filter(c => c.capabilities?.includes(eligibility)) : workerClasses;
  const tutorialWorkerClasses = tutorialMode
    ? workerClasses.filter(c => c.class_id === expectedTutorialClass)
    : eligibleWorkerClasses;
  const dialogRef = useRef<HTMLDivElement>(null);
  const routePickerRef = useRef<HTMLDivElement>(null);
  const selectingRouteRef = useRef<string | null>(null);
  const routeReturnFocusRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
  const [advancing, setAdvancing] = useState(false);
  const [selectingRoute, setSelectingRoute] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedClassEntry = tutorialWorkerClasses.find(c => c.class_id === selectedClass);

  const classItemSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields)
        .filter(([, f]) => f.type === 'item')
        .map(([name, f]) => ({ name, itemType: f.item_type || '', description: f.description }))
    : [];
  const routeSlots = selectedClassEntry
    ? Object.entries(selectedClassEntry.fields)
        .filter(([, f]) => f.type === 'route' || f.type === 'edge')
        .map(([name, f]) => ({ name, description: f.description, fieldType: f.type as 'route' | 'edge' }))
    : [];

  const hasRoutes = routeSlots.length > 0;
  const steps: { label: string; key: string }[] = [{ label: 'Class', key: 'class' }];
  if (hasRoutes) steps.push({ label: 'Routes', key: 'routes' });
  if (classItemSlots.length > 0) steps.push({ label: 'Equipment', key: 'equipment' });
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
  const availableInventory = playerInventory
    .map(i => ({ ...i, count: i.count - (equippedCounts[i.itemType] || 0) }))
    .filter(i => i.count > 0);

  const currentCpu = cpuPerUnit[currentUnitIdx] || 0;
  const currentRam = ramPerUnit[currentUnitIdx] || 0;
  const totalCompute = BASE_COMPUTE + currentCpu;
  const totalCapacity = BASE_CAPACITY + currentRam * RAM_CAPACITY_MULT;
  const usedCompute = Object.values(equipped).reduce((s, itemType) => s + getComputeCost(itemType), 0);

  const cpuOwned = playerInventory.find(i => i.itemType === 'cpu_basic')?.count || 0;
  const ramOwned = playerInventory.find(i => i.itemType === 'ram_basic')?.count || 0;
  const cpuAvailForUnit = cpuOwned - cpuPerUnit.reduce((s, n, i) => (i === currentUnitIdx ? s : s + n), 0);
  const ramAvailForUnit = ramOwned - ramPerUnit.reduce((s, n, i) => (i === currentUnitIdx ? s : s + n), 0);

  const allSlotsFilled = equippedPerUnit.every(ue => classItemSlots.every(s => !!ue[s.name]));
  const allRoutesFilled = routeSlots.every(s => routes[s.name]?.length > 0);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedClass && tutorialWorkerClasses.length > 0) setSelectedClass(tutorialWorkerClasses[0].class_id);
  }, [selectedClass, tutorialWorkerClasses]);

  useEffect(() => {
    if (tutorialMode && workerClasses.some(c => c.class_id === expectedTutorialClass)) {
      setSelectedClass(expectedTutorialClass);
    }
  }, [expectedTutorialClass, tutorialMode, workerClasses]);

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

  useEffect(() => {
    if (!tutorialMode || !tutorial) return;
    const restoredStep = TUTORIAL_STEP_BY_STAGE[tutorial.stage];
    if (restoredStep !== undefined) setStep(restoredStep);
  }, [selectedClass, tutorial, tutorialMode]);

  useEffect(() => {
    const deployState = tutorial?.session?.world?.deployTutorial;
    if (!tutorialMode || !deployState) return;
    const edge = gameEdges.find(candidate => candidate.id === deployState.selectedEdgeId);
    if (edge && routeSlots[0]) {
      setRoutes(current =>
        current[routeSlots[0].name]
          ? current
          : {
              ...current,
              [routeSlots[0].name]: [{ id: edge.id, source: edge.source, target: edge.target }],
            },
      );
    }
    if (deployState.selectedPickaxeType && classItemSlots[0]) {
      setEquippedPerUnit(current =>
        current[0]?.[classItemSlots[0].name]
          ? current
          : [{ ...(current[0] || {}), [classItemSlots[0].name]: deployState.selectedPickaxeType! }],
      );
    }
  }, [classItemSlots, gameEdges, routeSlots, tutorial, tutorialMode]);

  useEffect(
    () => () => {
      setEdgeSelectMode(null);
      setNodeSelectMode(null);
      setState({ routePath: [] });
    },
    [],
  );

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const initialFocus = dialogRef.current?.querySelector<HTMLElement>('[data-deploy-initial-focus]');
      (initialFocus || dialogRef.current)?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, []);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const getNodeLabel = (id: string) => gameNodes.find(n => n.id === id)?.data?.label || id;

  const publishTutorialSession = useCallback((session: any) => {
    if (session?.stage) {
      window.dispatchEvent(new CustomEvent('chapter-zero-deploy-session', { detail: session }));
    }
  }, []);

  const advanceTutorial = useCallback(
    async (to: string) => {
      const response = await axios.post('/api/tutorial/chapter-zero/stage', { action: 'advance', to });
      publishTutorialSession(response.data);
      return response.data;
    },
    [publishTutorialSession],
  );

  const completeEdgeSelect = useCallback(
    async (fieldName: string, edge: { id: string; source: string; target: string }) => {
      setRoutes(prev => ({ ...prev, [fieldName]: [edge] }));
      selectingRouteRef.current = null;
      setSelectingRoute(null);
      setEdgeSelectMode(null);
      if (tutorialMode) {
        try {
          const response = await axios.post('/api/tutorial/chapter-zero/stage', {
            action: 'set-deploy-edge',
            edgeId: edge.id,
          });
          publishTutorialSession(response.data);
        } catch {
          setMessage(
            tutorialMode ? t('tutorial.chapter_zero.deploy.error_generic') : 'Error: unable to save the selected edge',
          );
        }
      }
    },
    [publishTutorialSession, setEdgeSelectMode, t, tutorialMode],
  );

  const selectRouteNode = useCallback(
    (fieldName: string, nodeId: string) => {
      setRouteNodes(prev => {
        const existing = prev[fieldName] || [];
        if (existing[existing.length - 1] === nodeId) return prev;
        const updated = [...existing, nodeId];
        const edges: { id: string; source: string; target: string }[] = [];
        for (let i = 0; i < updated.length - 1; i++) {
          const edge = gameEdges.find(
            candidate =>
              (candidate.source === updated[i] && candidate.target === updated[i + 1]) ||
              (candidate.source === updated[i + 1] && candidate.target === updated[i]),
          );
          if (edge) edges.push({ id: edge.id, source: updated[i], target: updated[i + 1] });
        }
        setRoutes(current => ({ ...current, [fieldName]: edges }));
        setState({ routePath: updated });
        return { ...prev, [fieldName]: updated };
      });
    },
    [gameEdges],
  );

  const startRouteSelect = useCallback(
    (fieldName: string, fieldType: 'edge' | 'route') => {
      selectingRouteRef.current = fieldName;
      routeReturnFocusRef.current = fieldName;
      setSelectingRoute(fieldName);
      if (fieldType === 'edge') {
        setEdgeSelectMode({
          fieldName,
          onSelect: edge => completeEdgeSelect(fieldName, edge),
        });
      } else {
        setRouteNodes(prev => ({ ...prev, [fieldName]: [] }));
        setRoutes(prev => ({ ...prev, [fieldName]: [] }));
        setNodeSelectMode({
          fieldName,
          onSelect: nodeId => selectRouteNode(fieldName, nodeId),
        });
      }
    },
    [completeEdgeSelect, selectRouteNode, setEdgeSelectMode, setNodeSelectMode],
  );

  const finishRouteSelect = useCallback(() => {
    selectingRouteRef.current = null;
    setSelectingRoute(null);
    setEdgeSelectMode(null);
    setNodeSelectMode(null);
    setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode]);

  const cancelRouteSelect = useCallback(() => {
    const fieldName = selectingRouteRef.current;
    if (fieldName) {
      setRoutes(prev => {
        const n = { ...prev };
        delete n[fieldName];
        return n;
      });
      setRouteNodes(prev => {
        const n = { ...prev };
        delete n[fieldName];
        return n;
      });
    }
    selectingRouteRef.current = null;
    setSelectingRoute(null);
    setEdgeSelectMode(null);
    setNodeSelectMode(null);
    setState({ routePath: [] });
  }, [setEdgeSelectMode, setNodeSelectMode]);

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
      if (
        tutorialMode &&
        tutorial?.stage !== (tutorial.phase === 'hello' ? 'hello_deploy_execute' : 'miner_deploy_execute')
      ) {
        await advanceTutorial(tutorial.phase === 'hello' ? 'hello_deploy_execute' : 'miner_deploy_execute');
      }
      const ids: string[] = [];
      for (let i = 0; i < unitCount; i++) {
        const body: any = { nodeId, classId: selectedClass };
        const unitEquip = { ...(equippedPerUnit[i] || {}) };
        const cpuN = cpuPerUnit[i] || 0;
        const ramN = ramPerUnit[i] || 0;
        if (cpuN > 0) {
          unitEquip.cpuCount = String(cpuN);
          unitEquip.cpuType = 'cpu_basic';
        }
        if (ramN > 0) {
          unitEquip.ramCount = String(ramN);
          unitEquip.ramType = 'ram_basic';
        }
        if (Object.keys(unitEquip).length > 0) body.equippedItems = unitEquip;
        if (Object.keys(routePayload).length > 0) body.routes = routePayload;
        const res = await axios.post('/api/deploy', body);
        ids.push(res.data.workerId);
      }
      setDeployed(true);
      setMessage(`Deployed ${ids.length} unit${ids.length > 1 ? 's' : ''}`);
      if (tutorialMode) {
        const response = await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'verify-deploy',
          workerId: ids[0],
        });
        publishTutorialSession(response.data);
      }
      onClose();
    } catch (err: any) {
      const reason = err.response?.data?.error || err.message;
      setMessage(tutorialMode ? t('tutorial.chapter_zero.deploy.error_api', { reason }) : 'Error: ' + reason);
      setDeploying(false);
    }
  };

  const handleNext = async () => {
    if (advancing || !canGoNext()) return;
    setAdvancing(true);
    try {
      if (tutorialMode && currentStepKey === 'class' && tutorial?.phase === 'hello') {
        // HelloWorker has no route or item slots. It goes directly from the
        // class checkpoint to the deploy confirmation checkpoint.
        await advanceTutorial('hello_deploy_confirm');
      } else if (tutorialMode && currentStepKey === 'class' && tutorial?.phase === 'miner') {
        await advanceTutorial('miner_edge_select');
      } else if (tutorialMode && currentStepKey === 'routes') {
        await advanceTutorial('miner_pickaxe_equip');
      } else if (tutorialMode && currentStepKey === 'equipment') {
        const pickaxeType = Object.values(equippedPerUnit[0] || {})[0] || null;
        if (tutorial?.phase === 'miner' && pickaxeType !== 'pickaxe_basic') {
          setMessage(t('tutorial.chapter_zero.deploy.error_missing'));
          return;
        }
        const selection = await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'set-deploy-pickaxe',
          pickaxeType,
        });
        publishTutorialSession(selection.data);
        await advanceTutorial('miner_deploy_confirm');
      }
      setStep(s => s + 1);
    } catch (err: any) {
      const reason = err?.response?.data?.error || err.message;
      setMessage(tutorialMode ? t('tutorial.chapter_zero.deploy.error_api', { reason }) : 'Error: ' + reason);
    } finally {
      setAdvancing(false);
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
        const unitCost = Object.values(unitEquip).reduce((s, t) => s + getComputeCost(t), 0);
        if (unitCost > unitCompute) return false;
      }
      return true;
    }
    return true;
  };

  const handleClose = useCallback(() => {
    if (tutorialMode) return;
    setEdgeSelectMode(null);
    onClose();
  }, [onClose, setEdgeSelectMode, tutorialMode]);

  const handleDialogKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (tutorialMode) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (selectingRouteRef.current && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelRouteSelect();
        return;
      }

      if (event.key === 'Escape') {
        const visibleListbox = Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"]')).some(
          element => element.getClientRects().length > 0,
        );
        if (visibleListbox) return;

        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusContainer = selectingRouteRef.current ? routePickerRef.current : dialogRef.current;
      const focusable = Array.from(
        focusContainer?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR) || [],
      ).filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');

      if (focusable.length === 0) {
        event.preventDefault();
        focusContainer?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!focusContainer?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [cancelRouteSelect, handleClose, tutorialMode],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDialogKeyDown, true);
  }, [handleDialogKeyDown]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const stepContent = dialog.querySelector<HTMLElement>('[data-deploy-step-content]');
      const firstStepControl = Array.from(
        stepContent?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR) || [],
      ).find(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      (firstStepControl || dialog).focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [currentStepKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selectingRoute) {
        const firstControl = routePickerRef.current?.querySelector<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR);
        (firstControl || routePickerRef.current)?.focus();
        return;
      }

      const fieldName = routeReturnFocusRef.current;
      if (!fieldName) return;
      const trigger = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('[data-route-select-field]') || [],
      ).find(element => element.dataset.routeSelectField === fieldName);
      (trigger || dialogRef.current)?.focus();
      routeReturnFocusRef.current = null;
    });

    return () => cancelAnimationFrame(frame);
  }, [selectingRoute]);

  // ── Route selection overlay ────────────────────────────────────────────────
  if (selectingRoute) {
    const routeSlot = routeSlots.find(s => s.name === selectingRoute);
    const isUnlocked = (id: string) => {
      const node = gameNodes.find(n => n.id === id);
      return node?.id === 'hub' || !!node?.data?.unlocked;
    };
    const compatibleEdges = gameEdges.filter(edge => isUnlocked(edge.source) && isUnlocked(edge.target));
    const compatibleNodes = gameNodes.filter(node => isUnlocked(node.id));
    return (
      <motion.div
        ref={routePickerRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          routeSlot?.fieldType === 'route' ? `Build route: ${routeSlot?.name}` : `Select an edge: ${routeSlot?.name}`
        }
        tabIndex={-1}
        data-tutorial-dialog={tutorialMode ? 'true' : undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          boxSizing: 'border-box',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
            animation: 'pulse-glow 1.5s infinite',
          }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {routeSlot?.fieldType === 'route'
              ? `Click nodes to build path: ${routeSlot?.name}`
              : `Select an edge: ${routeSlot?.name}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {routeSlot?.fieldType === 'route'
              ? `Click nodes in order to define the path (${(routeNodes[selectingRoute!] || []).length} nodes selected)`
              : routeSlot?.description || 'Click on a connection between two nodes'}
          </div>
        </div>
        <div
          aria-label={routeSlot?.fieldType === 'route' ? 'Available nodes' : 'Available edges'}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {routeSlot?.fieldType === 'edge'
            ? compatibleEdges.map((edge, index) => (
                <button
                  key={edge.id}
                  autoFocus={index === 0}
                  onClick={() => completeEdgeSelect(selectingRoute, edge)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-bright)',
                    background: 'var(--bg-glass)',
                    color: 'var(--text-primary)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {getNodeLabel(edge.source)} ↔ {getNodeLabel(edge.target)}
                </button>
              ))
            : compatibleNodes.map((node, index) => (
                <button
                  key={node.id}
                  autoFocus={index === 0}
                  onClick={() => selectRouteNode(selectingRoute, node.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-bright)',
                    background: 'var(--bg-glass)',
                    color: 'var(--text-primary)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {getNodeLabel(node.id)}
                </button>
              ))}
        </div>
        {routeSlot?.fieldType === 'route' && (routeNodes[selectingRoute!] || []).length >= 2 && (
          <button
            onClick={finishRouteSelect}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              border: 'none',
              color: '#000',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        )}
        {!tutorialMode && (
          <button
            autoFocus={(routeSlot?.fieldType === 'edge' ? compatibleEdges : compatibleNodes).length === 0}
            onClick={cancelRouteSelect}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
        )}
      </motion.div>
    );
  }

  // ── Main dialog ────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      data-tutorial-dialog={tutorialMode ? 'true' : undefined}
      onClick={handleClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('ui.deploy_to')} ${nodeName}`}
        tabIndex={-1}
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
          width: 520,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 32px)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.12em',
              }}
            >
              {t('ui.deploy_to')}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                marginTop: 2,
              }}
            >
              {nodeName}
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={tutorialMode}
            style={{
              color: 'var(--text-muted)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {steps.length > 2 && (
          <div style={{ flexShrink: 0 }}>
            <StepBar steps={steps} currentStep={step} />
          </div>
        )}

        {loading ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              padding: '24px 0',
              textAlign: 'center',
            }}
          >
            {t('ui.loading')}
          </div>
        ) : tutorialMode && tutorialWorkerClasses.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              padding: '24px 0',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            {t('ui.no_worker_classes')}
            <br />
            {t('ui.run_code_server')}
          </div>
        ) : (
          <>
            <div
              data-deploy-step-content
              style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingRight: 4 }}
            >
              {currentStepKey === 'class' && (
                <ClassStep
                  workerClasses={tutorialWorkerClasses}
                  selectedClass={selectedClass}
                  setSelectedClass={setSelectedClass}
                  selectedClassEntry={selectedClassEntry}
                  classItemSlots={classItemSlots}
                  routeSlots={routeSlots}
                  playerInventory={playerInventory}
                  unitCount={unitCount}
                  setUnitCount={tutorialMode ? () => {} : setUnitCount}
                  setEquippedPerUnit={setEquippedPerUnit}
                  setCpuPerUnit={setCpuPerUnit}
                  setRamPerUnit={setRamPerUnit}
                  setCurrentUnitIdx={setCurrentUnitIdx}
                />
              )}

              {currentStepKey === 'routes' && (
                <RoutesStep
                  routeSlots={routeSlots}
                  routes={routes}
                  routeNodes={routeNodes}
                  selectingRoute={selectingRoute}
                  startRouteSelect={startRouteSelect}
                  finishRouteSelect={finishRouteSelect}
                  getNodeLabel={getNodeLabel}
                />
              )}

              {currentStepKey === 'equipment' && (
                <EquipmentStep
                  unitCount={unitCount}
                  currentUnitIdx={currentUnitIdx}
                  setCurrentUnitIdx={setCurrentUnitIdx}
                  equippedPerUnit={equippedPerUnit}
                  setEquippedPerUnit={setEquippedPerUnit}
                  cpuPerUnit={cpuPerUnit}
                  setCpuPerUnit={setCpuPerUnit}
                  ramPerUnit={ramPerUnit}
                  setRamPerUnit={setRamPerUnit}
                  classItemSlots={classItemSlots}
                  playerInventory={playerInventory}
                  availableInventory={availableInventory}
                  totalCompute={totalCompute}
                  totalCapacity={totalCapacity}
                  usedCompute={usedCompute}
                  currentCpu={currentCpu}
                  currentRam={currentRam}
                  cpuAvailForUnit={cpuAvailForUnit}
                  ramAvailForUnit={ramAvailForUnit}
                  allSlotsFilled={allSlotsFilled}
                />
              )}

              {currentStepKey === 'deploy' && (
                <ConfirmStep
                  selectedClassEntry={selectedClassEntry}
                  unitCount={unitCount}
                  nodeName={nodeName}
                  routes={routes}
                  equipped={equipped}
                  getNodeLabel={getNodeLabel}
                />
              )}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              {step > 0 && !tutorialMode && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {t('ui.back')}
                </button>
              )}
              {step === 0 && !tutorialMode && (
                <button
                  onClick={handleClose}
                  style={{
                    flex: 1,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
              )}
              {isLastStep ? (
                <button
                  onClick={handleDeploy}
                  disabled={deploying || deployed}
                  style={{
                    flex: 2,
                    background: deploying || deployed ? 'var(--bg-elevated)' : 'var(--accent)',
                    color: deploying || deployed ? 'var(--text-muted)' : '#000',
                    border: deploying || deployed ? '1px solid var(--border)' : 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    cursor: deploying || deployed ? 'not-allowed' : 'pointer',
                    opacity: deploying || deployed ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Upload size={14} />{' '}
                  {deploying
                    ? t('ui.deploying', { n: unitCount })
                    : t(unitCount > 1 ? 'ui.deploy_n_plural' : 'ui.deploy_n', { n: unitCount })}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={advancing || !canGoNext()}
                  data-tutorial-allowed={tutorialMode ? true : undefined}
                  aria-describedby={
                    currentStepKey === 'equipment' && !canGoNext() ? 'deploy-equipment-requirement' : undefined
                  }
                  style={{
                    flex: 2,
                    background: advancing || !canGoNext() ? 'var(--bg-elevated)' : 'var(--accent)',
                    color: advancing || !canGoNext() ? 'var(--text-muted)' : '#000',
                    border: advancing || !canGoNext() ? '1px solid var(--border)' : 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    cursor: advancing || !canGoNext() ? 'not-allowed' : 'pointer',
                    opacity: advancing || !canGoNext() ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {t('ui.next')} <ChevronRight size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    fontSize: 12,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: message.startsWith('Error') ? 'var(--danger-dim)' : 'rgba(46,213,115,0.1)',
                    border: `1px solid ${message.startsWith('Error') ? 'rgba(255,71,87,0.2)' : 'rgba(46,213,115,0.2)'}`,
                    color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'center',
                  }}
                >
                  {message}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
