import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  useNodesState,
  useEdgesState,
  useViewport,
  BackgroundVariant,
  Handle,
  Position,
  EdgeProps,
  BaseEdge,
  getSmoothStepPath,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge, Worker } from '../store/gameStore';
import React, { useEffect, useCallback } from 'react';
import { Zap, Mountain, Database, Shield, Lock, AlertTriangle, Radio, Pickaxe, Package, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';

// ── Custom Node Components ──────────────────────────────────────────────────

function NodeWrapper({ children, selected, glowColor, style = {}, workers: nodeWorkers }: {
  children: React.ReactNode;
  selected?: boolean;
  glowColor?: string;
  style?: React.CSSProperties;
  workers?: any[];
}) {
  const borderColor = selected ? 'var(--accent)' : glowColor || 'var(--border-bright)';
  const { selectWorker, selectedWorkerId, settings: wrapperSettings } = useGameStore();
  const { zoom } = useViewport();
  const showDetails = zoom > 0.6 && wrapperSettings.showWorkerDots;

  return (
    <div style={{
      position: 'relative',
      padding: '6px',
      borderRadius: '10px',
      background: 'var(--bg-glass-heavy)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${borderColor}`,
      boxShadow: selected
        ? `0 0 0 1px var(--accent-dim), 0 0 12px rgba(0, 212, 170, 0.15)`
        : glowColor
          ? `0 0 8px ${glowColor}33`
          : '0 2px 8px rgba(0, 0, 0, 0.4)',
      minWidth: 0,
      textAlign: 'center' as const,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ...style,
    }}>
      {/* Directional handles for smoothstep/bezier */}
      <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="target" position={Position.Right} style={{ opacity: 0 }} />
      {/* Center handle for straight mode — hidden behind node */}
      <Handle id="center" type="source" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <Handle id="center" type="target" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      {children}
      {/* Worker dots above the node (hidden when zoomed out) */}
      {showDetails && nodeWorkers && nodeWorkers.length > 0 && (
        <div style={{
          position: 'absolute',
          top: -14,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
        }}>
          {nodeWorkers.map((w: any) => {
            const c = CLASS_COLORS[w.class_name] || '#a78bfa';
            const isActive = ['running', 'harvesting', 'idle'].includes(w.status);
            const isSelected = w.id === selectedWorkerId;
            const showAction = !w.leaving && (w.status === 'harvesting' || w.holding);
            const isLeaving = w.leaving;

            return (
              <div
                key={w.id}
                title={`${w.class_name} (${w.status})\nid: ${w.id}\n@ ${w.current_node}`}
                onClick={(e) => { if (!isLeaving) { e.stopPropagation(); selectWorker(w.id); } }}
                style={{
                  position: 'relative',
                  width: isSelected ? 12 : 8,
                  height: isSelected ? 12 : 8,
                  borderRadius: '50%',
                  background: c,
                  border: isSelected ? '2px solid #fff' : '1.5px solid rgba(0,0,0,0.5)',
                  boxShadow: isSelected
                    ? `0 0 8px ${c}, 0 0 16px ${c}`
                    : isActive ? `0 0 6px ${c}, 0 0 12px ${c}40` : `0 0 4px ${c}60`,
                  cursor: isLeaving ? 'default' : 'pointer',
                  // Leaving animation: fade out + shrink toward center
                  opacity: isLeaving ? 0 : 1,
                  transform: isLeaving ? 'scale(0.3) translateY(12px)' : 'scale(1) translateY(0)',
                  transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
                  pointerEvents: isLeaving ? 'none' : 'auto',
                }}
              >
                {/* Action indicator */}
                {showAction && (
                  <div style={{
                    position: 'absolute',
                    top: -16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                    animation: 'worker-action-bounce 0.6s ease-in-out infinite',
                    color: c,
                  }}>
                    {w.status === 'harvesting'
                      ? <Pickaxe size={10} />
                      : <Package size={10} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NodeLabel({ label, subtitle, icon: Icon, iconColor, iconBg }: {
  label: string;
  subtitle?: string;
  icon: any;
  iconColor: string;
  iconBg?: string;
}) {
  return (
    <>
      <Icon size={16} color={iconColor} />
      {/* Label outside the node box, positioned to the right */}
      <div style={{
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        marginLeft: 8,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {subtitle}
          </div>
        )}
      </div>
    </>
  );
}

/** Shows a badge for drops sitting on the node */
function DropsIndicator({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      style={{
        position: 'absolute',
        top: -8,
        right: -8,
        background: '#facc15',
        color: '#000',
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        borderRadius: '999px',
        width: '18px',
        height: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      {count}
    </motion.div>
  );
}

/** Shows depletion countdown */
function DepletedOverlay({ depletedUntil }: { depletedUntil?: number }) {
  const remaining = depletedUntil ? Math.max(0, Math.ceil((depletedUntil - Date.now()) / 1000)) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}
    >
      <span style={{ color: 'var(--danger)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {remaining > 0 ? `${remaining}s` : 'depleted'}
      </span>
    </div>
  );
}

function HubNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--accent)" workers={data.workers} style={{
      animation: 'hub-pulse 3s ease-in-out infinite',
      padding: '14px 20px',
      borderRadius: 'var(--radius-lg)',
    }}>
      {/* Hub uses full layout, not icon-only */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Shield size={20} color="var(--accent)" />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{data.label}</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CENTRAL HUB</div>
      </div>
    </NodeWrapper>
  );
}

function ResourceNode({ data, selected }: any) {
  const icons: any = { energy: Zap, ore: Mountain, data: Database };
  const colors: any = { energy: 'var(--energy-color)', ore: 'var(--ore-color)', data: 'var(--data-color)' };
  const Icon = icons[data.resource] || Zap;
  const color = colors[data.resource] || 'var(--text-muted)';
  const dropsCount = Array.isArray(data.drops) ? data.drops.length : 0;
  const isDepleted = !!data.depleted;

  return (
    <NodeWrapper
      selected={selected}
      glowColor={data.unlocked && !isDepleted ? color : undefined}
      workers={data.workers}
      style={{
        opacity: data.unlocked ? (isDepleted ? 0.7 : 1) : 0.5,
        filter: isDepleted ? 'grayscale(60%)' : undefined,
      }}
    >
      {isDepleted && <DepletedOverlay depletedUntil={data.depletedUntil} />}
      <DropsIndicator count={dropsCount} />
      <NodeLabel
        label={data.label}
        icon={Icon}
        iconColor={data.unlocked ? (isDepleted ? 'var(--text-muted)' : color) : 'var(--text-muted)'}
        subtitle={
          isDepleted
            ? 'DEPLETED'
            : data.unlocked
            ? `+${data.rate}/harvest`
            : 'LOCKED'
        }
      />
    </NodeWrapper>
  );
}

function RelayNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? 'var(--accent-secondary)' : undefined} workers={data.workers} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
      <NodeLabel
        label={data.label}
        icon={Radio}
        iconColor={data.unlocked ? 'var(--accent-secondary)' : 'var(--text-muted)'}
        subtitle={data.unlocked ? 'ACTIVE' : 'LOCKED'}
      />
    </NodeWrapper>
  );
}

function InfectedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--danger)" workers={data.workers} style={{
      animation: 'infected-pulse 1.5s ease-in-out infinite',
      borderColor: 'var(--danger)',
    }}>
      <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="INFECTED" />
    </NodeWrapper>
  );
}

function LockedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} workers={data.workers} style={{
      opacity: 0.4,
      border: '1px dashed var(--border-bright)',
    }}>
      <NodeLabel label={data.label} icon={Lock} iconColor="var(--text-muted)" subtitle="UNKNOWN" />
    </NodeWrapper>
  );
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#60a5fa',
  hard: '#f59e0b',
};

