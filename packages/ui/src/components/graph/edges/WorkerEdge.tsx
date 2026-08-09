import React from 'react';
import { EdgeProps, BaseEdge, getSmoothStepPath, getBezierPath } from 'reactflow';
import { useGameStore } from '../../../store/gameStore';
import { CLASS_COLORS } from '../../../constants/colors';

type TrafficDotSnapshot = {
  color: string;
  reverse: boolean;
  workerId: string;
  moveId: string;
};

function sameTrafficSnapshot(a: TrafficDotSnapshot[], b: TrafficDotSnapshot[]) {
  return a.length === b.length && a.every((dot, index) => {
    const other = b[index];
    return dot.color === other.color
      && dot.reverse === other.reverse
      && dot.workerId === other.workerId
      && dot.moveId === other.moveId;
  });
}

function TrafficDot({
  color,
  reverse,
  pathData,
  workerId,
  moveId,
}: {
  color: string;
  reverse: boolean;
  pathData: string;
  workerId: string;
  moveId: string;
}) {
  // Let the SVG compositor move the dot. The previous implementation created
  // one JS animation-frame loop per dot and forced path geometry calculations
  // on every frame, which scales poorly in worker-heavy games.
  const animationRef = React.useRef<SVGAnimateMotionElement>(null);
  const keyPoints = reverse ? '1;0;0' : '0;1;1';
  const isCurrentMove = useGameStore(s =>
    s.workers.some(w =>
      w.id === workerId && w.status === 'moving' && String(w.move_id ?? w.id) === moveId
    )
  );

  React.useLayoutEffect(() => {
    if (isCurrentMove) animationRef.current?.beginElement();
  }, [isCurrentMove]);

  if (!isCurrentMove) return null;

  return (
    <circle
      r={4}
      fill={color}
      stroke="#000"
      strokeWidth={1}
      style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color}40)` }}
    >
      <animateMotion
        ref={animationRef}
        path={pathData}
        begin="indefinite"
        dur="1.1s"
        repeatCount="1"
        fill="freeze"
        keyPoints={keyPoints}
        keyTimes="0;0.818;1"
        calcMode="spline"
        keySplines="0.42 0 0.58 1;0 0 1 1"
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

  const [snapshot, setSnapshot] = React.useState<TrafficDotSnapshot[]>([]);

  React.useEffect(() => {
    const sample = (workers: ReturnType<typeof useGameStore.getState>['workers']) => {
      const next: TrafficDotSnapshot[] = [];
      for (const w of workers) {
        if (w.status !== 'moving' || !w.previous_node) continue;
        const isFwd = w.previous_node === source && w.current_node === target;
        const isRev = w.previous_node === target && w.current_node === source;
        if (!isFwd && !isRev) continue;
        next.push({
          color: CLASS_COLORS[w.class_name] || '#a78bfa',
          reverse: isRev,
          workerId: w.id,
          moveId: String(w.move_id ?? w.id),
        });
      }
      next.sort((a, b) => a.workerId.localeCompare(b.workerId) || a.moveId.localeCompare(b.moveId));
      setSnapshot(prev => sameTrafficSnapshot(prev, next) ? prev : next);
    };

    sample(useGameStore.getState().workers);
    return useGameStore.subscribe((state, previousState) => {
      if (state.workers !== previousState.workers) sample(state.workers);
    });
  }, [source, target]);

  const showTraffic = useGameStore(s => s.settings.showTrafficDots);
  const hasTraffic = showTraffic && snapshot.length > 0;

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
      {hasTraffic && snapshot.map(dot => (
        <MemoTrafficDot
          key={`${dot.workerId}-${dot.moveId}`}
          color={dot.color}
          reverse={dot.reverse}
          pathData={edgePath}
          workerId={dot.workerId}
          moveId={dot.moveId}
        />
      ))}
    </>
  );
}
