import ReactFlow, {
  Background, MiniMap, Node, Edge,
  NodeTypes, EdgeTypes,
  useNodesState, useEdgesState,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore } from '../../store/gameStore';
import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useT } from '../../hooks/useT';

import { HubNode } from './nodes/HubNode';
import { ResourceNode } from './nodes/ResourceNode';
import { ComputeNode } from './nodes/ComputeNode';
import { InfectedNode, LockedNode, EmptyNode, CacheNode, AuthNodeComponent, APINodeComponent } from './nodes/SimpleNodes';
import { WorkerEdge } from './edges/WorkerEdge';
import { ErrorOffscreenIndicators } from './ErrorOffscreenIndicators';
import { toRFNodes, toRFEdges } from './graphUtils';

const NODE_TYPES: NodeTypes = {
  hub: HubNode,
  resource: ResourceNode,
  infected: InfectedNode,
  locked: LockedNode,
  compute: ComputeNode,
  empty: EmptyNode,
  relay: EmptyNode,
  cache: CacheNode,
  api: APINodeComponent,
  auth: AuthNodeComponent,
};

const EDGE_TYPES: EdgeTypes = {
  worker: WorkerEdge,
};

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode, edgeSelectMode, nodeSelectMode, routePath, settings } = useGameStore();
  const t = useT();
  const tn = useCallback((label: string) => { const k = `n.${label}`; const v = t(k); return v === k ? label : v; }, [t]);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const isEdgeSelecting = !!edgeSelectMode;
  const edgeStyle = settings.edgeStyle;
  const showWorkerDots = settings.showWorkerDots;

  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  const fadeInIdsRef = useRef<Set<string>>(new Set());

  const rfNodes = useMemo(() => {
    const currentIds = new Set(gameNodes.map(n => n.id));
    const newIds = new Set<string>();
    if (knownNodeIdsRef.current.size > 0) {
      for (const id of currentIds) {
        if (!knownNodeIdsRef.current.has(id)) newIds.add(id);
      }
    }
    knownNodeIdsRef.current = currentIds;
    for (const id of newIds) fadeInIdsRef.current.add(id);

    return toRFNodes(gameNodes, selectedNodeId, showWorkerDots, edgeStyle, fadeInIdsRef.current, tn, routePath);
  }, [gameNodes, selectedNodeId, showWorkerDots, edgeStyle, tn, routePath]);

  const rfEdges = useMemo(
    () => toRFEdges(gameEdges, isEdgeSelecting, gameNodes, edgeStyle, routePath),
    [gameEdges, isEdgeSelecting, gameNodes, edgeStyle, routePath]
  );

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges]);

  useEffect(() => {
    if (fadeInIdsRef.current.size === 0) return;
    const timer = setTimeout(() => { fadeInIdsRef.current.clear(); }, 600);
    return () => clearTimeout(timer);
  }, [rfNodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    if (isEdgeSelecting) return;
    if (nodeSelectMode) {
      const gn = gameNodes.find(n => n.id === node.id);
      if (gn?.id === 'hub' || gn?.data?.unlocked) {
        nodeSelectMode.onSelect(node.id);
      }
      return;
    }
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, selectNode, isEdgeSelecting, nodeSelectMode, gameNodes]);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    if (edgeSelectMode) {
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
        fitViewOptions={{
          padding: 0.3,
          nodes: nodes.filter(n => n.id === 'hub' || n.data?.unlocked),
          maxZoom: 1.2,
        }}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="rgba(0, 212, 170, 0.06)" />
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
            if (node.type === 'cache') return '#a78bfa';
            if (node.type === 'api') return '#f59e0b';
            if (node.type === 'empty') return '#555';
            return '#333';
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
          pannable
          zoomable
        />
        <ErrorOffscreenIndicators gameNodes={gameNodes} />
      </ReactFlow>
    </div>
  );
}
