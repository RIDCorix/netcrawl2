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
  getSmoothStepPath,
  EdgeProps,
  BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge, Worker } from '../store/gameStore';
import React, { useEffect, useCallback } from 'react';
import { Zap, Mountain, Database, Shield, Lock, AlertTriangle, Radio, Pickaxe, Package } from 'lucide-react';
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
  const { selectWorker, selectedWorkerId } = useGameStore();
  const { zoom } = useViewport();
  const showDetails = zoom > 0.6;

  return (
    <div style={{
      position: 'relative',
      padding: '16px 24px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-glass-heavy)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${borderColor}`,
      boxShadow: selected
        ? `0 0 0 1px var(--accent-dim), 0 0 24px rgba(0, 212, 170, 0.15), 0 8px 32px rgba(0, 0, 0, 0.5)`
        : glowColor
          ? `0 0 16px ${glowColor}33, 0 8px 32px rgba(0, 0, 0, 0.4)`
          : '0 4px 24px rgba(0, 0, 0, 0.4)',
      minWidth: 140,
      textAlign: 'center' as const,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ...style,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
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
            const showAction = w.status === 'harvesting' || w.holding;

            return (
              <div
                key={w.id}
                title={`${w.class_name} (${w.status})\nid: ${w.id}\n@ ${w.current_node}`}
                onClick={(e) => { e.stopPropagation(); selectWorker(w.id); }}
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
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  pointerEvents: 'auto',
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: iconBg || `color-mix(in srgb, ${iconColor} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${iconColor} 25%, transparent)`,
      }}>
        <Icon size={20} color={iconColor} />
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.02em',
      }}>
        {label}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em',
        }}>
          {subtitle}
        </div>
      )}
    </div>
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
      minWidth: 130,
    }}>
      <NodeLabel label={data.label} icon={Shield} iconColor="var(--accent)" subtitle="CENTRAL HUB" />
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

const NODE_TYPES: NodeTypes = {
  hub: HubNode,
  resource: ResourceNode,
  relay: RelayNode,
  infected: InfectedNode,
  locked: LockedNode,
};

// ── Edge with CSS-animated traffic dots ─────────────────────────────────
// Uses CSS offset-path animation — survives React re-renders without glitch.

function WorkerEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, id, source, target } = props;
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  // Sample traffic once per second via interval, stored in a ref to avoid re-renders
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
        const dir = isFwd ? 'fwd' : 'rev';
        const key = `${w.class_name}-${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const color = CLASS_COLORS[w.class_name] || '#a78bfa';
        lines.push(`${color}:${dir}`);
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
      return { color, reverse: dir === 'rev' };
    });
  }, [snapshot]);

  const hasTraffic = dots.length > 0;

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
      {dots.map((dot, i) => (
        <circle key={`${dot.color}-${dot.reverse}-${i}`} r={4} fill={dot.color} stroke="#000" strokeWidth={1}>
          <animateMotion
            dur="1.1s"
            repeatCount="indefinite"
            keyPoints={dot.reverse ? "1;0;0" : "0;1;1"}
            keyTimes="0;0.9;1"
            calcMode="spline"
            keySplines="0.42 0 0.58 1;0 0 1 1"
            path={edgePath}
          />
        </circle>
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
    const nodeWorkers = workers.filter(w => {
      if (w.status === 'moving' && w.previous_node) return false;
      return (w.current_node || w.node_id) === n.id;
    });
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data, selected: n.id === selectedId, workers: nodeWorkers },
      selected: n.id === selectedId,
    };
  });
}

function toRFEdges(gameEdges: GameEdge[], edgeSelectMode: boolean, gameNodes: GameNode[]): Edge[] {
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
      className: selectable ? 'edge-selectable' : '',
    };
  });
}

// ── Main Graph ──────────────────────────────────────────────────────────

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode, workers, edgeSelectMode } = useGameStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const isEdgeSelecting = !!edgeSelectMode;

  useEffect(() => {
    setNodes(toRFNodes(gameNodes, selectedNodeId, workers));
    setEdges(toRFEdges(gameEdges, isEdgeSelecting, gameNodes));
  }, [gameNodes, gameEdges, selectedNodeId, workers, isEdgeSelecting]);

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
        edgeSelectMode.onSelect({ source: edge.source, target: edge.target });
      }
    }
  }, [edgeSelectMode, gameNodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2}
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
