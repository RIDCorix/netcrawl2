import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeTypes,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge } from '../store/gameStore';
import { useEffect, useCallback } from 'react';
import { Zap, Mountain, Database, Shield, Lock, AlertTriangle, Radio } from 'lucide-react';
import { motion } from 'framer-motion';

// ── Custom Node Components ──────────────────────────────────────────────────

function NodeWrapper({ children, selected, glowColor, style = {} }: {
  children: React.ReactNode;
  selected?: boolean;
  glowColor?: string;
  style?: React.CSSProperties;
}) {
  const borderColor = selected ? 'var(--accent)' : glowColor || 'var(--border-bright)';

  return (
    <div style={{
      position: 'relative',
      padding: '14px 20px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-glass-heavy)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${borderColor}`,
      boxShadow: selected
        ? `0 0 0 1px var(--accent-dim), 0 0 24px rgba(0, 212, 170, 0.15), 0 8px 32px rgba(0, 0, 0, 0.5)`
        : glowColor
          ? `0 0 16px ${glowColor}33, 0 8px 32px rgba(0, 0, 0, 0.4)`
          : '0 4px 24px rgba(0, 0, 0, 0.4)',
      minWidth: 120,
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: iconBg || `color-mix(in srgb, ${iconColor} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${iconColor} 25%, transparent)`,
      }}>
        <Icon size={18} color={iconColor} />
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.02em',
      }}>
        {label}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 10,
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
    <NodeWrapper selected={selected} glowColor="var(--accent)" style={{
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
    <NodeWrapper selected={selected} glowColor={data.unlocked ? 'var(--accent-secondary)' : undefined} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
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
    <NodeWrapper selected={selected} glowColor="var(--danger)" style={{
      animation: 'infected-pulse 1.5s ease-in-out infinite',
      borderColor: 'var(--danger)',
    }}>
      <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="INFECTED" />
    </NodeWrapper>
  );
}

function LockedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} style={{
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

// ── Conversion helpers ──────────────────────────────────────────────────

function toRFNodes(gameNodes: GameNode[], selectedId: string | null): Node[] {
  return gameNodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, selected: n.id === selectedId },
    selected: n.id === selectedId,
  }));
}

function toRFEdges(gameEdges: GameEdge[]): Edge[] {
  return gameEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    style: {
      stroke: 'var(--border-bright)',
      strokeWidth: 1.5,
    },
    animated: false,
    type: 'smoothstep',
  }));
}

// ── Main Graph ──────────────────────────────────────────────────────────

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode } = useGameStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setNodes(toRFNodes(gameNodes, selectedNodeId));
    setEdges(toRFEdges(gameEdges));
  }, [gameNodes, gameEdges, selectedNodeId]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, selectNode]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={NODE_TYPES}
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
