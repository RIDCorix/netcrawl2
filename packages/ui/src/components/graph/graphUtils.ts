import { Node, Edge } from 'reactflow';
import { GameNode, GameEdge } from '../../store/gameStore';

export function toRFNodes(gameNodes: GameNode[], selectedId: string | null, showWorkerDots: boolean, edgeStyle: string, fadeInIds: Set<string>, tn: (label: string) => string, routePath: string[] = []): Node[] {
  return gameNodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      ...n.data, label: tn(n.data.label), selected: n.id === selectedId, showWorkerDots, edgeStyle, fadeIn: fadeInIds.has(n.id),
      routeIndices: routePath.reduce<number[]>((acc, id, i) => { if (id === n.id) acc.push(i); return acc; }, []),
    },
    selected: n.id === selectedId,
  }));
}

export function getEdgeHandles(sourceId: string, targetId: string, gameNodes: GameNode[], edgeStyle: string): { sourceHandle?: string; targetHandle?: string } {
  if (edgeStyle === 'straight') return { sourceHandle: 'center', targetHandle: 'center' };

  const s = gameNodes.find(n => n.id === sourceId);
  const t = gameNodes.find(n => n.id === targetId);
  if (!s || !t) return {};

  const dx = t.position.x - s.position.x;
  const dy = t.position.y - s.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' };
  } else {
    return dy > 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' };
  }
}

export function toRFEdges(gameEdges: GameEdge[], edgeSelectMode: boolean, gameNodes: GameNode[], edgeStyle: string, routePath: string[] = []): Edge[] {
  const isUnlocked = (nodeId: string) => {
    const n = gameNodes.find(n => n.id === nodeId);
    return n?.id === 'hub' || !!n?.data?.unlocked;
  };

  const routeEdgeIds = new Set<string>();
  for (let i = 0; i < routePath.length - 1; i++) {
    const a = routePath[i], b = routePath[i + 1];
    const e = gameEdges.find(e => (e.source === a && e.target === b) || (e.source === b && e.target === a));
    if (e) routeEdgeIds.add(e.id);
  }

  return gameEdges.map(e => {
    const bothUnlocked = isUnlocked(e.source) && isUnlocked(e.target);
    const selectable = edgeSelectMode && bothUnlocked;
    const isRoutePart = routeEdgeIds.has(e.id);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      style: {
        stroke: isRoutePart ? '#f59e0b' : selectable ? 'var(--accent)' : edgeSelectMode && !bothUnlocked ? 'rgba(255,255,255,0.05)' : 'var(--border-bright)',
        strokeWidth: isRoutePart ? 3.5 : selectable ? 3 : 1.5,
        cursor: selectable ? 'pointer' : 'default',
        opacity: edgeSelectMode && !bothUnlocked ? 0.3 : 1,
      },
      animated: isRoutePart || selectable,
      type: 'worker',
      ...getEdgeHandles(e.source, e.target, gameNodes, edgeStyle),
      className: selectable ? 'edge-selectable' : '',
    };
  });
}
