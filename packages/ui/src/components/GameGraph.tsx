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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge } from '../store/gameStore';
import { useEffect, useCallback } from 'react';
import { Zap, Mountain, Database, Shield, Lock, AlertTriangle, Radio } from 'lucide-react';
import { motion } from 'framer-motion';

// ── Custom Node Components ──────────────────────────────────────────────────

function NodeWrapper({ children, selected, style = {} }: { children: React.ReactNode; selected?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px var(--accent-dim), 0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.3)',
        minWidth: '100px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function NodeLabel({ label, subtitle, icon: Icon, iconColor }: {
  label: string;
  subtitle?: string;
  icon: any;
  iconColor: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon size={18} color={iconColor} />
      <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      {subtitle && (
        <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function HubNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} style={{ border: '1.5px solid var(--accent)', minWidth: '110px' }}>
      <NodeLabel label={data.label} icon={Shield} iconColor="var(--accent)" subtitle="Central Hub" />
    </NodeWrapper>
  );
}

function ResourceNode({ data, selected }: any) {
  const icons: any = { energy: Zap, ore: Mountain, data: Database };
  const colors: any = { energy: 'var(--energy-color)', ore: 'var(--ore-color)', data: 'var(--data-color)' };
  const Icon = icons[data.resource] || Zap;
  const color = colors[data.resource] || 'var(--text-muted)';
  return (
    <NodeWrapper selected={selected} style={{ opacity: data.unlocked ? 1 : 0.6 }}>
      <NodeLabel
        label={data.label}
        icon={Icon}
        iconColor={data.unlocked ? color : 'var(--text-muted)'}
        subtitle={data.unlocked ? `+${data.rate}/harvest` : 'Locked'}
      />
    </NodeWrapper>
  );
}

function RelayNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} style={{ opacity: data.unlocked ? 1 : 0.6 }}>
      <NodeLabel label={data.label} icon={Radio} iconColor="var(--accent-secondary)" subtitle={data.unlocked ? 'Active' : 'Locked'} />
    </NodeWrapper>
  );
}

function InfectedNode({ data, selected }: any) {
  return (
    <motion.div
      animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.4)', '0 0 0 8px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0.4)'] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      style={{ borderRadius: '10px' }}
    >
      <NodeWrapper selected={selected} style={{ border: '1.5px solid var(--danger)' }}>
        <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="Infected!" />
      </NodeWrapper>
    </motion.div>
  );
}

function LockedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} style={{ opacity: 0.5, border: '1.5px dashed var(--border)' }}>
      <NodeLabel label={data.label} icon={Lock} iconColor="var(--text-muted)" subtitle="Unknown" />
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

// ── Conversion helpers ──────────────────────────────────────────────────────

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
    style: { stroke: 'var(--border-bright)', strokeWidth: 1.5 },
    animated: false,
  }));
}

// ── Main Graph ──────────────────────────────────────────────────────────────

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
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255,255,255,0.05)"
        />
        <Controls
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <MiniMap
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
          nodeColor={(node) => {
            if (node.type === 'hub') return 'var(--accent)';
            if (node.type === 'infected') return 'var(--danger)';
            if (node.type === 'locked') return '#333';
            return '#555';
          }}
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  );
}
