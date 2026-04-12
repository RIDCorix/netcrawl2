import React from 'react';
import { Cpu } from 'lucide-react';
import { NodeWrapper } from '../NodeWrapper';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#60a5fa',
  hard: '#f59e0b',
};

export function ComputeNode({ id, data, selected }: any) {
  const color = DIFFICULTY_COLORS[data.difficulty] || '#a78bfa';
  return (
    <NodeWrapper
      selected={selected}
      glowColor={data.unlocked ? color : '#a78bfa'}
      nodeId={id}
      showWorkerDots={data.showWorkerDots}
      edgeStyle={data.edgeStyle}
      fadeIn={data.fadeIn}
      routeIndices={data.routeIndices}
      style={{
        opacity: data.unlocked ? 1 : 0.7,
        padding: '18px 22px',
        borderRadius: 14,
        borderWidth: 2,
        animation: 'boss-pulse 2.6s ease-in-out infinite',
      }}
    >
      <div aria-hidden style={{
        position: 'absolute', inset: -14, borderRadius: 18,
        border: `1px dashed ${color}55`, pointerEvents: 'none',
        animation: 'boss-rotate 14s linear infinite',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: -22, borderRadius: 22,
        border: `1px dotted ${color}33`, pointerEvents: 'none',
        animation: 'boss-rotate 22s linear infinite reverse',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `radial-gradient(circle at 50% 50%, ${color}33, ${color}0a 60%, transparent 100%)`,
          border: `1px solid ${color}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'boss-icon-pulse 2.2s ease-in-out infinite', color,
        }}>
          <Cpu size={22} color={color} strokeWidth={2.25} />
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
          color: data.unlocked ? color : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        }}>
          {data.unlocked ? (data.difficulty || 'PUZZLE') : 'LOCKED'}
        </div>
      </div>
      <div style={{
        position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
        marginLeft: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{data.label}</div>
        <div style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}>BOSS · {(data.difficulty || 'PUZZLE').toUpperCase()}</div>
      </div>
      {data.unlocked && data.solveCount > 0 && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          background: color, color: '#000',
          fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
          borderRadius: '999px', width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 12px ${color}`,
        }}>
          {data.solveCount}
        </div>
      )}
    </NodeWrapper>
  );
}
