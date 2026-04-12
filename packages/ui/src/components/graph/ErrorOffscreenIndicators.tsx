import React, { useMemo, useRef } from 'react';
import { useReactFlow, useViewport } from 'reactflow';
import { useGameStore, GameNode } from '../../store/gameStore';

export function ErrorOffscreenIndicators({ gameNodes }: { gameNodes: GameNode[] }) {
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workers = useGameStore(s => s.workers);

  const errorWorkers = workers.filter(w => w.status === 'error' || w.status === 'crashed');

  const indicators = useMemo(() => {
    if (errorWorkers.length === 0) return [];
    const el = wrapperRef.current?.closest('.react-flow') as HTMLElement | null;
    const width = el?.clientWidth || window.innerWidth;
    const height = el?.clientHeight || window.innerHeight;
    const { x: vx, y: vy, zoom } = viewport;
    const margin = 40;

    const result: Array<{ workerId: string; nodeId: string; x: number; y: number; angle: number; label: string }> = [];

    for (const w of errorWorkers) {
      const nodeId = w.current_node || w.node_id;
      const gn = gameNodes.find(n => n.id === nodeId);
      if (!gn) continue;

      const screenX = gn.position.x * zoom + vx;
      const screenY = gn.position.y * zoom + vy;

      const isOffscreen = screenX < -20 || screenX > width + 20 || screenY < -20 || screenY > height + 20;
      if (!isOffscreen) continue;

      const cx = width / 2;
      const cy = height / 2;
      const dx = screenX - cx;
      const dy = screenY - cy;
      const angle = Math.atan2(dy, dx);

      const absCos = Math.abs(Math.cos(angle));
      const absSin = Math.abs(Math.sin(angle));
      let ix: number, iy: number;
      if (absCos * height > absSin * width) {
        ix = Math.cos(angle) > 0 ? width - margin : margin;
        iy = cy + Math.tan(angle) * (ix - cx);
      } else {
        iy = Math.sin(angle) > 0 ? height - margin : margin;
        ix = cx + (iy - cy) / Math.tan(angle);
      }
      ix = Math.max(margin, Math.min(width - margin, ix));
      iy = Math.max(margin, Math.min(height - margin, iy));

      const msg = w.lastLog ? w.lastLog.message?.replace(/^\[(ERROR)\]\s*/i, '') || 'Error' : 'Error';
      result.push({ workerId: w.id, nodeId, x: ix, y: iy, angle: angle * (180 / Math.PI), label: msg });
    }
    return result;
  }, [errorWorkers.map(w => w.id).join(','), gameNodes, viewport]);

  return (
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {indicators.map(ind => (
        <div
          key={ind.workerId}
          onClick={() => {
            const gn = gameNodes.find(n => n.id === ind.nodeId);
            if (gn) reactFlow.setCenter(gn.position.x, gn.position.y, { duration: 400, zoom: 1.2 });
          }}
          style={{
            position: 'absolute', left: ind.x, top: ind.y,
            transform: 'translate(-50%, -50%)', pointerEvents: 'auto', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            animation: 'error-indicator-pulse 2s ease-in-out infinite',
          }}
          title={`Error: ${ind.label} — click to jump`}
        >
          <svg width={20} height={20} style={{ transform: `rotate(${ind.angle}deg)`, filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.6))' }}>
            <polygon points="18,10 2,3 2,17" fill="#ef4444" />
          </svg>
          <span style={{
            fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700,
            color: '#ef4444', background: 'rgba(0,0,0,0.75)',
            padding: '2px 5px', borderRadius: 3, border: '1px solid #ef444460',
            maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textShadow: '0 0 4px rgba(239,68,68,0.5)',
          }}>
            ⚠ {ind.label}
          </span>
        </div>
      ))}
    </div>
  );
}
