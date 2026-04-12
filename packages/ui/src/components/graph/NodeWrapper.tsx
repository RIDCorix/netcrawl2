import React from 'react';
import { Handle, Position } from 'reactflow';
import { WorkerDotsRow } from './WorkerDotsRow';

const HANDLE_STYLE_HIDDEN = { opacity: 0 } as const;
const HANDLE_STYLE_CENTER = { opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as const;

export function NodeWrapper({ children, selected, glowColor, style = {}, nodeId, showWorkerDots, edgeStyle: currentEdgeStyle, fadeIn, routeIndices }: {
  children: React.ReactNode;
  selected?: boolean;
  glowColor?: string;
  style?: React.CSSProperties;
  nodeId: string;
  showWorkerDots?: boolean;
  edgeStyle?: string;
  fadeIn?: boolean;
  routeIndices?: number[];
}) {
  const isOnRoute = routeIndices && routeIndices.length > 0;
  const borderColor = isOnRoute ? '#f59e0b' : selected ? 'var(--accent)' : glowColor || 'var(--border-bright)';

  return (
    <div style={{
      position: 'relative',
      padding: '6px',
      borderRadius: '10px',
      background: 'var(--bg-glass-heavy)',
      border: `${isOnRoute ? '2px' : '1px'} solid ${borderColor}`,
      boxShadow: isOnRoute
        ? `0 0 0 2px rgba(245,158,11,0.2), 0 0 16px rgba(245,158,11,0.3)`
        : selected
          ? `0 0 0 1px var(--accent-dim), 0 0 12px rgba(0, 212, 170, 0.15)`
          : glowColor
            ? `0 0 8px ${glowColor}33`
            : '0 2px 8px rgba(0, 0, 0, 0.4)',
      minWidth: 0,
      textAlign: 'center' as const,
      cursor: 'pointer',
      animation: fadeIn ? 'node-fade-in 0.5s ease-out' : undefined,
      ...style,
    }}>
      {isOnRoute && (
        <div style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, display: 'flex', gap: 2 }}>
          {routeIndices!.map(idx => (
            <div key={idx} style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#f59e0b', color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
              boxShadow: '0 0 8px rgba(245,158,11,0.5)',
            }}>
              {idx + 1}
            </div>
          ))}
        </div>
      )}
      {currentEdgeStyle === 'straight' ? (
        <>
          <Handle id="center" type="source" position={Position.Top} style={HANDLE_STYLE_CENTER} />
          <Handle id="center" type="target" position={Position.Top} style={HANDLE_STYLE_CENTER} />
        </>
      ) : (
        <>
          <Handle id="top" type="source" position={Position.Top} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="bottom" type="source" position={Position.Bottom} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="left" type="source" position={Position.Left} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="right" type="source" position={Position.Right} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="top" type="target" position={Position.Top} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="bottom" type="target" position={Position.Bottom} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="left" type="target" position={Position.Left} style={HANDLE_STYLE_HIDDEN} />
          <Handle id="right" type="target" position={Position.Right} style={HANDLE_STYLE_HIDDEN} />
        </>
      )}
      {children}
      <WorkerDotsRow nodeId={nodeId} show={!!showWorkerDots} />
    </div>
  );
}
