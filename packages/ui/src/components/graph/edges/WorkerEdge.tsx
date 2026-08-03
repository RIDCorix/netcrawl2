import React from 'react';
import { EdgeProps, BaseEdge, getSmoothStepPath, getBezierPath } from 'reactflow';
import { useGameStore } from '../../../store/gameStore';
import { CLASS_COLORS } from '../../../constants/colors';

function TrafficDot({ color, reverse, pathData }: { color: string; reverse: boolean; pathData: string }) {
  // Let the SVG compositor move the dot. The previous implementation created
  // one JS animation-frame loop per dot and forced path geometry calculations
  // on every frame, which scales poorly in worker-heavy games.
  const keyPoints = reverse ? '1;0;0' : '0;1;1';
  return (
    <circle r={4} fill={color} stroke="#000" strokeWidth={1}>
      <animateMotion
        path={pathData}
        dur="1.1s"
        repeatCount="indefinite"
        keyPoints={keyPoints}
        keyTimes="0;0.818;1"
        calcMode="linear"
      />
    </circle>
  );
}

const MemoTrafficDot = React.memo(TrafficDot);

export function WorkerEdge(props: EdgeProps) {
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
          stroke: style?.stroke || 'var(--border-bright)',
          strokeWidth: style?.strokeWidth || 1.5,
        }}
        id={id}
      />
      {hasTraffic && dots.map((dot, i) => (
        <MemoTrafficDot key={`${i}-${dot.color}-${dot.reverse}`} color={dot.color} reverse={dot.reverse} pathData={edgePath} />
      ))}
    </>
  );
}
