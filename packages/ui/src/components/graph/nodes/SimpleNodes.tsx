import React from 'react';
import { Lock, AlertTriangle, Box, HardDrive, Globe, ShieldCheck } from 'lucide-react';
import { Handle as RFHandle, Position as RFPosition } from 'reactflow';
import { NodeWrapper } from '../NodeWrapper';
import { NodeLabel } from '../NodeLabel';

export function InfectedNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--danger)" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      animation: 'infected-pulse 1.5s ease-in-out infinite',
      borderColor: 'var(--danger)',
    }}>
      <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="INFECTED" />
    </NodeWrapper>
  );
}

export function LockedNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      opacity: 0.4,
      border: '1px dashed var(--border-bright)',
    }}>
      <NodeLabel label={data.label} icon={Lock} iconColor="var(--text-muted)" subtitle="UNKNOWN" />
    </NodeWrapper>
  );
}

export function EmptyNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      opacity: data.unlocked ? 0.8 : 0.4,
      border: '1px dashed var(--border-bright)',
    }}>
      <NodeLabel label={data.label} icon={Box} iconColor={data.unlocked ? 'var(--accent-secondary)' : 'var(--text-muted)'} subtitle={data.unlocked ? 'BUILDABLE' : 'LOCKED'} />
    </NodeWrapper>
  );
}

export function CacheNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? '#a78bfa' : undefined} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
      <NodeLabel label={data.label} icon={HardDrive} iconColor={data.unlocked ? '#a78bfa' : 'var(--text-muted)'} subtitle={data.unlocked ? `LV.${data.upgradeLevel || 1} \u00b7 RANGE ${data.cacheRange || 1}` : 'LOCKED'} />
    </NodeWrapper>
  );
}

export function AuthNodeComponent({ id, data, selected }: any) {
  const label = data.data?.label || 'Auth';
  const unlocked = data.data?.unlocked || false;

  return (
    <NodeWrapper selected={selected} glowColor="#a78bfa" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: unlocked ? 1 : 0.5 }}>
      <RFHandle type="target" position={RFPosition.Left} style={{ opacity: 0 }} />
      <RFHandle type="source" position={RFPosition.Right} style={{ opacity: 0 }} />
      <RFHandle type="target" position={RFPosition.Top} style={{ opacity: 0 }} />
      <RFHandle type="source" position={RFPosition.Bottom} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 24, height: 24, background: 'rgba(167,139,250,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={14} style={{ color: '#a78bfa' }} />
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{label}</div>
        <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: '#a78bfa', letterSpacing: '0.05em' }}>{unlocked ? 'READY' : 'LOCKED'}</div>
      </div>
    </NodeWrapper>
  );
}

export function APINodeComponent({ id, data, selected }: any) {
  const infectionValue = data.data?.infectionValue || 0;
  const pendingReqs = data.data?.pendingRequests || 0;
  const infected = data.data?.infected || false;
  const label = data.data?.label || 'API';
  const unlocked = data.data?.unlocked || false;

  const slaStatus = infected ? 'infected' : infectionValue >= 60 ? 'danger' : infectionValue >= 30 ? 'warning' : 'normal';
  const slaColor = { normal: '#f59e0b', warning: '#f97316', danger: '#ef4444', infected: '#7f1d1d' }[slaStatus];
  const infectionBarColor = infectionValue >= 60 ? '#ef4444' : infectionValue >= 30 ? '#f97316' : '#4ade80';

  return (
    <NodeWrapper selected={selected} glowColor={slaColor} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: unlocked ? 1 : 0.5 }}>
      <RFHandle type="target" position={RFPosition.Left} style={{ opacity: 0 }} />
      <RFHandle type="source" position={RFPosition.Right} style={{ opacity: 0 }} />
      <RFHandle type="target" position={RFPosition.Top} style={{ opacity: 0 }} />
      <RFHandle type="source" position={RFPosition.Bottom} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 24, height: 24, background: infected ? 'rgba(239,68,68,0.2)' : `${slaColor}20`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {infected ? <span style={{ fontSize: 14 }}>⚠️</span> : <Globe size={14} style={{ color: slaColor }} />}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {unlocked && !infected && (
          <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: pendingReqs > 3 ? '#ef4444' : pendingReqs > 0 ? '#f59e0b' : 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {pendingReqs > 0 ? `${pendingReqs} req${pendingReqs > 1 ? 's' : ''}` : 'idle'}
          </div>
        )}
        {unlocked && infectionValue > 0 && (
          <div style={{ width: 56, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginTop: 1 }}>
            <div style={{ height: '100%', width: `${infectionValue}%`, background: infectionBarColor, borderRadius: 2, transition: 'width 0.5s, background 0.5s' }} />
          </div>
        )}
        {infected && <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ef4444', letterSpacing: '0.08em' }}>INFECTED</div>}
      </div>
    </NodeWrapper>
  );
}
