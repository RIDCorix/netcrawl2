import { useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant, Node, Edge } from 'reactflow';
import { HubNode } from '../graph/nodes/HubNode';
import { ResourceNode } from '../graph/nodes/ResourceNode';
import { EmptyNode } from '../graph/nodes/SimpleNodes';

const NODE_TYPES = { hub: HubNode, resource: ResourceNode, empty: EmptyNode } as const;

/**
 * Tutorial mini-graph.
 *
 * Reuses the production node components so it matches the real game visually,
 * but keeps its own local nodes/edges state — it never subscribes the tutorial
 * to gameStore graph data.
 */
export function ChapterZeroGraph({
  workerAt,
  edgeFlashing,
  reducedMotion,
}: {
  workerAt: 'hub' | 'mine';
  edgeFlashing: boolean;
  reducedMotion: boolean;
}) {
  const nodes = useMemo<Node[]>(
    () => [
      {
        id: 'hub',
        type: 'hub',
        position: { x: 40, y: 120 },
        data: {
          label: 'HUB',
          showWorkerDots: false,
        },
        draggable: false,
        selectable: false,
      },
      {
        id: 'mine',
        type: 'resource',
        position: { x: 260, y: 120 },
        data: {
          label: 'DATA MINE',
          unlocked: true,
          rate: 3,
          items: [],
          showWorkerDots: false,
        },
        draggable: false,
        selectable: false,
      },
      {
        id: 'unknown',
        type: 'empty',
        position: { x: 150, y: 10 },
        data: { label: 'UNKNOWN', unlocked: false, showWorkerDots: false },
        draggable: false,
        selectable: false,
      },
    ],
    [],
  );

  const edges = useMemo<Edge[]>(
    () => [
      {
        id: 'e-hub-mine',
        source: 'hub',
        target: 'mine',
        style: {
          stroke: edgeFlashing ? '#ffffff' : 'var(--accent)',
          strokeWidth: edgeFlashing ? 3 : 1.5,
          transition: reducedMotion ? undefined : 'stroke 200ms ease, stroke-width 200ms ease',
        },
      },
      {
        id: 'e-hub-unknown',
        source: 'hub',
        target: 'unknown',
        style: { stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' },
      },
      {
        id: 'e-mine-unknown',
        source: 'mine',
        target: 'unknown',
        style: { stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' },
      },
    ],
    [edgeFlashing, reducedMotion],
  );

  return (
    <div
      className={`chapter0-graph${workerAt === 'hub' ? ' chapter0-graph-active-hub' : ' chapter0-graph-active-mine'}`}
      style={{ width: '100%', height: '100%', minHeight: 200, position: 'relative' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.6} color="rgba(120, 220, 255, 0.08)" />
      </ReactFlow>
    </div>
  );
}
