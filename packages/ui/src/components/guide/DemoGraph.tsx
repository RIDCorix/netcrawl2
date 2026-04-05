/**
 * DemoGraph — A mini React Flow graph for quest guide demos.
 *
 * Renders 2-5 nodes with the exact same visual style as the main GameGraph,
 * plus a worker dot, drop indicators, and edge highlighting.
 * No interaction — purely for animated playback.
 */

import React, { useMemo } from 'react';
import ReactFlow, { Node, Edge, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import { Database, Shield, Lock, Cpu, Box, Pickaxe, Package, AlertTriangle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DemoGraphState, DemoWorker } from './types';

// ── Shared handle style (hidden) ───────────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
};

// ── Worker Dot ─────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, any> = {
  mining: Pickaxe,
  collecting: Package,
  depositing: Package,
  discarding: Trash2,
  scanning: Cpu,
};

function DemoWorkerDot({ worker }: { worker?: DemoWorker }) {
  if (!worker) return null;
  const color = worker.color || '#fbbf24';
  const IconComp = worker.status ? STATUS_ICONS[worker.status] : null;

  return (
    <motion.div
      layoutId="demo-worker-dot"
      style={{
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        zIndex: 10,
      }}
    >
      {IconComp && (
        <motion.div
          key={worker.status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            color,
            animation: 'worker-action-bounce 0.6s ease-in-out infinite',
          }}
        >
          <IconComp size={10} />
        </motion.div>
      )}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          border: '2px solid #fff',
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
        }}
      />
    </motion.div>
  );
}

// ── Drop Badge ─────────────────────────────────────────────────────────────

function DropBadge({ count }: { count: number }) {
  if (!count) return null;
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

// ── Node Wrapper (matches GameGraph exactly) ───────────────────────────────

function DemoNodeWrapper({ children, glowColor, highlighted, style = {} }: {
  children: React.ReactNode;
  glowColor?: string;
  highlighted?: boolean;
  style?: React.CSSProperties;
}) {
  const borderColor = highlighted ? '#fff' : glowColor || 'var(--border-bright)';
  return (
    <div style={{
      position: 'relative',
      padding: '6px',
      borderRadius: '10px',
      background: 'var(--bg-glass-heavy)',
      border: `1px solid ${borderColor}`,
      boxShadow: highlighted
        ? `0 0 0 1px rgba(255,255,255,0.3), 0 0 16px rgba(255,255,255,0.2)`
        : glowColor
          ? `0 0 8px ${glowColor}33`
          : '0 2px 8px rgba(0, 0, 0, 0.4)',
      textAlign: 'center' as const,
      transition: 'border-color 0.3s, box-shadow 0.3s',
      ...style,
    }}>
      <Handle id="center" type="source" position={Position.Top} style={HANDLE_STYLE} />
      <Handle id="center" type="target" position={Position.Top} style={HANDLE_STYLE} />
      {children}
    </div>
  );
}

function DemoNodeLabel({ label, subtitle, icon: Icon, iconColor }: {
  label: string;
  subtitle?: string;
  icon: any;
  iconColor: string;
}) {
  return (
    <>
      <Icon size={16} color={iconColor} />
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

// ── Custom Node Types ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = {
  hub: Shield,
  resource: Database,
  empty: Box,
  locked: Lock,
  compute: Cpu,
  infected: AlertTriangle,
};

const COLOR_MAP: Record<string, string> = {
  hub: 'var(--accent)',
  resource: 'var(--data-color)',
  empty: 'var(--accent-secondary)',
  locked: 'var(--text-muted)',
  compute: '#4ade80',
  infected: 'var(--danger)',
};

function DemoCustomNode({ data }: any) {
  const nodeType = data.nodeType || 'resource';
  const Icon = ICON_MAP[nodeType] || Database;
  const color = data.color || COLOR_MAP[nodeType] || 'var(--text-muted)';
  const isHub = nodeType === 'hub';
  const isWorkerHere = data.workerNodeId === data.nodeId;

  return (
    <DemoNodeWrapper
      glowColor={color}
      highlighted={data.highlighted}
      style={isHub ? {
        animation: 'hub-pulse 3s ease-in-out infinite',
        padding: '10px 14px',
      } : undefined}
    >
      <DropBadge count={data.dropCount || 0} />
      {isWorkerHere && <DemoWorkerDot worker={data.worker} />}
      {isHub ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Icon size={18} color={color} />
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {data.label}
          </div>
        </div>
      ) : (
        <DemoNodeLabel
          label={data.label}
          subtitle={data.subtitle}
          icon={Icon}
          iconColor={color}
        />
      )}
    </DemoNodeWrapper>
  );
}

const NODE_TYPES = { demo: DemoCustomNode };

// ── Main Component ─────────────────────────────────────────────────────────

export function DemoGraph({ state }: { state: DemoGraphState }) {
  const nodes: Node[] = useMemo(() =>
    state.nodes.map(n => ({
      id: n.id,
      type: 'demo',
      position: n.position,
      draggable: false,
      selectable: false,
      data: {
        nodeId: n.id,
        nodeType: n.type,
        label: n.label,
        subtitle: n.subtitle,
        color: n.color,
        highlighted: n.highlighted,
        dropCount: n.dropCount || 0,
        workerNodeId: state.worker?.nodeId,
        worker: state.worker?.nodeId === n.id ? state.worker : undefined,
        ...n.data,
      },
    })),
    [state],
  );

  const edges: Edge[] = useMemo(() =>
    state.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'straight',
      sourceHandle: 'center',
      targetHandle: 'center',
      style: {
        stroke: e.highlighted ? '#fff' : 'var(--border-bright)',
        strokeWidth: e.highlighted ? 3 : 1.5,
        filter: e.highlighted
          ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))'
          : 'drop-shadow(0 0 2px rgba(0, 212, 170, 0.15))',
        transition: 'stroke 0.3s, stroke-width 0.3s, filter 0.3s',
      },
      label: e.label,
      labelStyle: { fill: 'var(--text-secondary)', fontSize: 9, fontFamily: 'var(--font-mono)' },
      labelBgStyle: { fill: 'var(--bg-glass-heavy)', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
    })),
    [state],
  );

  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.5 }}
        minZoom={0.5}
        maxZoom={1.5}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
