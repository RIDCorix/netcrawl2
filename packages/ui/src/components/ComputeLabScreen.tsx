import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import { useGameStore, type GameNode } from '../store/gameStore';
import { useT } from '../hooks/useT';
import { GraphCanvas } from './graph/GameGraph';
import { getEdgeHandles } from './graph/graphUtils';

const ADD_NODE_ID = 'e_op_add';

const LAB_NODES = [
  {
    id: 'lab_start',
    type: 'hub',
    position: { x: 0, y: 150 },
    labelKey: 'compute_lab.node.start',
    typeKey: 'compute_lab.type.start',
    roleKey: 'compute_lab.role.start',
  },
  {
    id: 'lab_operator',
    type: 'compute',
    position: { x: 260, y: 150 },
    labelKey: 'compute_lab.node.operator',
    typeKey: 'compute_lab.type.operator',
    roleKey: 'compute_lab.role.operator',
    difficulty: 'easy',
  },
  {
    id: 'lab_input_a',
    type: 'resource',
    position: { x: 520, y: 45 },
    labelKey: 'compute_lab.node.input_a',
    typeKey: 'compute_lab.type.input',
    roleKey: 'compute_lab.role.input',
  },
  {
    id: 'lab_input_b',
    type: 'resource',
    position: { x: 520, y: 255 },
    labelKey: 'compute_lab.node.input_b',
    typeKey: 'compute_lab.type.input',
    roleKey: 'compute_lab.role.input',
  },
  {
    id: 'lab_result',
    type: 'cache',
    position: { x: 780, y: 150 },
    labelKey: 'compute_lab.node.result',
    typeKey: 'compute_lab.type.result',
    roleKey: 'compute_lab.role.result',
  },
] as const;

const LAB_EDGES = [
  ['lab_start', 'lab_operator'],
  ['lab_operator', 'lab_input_a'],
  ['lab_operator', 'lab_input_b'],
  ['lab_input_a', 'lab_result'],
  ['lab_input_b', 'lab_result'],
] as const;

/** An overlay-only, synthetic unlocked graph. It never changes game graph data. */
export function ComputeLabScreen() {
  const { computeLabOpen, computeLabSourceNodeId, nodes, selectNode, closeComputeLab } = useGameStore();
  const edgeStyle = useGameStore(s => s.settings.edgeStyle);
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const source = nodes.find(node => node.id === computeLabSourceNodeId);
  const available = source?.id === ADD_NODE_ID && source.type === 'compute' && source.data.unlocked === true;

  useEffect(() => {
    if (!computeLabOpen) return;
    setSelectedNodeId(null);
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComputeLab();
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') || [],
        );
        const current = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? current <= 0
            ? focusable.length - 1
            : current - 1
          : current === focusable.length - 1
            ? 0
            : current + 1;
        if (focusable.length) {
          event.preventDefault();
          focusable[next].focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [computeLabOpen, closeComputeLab]);

  const labNodes = useMemo<Node[]>(
    () =>
      LAB_NODES.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        selected: node.id === selectedNodeId,
        data: {
          label: t(node.labelKey),
          unlocked: true,
          selected: node.id === selectedNodeId,
          showWorkerDots: false,
          edgeStyle,
          difficulty: 'difficulty' in node ? node.difficulty : undefined,
          resource: node.type === 'resource' ? 'data' : undefined,
        },
      })),
    [edgeStyle, selectedNodeId, t],
  );
  const labEdges = useMemo<Edge[]>(() => {
    const graphNodes: GameNode[] = LAB_NODES.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { label: t(node.labelKey), unlocked: true },
    }));
    return LAB_EDGES.map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      type: 'worker',
      style: { stroke: 'var(--border-bright)', strokeWidth: 1.5 },
      ...getEdgeHandles(source, target, graphNodes, edgeStyle),
    }));
  }, [edgeStyle, t]);
  const onNodeClick = useCallback((_: unknown, node: Node) => setSelectedNodeId(node.id), []);

  if (!computeLabOpen) return null;
  const selectedNode = LAB_NODES.find(node => node.id === selectedNodeId);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('compute_lab.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(3, 8, 15, .96)',
        padding: 'max(18px, 4vw)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent)' }}>
            {t('compute_lab.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('compute_lab.subtitle')}</div>
        </div>
        <button ref={closeRef} onClick={closeComputeLab} style={{ minWidth: 44, minHeight: 44 }}>
          {t('compute_lab.exit')}
        </button>
      </header>
      {!available ? (
        <main role="status" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
          {t('compute_lab.locked')}
        </main>
      ) : (
        <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <GraphCanvas nodes={labNodes} edges={labEdges} onNodeClick={onNodeClick} />
          {selectedNode && (
            <aside
              aria-live="polite"
              style={{
                position: 'absolute',
                right: 16,
                top: 16,
                width: 'min(300px, calc(100% - 32px))',
                padding: 16,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-bright)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 8px 28px rgba(0, 0, 0, .45)',
              }}
            >
              <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                {t(selectedNode.labelKey)}
              </div>
              <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
                {t(selectedNode.typeKey)} · {t(selectedNode.roleKey)}
              </div>
              {selectedNode.id === 'lab_start' && (
                <button
                  onClick={() => {
                    selectNode(ADD_NODE_ID);
                    closeComputeLab();
                  }}
                  style={{ minWidth: 44, minHeight: 44, marginTop: 14 }}
                >
                  {t('compute_lab.start_deploy')}
                </button>
              )}
            </aside>
          )}
        </main>
      )}
      <footer style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {available ? t('compute_lab.return_hint') : t('compute_lab.locked_hint')}
      </footer>
    </div>
  );
}