function ComputeNode({ data, selected }: any) {
  const color = DIFFICULTY_COLORS[data.difficulty] || '#a78bfa';
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? color : undefined} workers={data.workers} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
      <NodeLabel
        label={data.label}
        icon={Cpu}
        iconColor={data.unlocked ? color : 'var(--text-muted)'}
        subtitle={data.unlocked ? (data.difficulty || 'PUZZLE').toUpperCase() : 'LOCKED'}
      />
      {data.unlocked && data.solveCount > 0 && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          background: color, color: '#000',
          fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
          borderRadius: '999px', width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {data.solveCount}
        </div>
      )}
    </NodeWrapper>
  );
}

const NODE_TYPES: NodeTypes = {
  hub: HubNode,
  resource: ResourceNode,
  relay: RelayNode,
  infected: InfectedNode,
  locked: LockedNode,
  compute: ComputeNode,
};

// ── Traffic dot driven by rAF (no SVG animateMotion) ────────────────────
// A single rAF loop per edge drives all dots via direct DOM setAttribute.

function TrafficDot({ color, reverse, pathData }: { color: string; reverse: boolean; pathData: string }) {
  const circleRef = React.useRef<SVGCircleElement>(null);
  const pathElRef = React.useRef<SVGPathElement | null>(null);
  const colorRef = React.useRef(color);
  const reverseRef = React.useRef(reverse);
  const pathDataRef = React.useRef(pathData);
  colorRef.current = color;
  reverseRef.current = reverse;

  // Rebuild measurement path when pathData changes
  React.useEffect(() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', pathData);
    pathElRef.current = el;
    pathDataRef.current = pathData;
  }, [pathData]);

  // Single rAF loop for the lifetime of this component
  React.useEffect(() => {
    const MOVE_MS = 900;
    const PAUSE_MS = 200;
    const CYCLE = MOVE_MS + PAUSE_MS;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const pathEl = pathElRef.current;
      const circle = circleRef.current;
      if (!pathEl || !circle) { raf = requestAnimationFrame(tick); return; }

      const elapsed = (now - start) % CYCLE;
      let t: number;
      if (elapsed < MOVE_MS) {
        const linear = elapsed / MOVE_MS;
        t = linear < 0.5 ? 4 * linear * linear * linear : 1 - Math.pow(-2 * linear + 2, 3) / 2;
      } else {
        t = 1; // pause
      }
      if (reverseRef.current) t = 1 - t;

      const len = pathEl.getTotalLength();
      const pt = pathEl.getPointAtLength(len * t);
      circle.setAttribute('cx', String(pt.x));
      circle.setAttribute('cy', String(pt.y));

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // empty deps — never restarts, reads refs for latest values

  return <circle ref={circleRef} r={4} fill={color} stroke="#000" strokeWidth={1} />;
}

const MemoTrafficDot = React.memo(TrafficDot);

function WorkerEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, id, source, target } = props;
  const edgeStyle = useGameStore(s => s.settings.edgeStyle);

  let edgePath: string;
  if (edgeStyle === 'straight') {
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  } else if (edgeStyle === 'bezier') {
    [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  } else {
    [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  }

  // Sample traffic once per second
  const [snapshot, setSnapshot] = React.useState('');

  React.useEffect(() => {
    const sample = () => {
      const workers = useGameStore.getState().workers;
      const lines: string[] = [];
      const seen = new Set<string>();
      for (const w of workers) {
        if (w.status !== 'moving' || !w.previous_node) continue;
        const isFwd = w.previous_node === source && w.current_node === target;
        const isRev = w.previous_node === target && w.current_node === source;
        if (!isFwd && !isRev) continue;
        const key = `${w.class_name}-${isFwd ? 'f' : 'r'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`${CLASS_COLORS[w.class_name] || '#a78bfa'}:${isFwd ? 'f' : 'r'}`);
      }
      const next = lines.sort().join('|');
      setSnapshot(prev => prev === next ? prev : next);
    };
    sample();
    const iv = setInterval(sample, 1000);
    return () => clearInterval(iv);
  }, [source, target]);

  const dots = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.split('|').map(s => {
      const [color, dir] = s.split(':');
      return { color, reverse: dir === 'r' };
    });
  }, [snapshot]);

  const showTraffic = useGameStore(s => s.settings.showTrafficDots);
  const hasTraffic = showTraffic && dots.length > 0;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: hasTraffic ? 'rgba(255,255,255,0.2)' : (style?.stroke || 'var(--border-bright)'),
          strokeWidth: hasTraffic ? 2.5 : (style?.strokeWidth || 1.5),
        }}
        id={id}
      />
      {hasTraffic && dots.map((dot, i) => (
        <MemoTrafficDot key={`${i}-${dot.color}-${dot.reverse}`} color={dot.color} reverse={dot.reverse} pathData={edgePath} />
      ))}
    </>
  );
}

const EDGE_TYPES: EdgeTypes = {
  worker: WorkerEdge,
};

// ── Conversion helpers ──────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  Miner: '#fbbf24',
  Guardian: '#4ade80',
  Scout: '#60a5fa',
};

function toRFNodes(gameNodes: GameNode[], selectedId: string | null, workers: Worker[]): Node[] {
  return gameNodes.map(n => {
    // Workers at this node (not moving)
    const stationaryWorkers = workers.filter(w => {
      if (w.status === 'moving' && w.previous_node) return false;
      return (w.current_node || w.node_id) === n.id;
    }).map(w => ({ ...w, leaving: false }));

    // Workers leaving this node (moving, previous_node matches)
    const leavingWorkers = workers.filter(w =>
      w.status === 'moving' && w.previous_node === n.id
    ).map(w => ({ ...w, leaving: true }));

    const nodeWorkers = [...stationaryWorkers, ...leavingWorkers];
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data, selected: n.id === selectedId, workers: nodeWorkers },
      selected: n.id === selectedId,
    };
  });
}

/** Determine which handles to use based on edge style + relative node positions */
function getEdgeHandles(sourceId: string, targetId: string, gameNodes: GameNode[], edgeStyle: string): { sourceHandle?: string; targetHandle?: string } {
  // Straight mode: use center handles so lines go through middle of node
  if (edgeStyle === 'straight') {
    return { sourceHandle: 'center', targetHandle: 'center' };
  }

  const s = gameNodes.find(n => n.id === sourceId);
  const t = gameNodes.find(n => n.id === targetId);
  if (!s || !t) return {};

  const dx = t.position.x - s.position.x;
  const dy = t.position.y - s.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  } else {
    return dy > 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' };
  }
}

function toRFEdges(gameEdges: GameEdge[], edgeSelectMode: boolean, gameNodes: GameNode[], edgeStyle: string): Edge[] {
  const isUnlocked = (nodeId: string) => {
    const n = gameNodes.find(n => n.id === nodeId);
    return n?.id === 'hub' || !!n?.data?.unlocked;
  };

  return gameEdges.map(e => {
    const bothUnlocked = isUnlocked(e.source) && isUnlocked(e.target);
    const selectable = edgeSelectMode && bothUnlocked;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      style: {
        stroke: selectable ? 'var(--accent)' : edgeSelectMode && !bothUnlocked ? 'rgba(255,255,255,0.05)' : 'var(--border-bright)',
        strokeWidth: selectable ? 3 : 1.5,
        cursor: selectable ? 'pointer' : 'default',
        opacity: edgeSelectMode && !bothUnlocked ? 0.3 : 1,
      },
      animated: selectable,
      type: 'worker',
      ...getEdgeHandles(e.source, e.target, gameNodes, edgeStyle),
      className: selectable ? 'edge-selectable' : '',
    };
  });
}

// ── Main Graph ──────────────────────────────────────────────────────────

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode, workers, edgeSelectMode, settings } = useGameStore();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const isEdgeSelecting = !!edgeSelectMode;
  const edgeStyle = settings.edgeStyle;

  useEffect(() => {
    setNodes(toRFNodes(gameNodes, selectedNodeId, workers));
    setEdges(toRFEdges(gameEdges, isEdgeSelecting, gameNodes, edgeStyle));
  }, [gameNodes, gameEdges, selectedNodeId, workers, isEdgeSelecting, edgeStyle]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    if (isEdgeSelecting) return; // Ignore node clicks during edge selection
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, selectNode, isEdgeSelecting]);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    if (edgeSelectMode) {
      // Only allow selecting edges where both nodes are unlocked
      const isUnlocked = (id: string) => {
        const n = gameNodes.find(n => n.id === id);
        return n?.id === 'hub' || !!n?.data?.unlocked;
      };
      if (isUnlocked(edge.source) && isUnlocked(edge.target)) {
        edgeSelectMode.onSelect({ id: edge.id, source: edge.source, target: edge.target });
      }
    }
  }, [edgeSelectMode, gameNodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1}
          color="rgba(0, 212, 170, 0.06)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--bg-glass-heavy)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <MiniMap
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
          }}
          nodeColor={(node) => {
            if (node.type === 'hub') return '#00d4aa';
            if (node.type === 'infected') return '#ff4757';
            if (node.type === 'resource') return '#45aaf2';
            if (node.type === 'relay') return '#7c6af0';
            return '#333';
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
