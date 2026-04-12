import React from 'react';
import { EdgeProps, BaseEdge, getSmoothStepPath, getBezierPath } from 'reactflow';
import { useGameStore } from '../../../store/gameStore';
import { CLASS_COLORS } from '../../../constants/colors';

function TrafficDot({ color, reverse, pathData }: { color: string; reverse: boolean; pathData: string }) {
  const circleRef = React.useRef<SVGCircleElement>(null);
  const pathElRef = React.useRef<SVGPathElement | null>(null);
  const reverseRef = React.useRef(reverse);
  reverseRef.current = reverse;

  React.useEffect(() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', pathData);
    pathElRef.current = el;
  }, [pathData]);

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
        t = 1;
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
  }, []);

  return <circle ref={circleRef} r={4} fill={color} stroke="#000" strokeWidth={1} />;
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
