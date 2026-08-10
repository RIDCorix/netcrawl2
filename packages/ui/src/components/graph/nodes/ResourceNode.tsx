import React from 'react';
import { useViewport } from 'reactflow';
import { Database } from 'lucide-react';
import { NodeWrapper } from '../NodeWrapper';
import { NodeLabel } from '../NodeLabel';
import { DropsIndicator, DepletedOverlay, ResourceDataIndicator } from '../DropsIndicator';

export function ResourceNode({ id, data, selected }: any) {
  const { zoom } = useViewport();
  const color = 'var(--data-color)';
  const floorItems = Array.isArray(data.items) ? data.items : Array.isArray(data.drops) ? data.drops : [];
  const isDepleted = !!data.depleted;

  return (
    <NodeWrapper
      selected={selected}
      glowColor={data.unlocked && !isDepleted ? color : undefined}
      nodeId={id}
      showWorkerDots={data.showWorkerDots}
      edgeStyle={data.edgeStyle}
      fadeIn={data.fadeIn}
      routeIndices={data.routeIndices}
      unlockable={data.unlockable}
      style={{
        opacity: data.unlocked ? (isDepleted ? 0.7 : 1) : 0.5,
        filter: isDepleted ? 'grayscale(60%)' : undefined,
      }}
    >
      {isDepleted && <DepletedOverlay depletedUntil={data.depletedUntil} />}
      <ResourceDataIndicator data={data.data} maxDataBuffer={data.maxDataBuffer} visible={zoom >= 0.5} />
      <DropsIndicator items={floorItems} maxBuffer={data.maxBuffer} />
      <NodeLabel
        label={data.label}
        icon={Database}
        iconColor={data.unlocked ? (isDepleted ? 'var(--text-muted)' : color) : 'var(--text-muted)'}
        subtitle={isDepleted ? 'DEPLETED' : data.unlocked ? `+${data.rate}/harvest` : 'LOCKED'}
      />
    </NodeWrapper>
  );
}
