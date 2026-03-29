import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
  EdgeProps,
  BaseEdge,
  getSmoothStepPath,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge, Worker } from '../store/gameStore';
import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { Database, Shield, Lock, AlertTriangle, Pickaxe, Package, Cpu, Box, HardDrive, Globe, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

// ── Worker Dots Row (with enter/leave animations) ───────────────────────────

function WorkerDotsRow({ workers, show }: { workers: any[]; show: boolean }) {
  const { selectWorker, selectedWorkerId } = useGameStore();
  const prevIdsRef = React.useRef<Set<string>>(new Set());
  const [enteringIds, setEnteringIds] = React.useState<Set<string>>(new Set());

  // Detect newly arrived workers — set entering, then clear after 1 frame so CSS transition fires
  React.useEffect(() => {
    if (!workers) return;
    const currentIds = new Set(workers.filter(w => !w.leaving).map(w => w.id));
    const newArrivals = new Set<string>();
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) newArrivals.add(id);
    }
    prevIdsRef.current = currentIds;

    if (newArrivals.size > 0) {
      // Set entering immediately (renders opacity:0, scale:0.3)
      setEnteringIds(newArrivals);
      // Clear after 1 rAF so transition from 0→1 fires
      const raf = requestAnimationFrame(() => {
        setEnteringIds(new Set());
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [workers?.map(w => `${w.id}-${w.leaving}`).join(',')]);

  if (!show || !workers || workers.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', top: -14, left: '50%',
      transform: 'translateX(-50%)', display: 'flex', gap: 4,
    }}>
      {workers.map((w: any) => {
        const c = CLASS_COLORS[w.class_name] || '#a78bfa';
        const isActive = ['running', 'harvesting', 'idle'].includes(w.status);
        const isSelected = w.id === selectedWorkerId;
        const isLeaving = w.leaving;
        const isEntering = enteringIds.has(w.id);
        const showAction = !isLeaving && !isEntering && (w.status === 'harvesting' || w.holding);

        return (
          <div
            key={w.id}
            title={`${w.class_name} (${w.status})\nid: ${w.id}\n@ ${w.current_node}`}
            onClick={(e) => { if (!isLeaving) { e.stopPropagation(); selectWorker(w.id); } }}
            style={{
              position: 'relative',
              width: isSelected ? 12 : 8,
              height: isSelected ? 12 : 8,
              borderRadius: '50%',
              background: c,
              border: isSelected ? '2px solid #fff' : '1.5px solid rgba(0,0,0,0.5)',
              boxShadow: isSelected
                ? `0 0 8px ${c}, 0 0 16px ${c}`
                : isActive ? `0 0 6px ${c}, 0 0 12px ${c}40` : `0 0 4px ${c}60`,
              cursor: isLeaving ? 'default' : 'pointer',
              // Entering: start small + transparent, grow in
              // Leaving: shrink + fade out toward center
              opacity: isLeaving ? 0 : isEntering ? 0 : 1,
              transform: isLeaving
                ? 'scale(0.3) translateY(12px)'
                : isEntering
                  ? 'scale(0.3) translateY(-8px)'
                  : 'scale(1) translateY(0)',
              transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
              pointerEvents: isLeaving ? 'none' : 'auto',
            }}
          >
            {showAction && (
              <div style={{
                position: 'absolute', top: -16, left: '50%',
                transform: 'translateX(-50%)', pointerEvents: 'none',
                animation: 'worker-action-bounce 0.6s ease-in-out infinite', color: c,
              }}>
                {w.status === 'harvesting' ? <Pickaxe size={10} /> : <Package size={10} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Custom Node Components ──────────────────────────────────────────────────

const HANDLE_STYLE_HIDDEN = { opacity: 0 } as const;
const HANDLE_STYLE_CENTER = { opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as const;

function NodeWrapper({ children, selected, glowColor, style = {}, workers: nodeWorkers, showWorkerDots, edgeStyle: currentEdgeStyle, fadeIn }: {
  children: React.ReactNode;
  selected?: boolean;
  glowColor?: string;
  style?: React.CSSProperties;
  workers?: any[];
  showWorkerDots?: boolean;
  edgeStyle?: string;
  fadeIn?: boolean;
}) {
  const borderColor = selected ? 'var(--accent)' : glowColor || 'var(--border-bright)';

  return (
    <div style={{
      position: 'relative',
      padding: '6px',
      borderRadius: '10px',
      background: 'var(--bg-glass-heavy)',
      border: `1px solid ${borderColor}`,
      boxShadow: selected
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
      <WorkerDotsRow workers={nodeWorkers || []} show={!!showWorkerDots} />
    </div>
  );
}

function NodeLabel({ label, subtitle, icon: Icon, iconColor, iconBg }: {
  label: string;
  subtitle?: string;
  icon: any;
  iconColor: string;
  iconBg?: string;
}) {
  return (
    <>
      <Icon size={16} color={iconColor} />
      {/* Label outside the node box, positioned to the right */}
      <div style={{
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        marginLeft: 8,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {subtitle}
          </div>
        )}
      </div>
    </>
  );
}

/** Shows a badge for drops sitting on the node */
function DropsIndicator({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      style={{
        position: 'absolute',
        top: -8,
        right: -8,
        background: '#facc15',
        color: '#000',
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        borderRadius: '999px',
        width: '18px',
        height: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      {count}
    </motion.div>
  );
}

/** Shows depletion countdown */
function DepletedOverlay({ depletedUntil }: { depletedUntil?: number }) {
  const remaining = depletedUntil ? Math.max(0, Math.ceil((depletedUntil - Date.now()) / 1000)) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}
    >
      <span style={{ color: 'var(--danger)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {remaining > 0 ? `${remaining}s` : 'depleted'}
      </span>
    </div>
  );
}

function HubNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--accent)" workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{
      animation: 'hub-pulse 3s ease-in-out infinite',
      padding: '14px 20px',
      borderRadius: 'var(--radius-lg)',
    }}>
      {/* Hub uses full layout, not icon-only */}
      <div data-tutorial="hub-node" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Shield size={20} color="var(--accent)" />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{data.label}</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CENTRAL HUB</div>
      </div>
    </NodeWrapper>
  );
}

function ResourceNode({ data, selected }: any) {
  const Icon = Database;
  const color = 'var(--data-color)';
  const dropsCount = Array.isArray(data.drops) ? data.drops.length : 0;
  const isDepleted = !!data.depleted;

  return (
    <NodeWrapper
      selected={selected}
      glowColor={data.unlocked && !isDepleted ? color : undefined}
      workers={data.workers}
      showWorkerDots={data.showWorkerDots}
      edgeStyle={data.edgeStyle}
      fadeIn={data.fadeIn}
      style={{
        opacity: data.unlocked ? (isDepleted ? 0.7 : 1) : 0.5,
        filter: isDepleted ? 'grayscale(60%)' : undefined,
      }}
    >
      {isDepleted && <DepletedOverlay depletedUntil={data.depletedUntil} />}
      <DropsIndicator count={dropsCount} />
      <NodeLabel
        label={data.label}
        icon={Icon}
        iconColor={data.unlocked ? (isDepleted ? 'var(--text-muted)' : color) : 'var(--text-muted)'}
        subtitle={
          isDepleted
            ? 'DEPLETED'
            : data.unlocked
            ? `+${data.rate}/harvest`
            : 'LOCKED'
        }
      />
    </NodeWrapper>
  );
}


function InfectedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--danger)" workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{
      animation: 'infected-pulse 1.5s ease-in-out infinite',
      borderColor: 'var(--danger)',
    }}>
      <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="INFECTED" />
    </NodeWrapper>
  );
}

function LockedNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{
      opacity: 0.4,
      border: '1px dashed var(--border-bright)',
    }}>
      <NodeLabel label={data.label} icon={Lock} iconColor="var(--text-muted)" subtitle="UNKNOWN" />
    </NodeWrapper>
  );
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#60a5fa',
  hard: '#f59e0b',
};

function ComputeNode({ data, selected }: any) {
  const color = DIFFICULTY_COLORS[data.difficulty] || '#a78bfa';
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? color : undefined} workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
      <NodeLabel
        label={data.label}
        icon={Cpu}
        iconColor={data.unlocked ? color : 'var(--text-muted)'}
        subtitle={data.unlocked ? (data.difficulty || 'PUZZLE').toUpperCase() : 'LOCKED'}
      />
      {data.unlocked && data.solveCount > 0 && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          background: color, color: '#000',
          fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
          borderRadius: '999px', width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {data.solveCount}
        </div>
      )}
    </NodeWrapper>
  );
}

function AuthNodeComponent({ data, selected }: any) {
  const label = data.data?.label || 'Auth';
  const unlocked = data.data?.unlocked || false;

  return (
    <NodeWrapper selected={selected} glowColor="#a78bfa" workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{ opacity: unlocked ? 1 : 0.5 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{
          width: 24, height: 24,
          background: 'rgba(167,139,250,0.2)',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={14} style={{ color: '#a78bfa' }} />
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700,
          color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: '#a78bfa', letterSpacing: '0.05em' }}>
          {unlocked ? 'READY' : 'LOCKED'}
        </div>
      </div>
    </NodeWrapper>
  );
}

function APINodeComponent({ data, selected }: any) {
  const infectionValue = data.data?.infectionValue || 0;
  const pendingReqs = data.data?.pendingRequests || 0;
  const infected = data.data?.infected || false;
  const label = data.data?.label || 'API';
  const unlocked = data.data?.unlocked || false;

  const slaStatus = infected ? 'infected'
    : infectionValue >= 60 ? 'danger'
    : infectionValue >= 30 ? 'warning'
    : 'normal';

  const slaColor = {
    normal: '#f59e0b',
    warning: '#f97316',
    danger: '#ef4444',
    infected: '#7f1d1d',
  }[slaStatus];

  const infectionBarColor = infectionValue >= 60 ? '#ef4444'
    : infectionValue >= 30 ? '#f97316'
    : '#4ade80';

  return (
    <NodeWrapper selected={selected} glowColor={slaColor} workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{ opacity: unlocked ? 1 : 0.5 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {/* Icon */}
        <div style={{
          width: 24, height: 24,
          background: infected ? 'rgba(239,68,68,0.2)' : `${slaColor}20`,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {infected
            ? <span style={{ fontSize: 14 }}>⚠️</span>
            : <Globe size={14} style={{ color: slaColor }} />}
        </div>

        {/* Label */}
        <div style={{
          fontSize: 9, fontWeight: 700,
          color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
          maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </div>

        {/* Request queue badge */}
        {unlocked && !infected && (
          <div style={{
            fontSize: 8, fontFamily: 'var(--font-mono)',
            color: pendingReqs > 3 ? '#ef4444' : pendingReqs > 0 ? '#f59e0b' : 'var(--text-muted)',
            letterSpacing: '0.05em',
          }}>
            {pendingReqs > 0 ? `${pendingReqs} req${pendingReqs > 1 ? 's' : ''}` : 'idle'}
          </div>
        )}

        {/* Infection bar */}
        {unlocked && infectionValue > 0 && (
          <div style={{ width: 56, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginTop: 1 }}>
            <div style={{
              height: '100%',
              width: `${infectionValue}%`,
              background: infectionBarColor,
              borderRadius: 2,
              transition: 'width 0.5s, background 0.5s',
            }} />
          </div>
        )}

        {/* Infected badge */}
        {infected && (
          <div style={{
            fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 800,
            color: '#ef4444', letterSpacing: '0.08em',
          }}>
            INFECTED
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

function EmptyNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{
      opacity: data.unlocked ? 0.8 : 0.4,
      border: '1px dashed var(--border-bright)',
    }}>
      <NodeLabel
        label={data.label}
        icon={Box}
        iconColor={data.unlocked ? 'var(--accent-secondary)' : 'var(--text-muted)'}
        subtitle={data.unlocked ? 'BUILDABLE' : 'LOCKED'}
      />
    </NodeWrapper>
  );
}

function CacheNode({ data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? '#a78bfa' : undefined} workers={data.workers} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
      <NodeLabel
        label={data.label}
        icon={HardDrive}
        iconColor={data.unlocked ? '#a78bfa' : 'var(--text-muted)'}
        subtitle={data.unlocked ? `LV.${data.upgradeLevel || 1} \u00b7 RANGE ${data.cacheRange || 1}` : 'LOCKED'}
      />
    </NodeWrapper>
  );
}

const NODE_TYPES: NodeTypes = {
  hub: HubNode,
  resource: ResourceNode,
  infected: InfectedNode,
  locked: LockedNode,
  compute: ComputeNode,
  empty: EmptyNode,
  cache: CacheNode,
  api: APINodeComponent,
  auth: AuthNodeComponent,
};

// ── Traffic dot driven by rAF (no SVG animateMotion) ────────────────────
// A single rAF loop per edge drives all dots via direct DOM setAttribute.

function TrafficDot({ color, reverse, pathData }: { color: string; reverse: boolean; pathData: string }) {
  const circleRef = React.useRef<SVGCircleElement>(null);
  const pathElRef = React.useRef<SVGPathElement | null>(null);
  const colorRef = React.useRef(color);
  const reverseRef = React.useRef(reverse);
  const pathDataRef = React.useRef(pathData);
  colorRef.current = color;
  reverseRef.current = reverse;

  // Rebuild measurement path when pathData changes
  React.useEffect(() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', pathData);
    pathElRef.current = el;
    pathDataRef.current = pathData;
  }, [pathData]);

  // Single rAF loop for the lifetime of this component
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
        t = 1; // pause
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
  }, []); // empty deps — never restarts, reads refs for latest values

  return <circle ref={circleRef} r={4} fill={color} stroke="#000" strokeWidth={1} />;
}

const MemoTrafficDot = React.memo(TrafficDot);

function WorkerEdge(props: EdgeProps) {
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

  // Sample traffic once per second
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
          stroke: hasTraffic ? 'rgba(255,255,255,0.2)' : (style?.stroke || 'var(--border-bright)'),
          strokeWidth: hasTraffic ? 2.5 : (style?.strokeWidth || 1.5),
        }}
        id={id}
      />
      {hasTraffic && dots.map((dot, i) => (
        <MemoTrafficDot key={`${i}-${dot.color}-${dot.reverse}`} color={dot.color} reverse={dot.reverse} pathData={edgePath} />
      ))}
    </>
  );
}

const EDGE_TYPES: EdgeTypes = {
  worker: WorkerEdge,
};

import { CLASS_COLORS } from '../constants/colors';

// ── Conversion helpers ──────────────────────────────────────────────────

function toRFNodes(gameNodes: GameNode[], selectedId: string | null, workers: Worker[], showWorkerDots: boolean, edgeStyle: string, fadeInIds: Set<string>): Node[] {
  // Pre-build worker lookup by node id to avoid O(nodes × workers) filtering
  const workersByNode = new Map<string, any[]>();
  for (const w of workers) {
    const nodeId = w.status === 'moving' && w.previous_node ? w.previous_node : (w.current_node || w.node_id);
    if (!workersByNode.has(nodeId)) workersByNode.set(nodeId, []);
    workersByNode.get(nodeId)!.push({
      ...w,
      leaving: w.status === 'moving' && w.previous_node === nodeId,
    });
    // Also add to destination node if moving
    if (w.status === 'moving' && w.previous_node && w.current_node !== w.previous_node) {
      const destId = w.current_node || w.node_id;
      if (!workersByNode.has(destId)) workersByNode.set(destId, []);
      workersByNode.get(destId)!.push({ ...w, leaving: false });
    }
  }

  return gameNodes.map(n => {
    const nodeWorkers = workersByNode.get(n.id) || [];
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data, selected: n.id === selectedId, workers: nodeWorkers, showWorkerDots, edgeStyle, fadeIn: fadeInIds.has(n.id) },
      selected: n.id === selectedId,
    };
  });
}

/** Determine which handles to use based on edge style + relative node positions */
function getEdgeHandles(sourceId: string, targetId: string, gameNodes: GameNode[], edgeStyle: string): { sourceHandle?: string; targetHandle?: string } {
  // Straight mode: use center handles so lines go through middle of node
  if (edgeStyle === 'straight') {
    return { sourceHandle: 'center', targetHandle: 'center' };
  }

  const s = gameNodes.find(n => n.id === sourceId);
  const t = gameNodes.find(n => n.id === targetId);
  if (!s || !t) return {};

  const dx = t.position.x - s.position.x;
  const dy = t.position.y - s.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  } else {
    return dy > 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' };
  }
}

function toRFEdges(gameEdges: GameEdge[], edgeSelectMode: boolean, gameNodes: GameNode[], edgeStyle: string): Edge[] {
  const isUnlocked = (nodeId: string) => {
    const n = gameNodes.find(n => n.id === nodeId);
    return n?.id === 'hub' || !!n?.data?.unlocked;
  };

  return gameEdges.map(e => {
    const bothUnlocked = isUnlocked(e.source) && isUnlocked(e.target);
    const selectable = edgeSelectMode && bothUnlocked;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      style: {
        stroke: selectable ? 'var(--accent)' : edgeSelectMode && !bothUnlocked ? 'rgba(255,255,255,0.05)' : 'var(--border-bright)',
        strokeWidth: selectable ? 3 : 1.5,
        cursor: selectable ? 'pointer' : 'default',
        opacity: edgeSelectMode && !bothUnlocked ? 0.3 : 1,
      },
      animated: selectable,
      type: 'worker',
      ...getEdgeHandles(e.source, e.target, gameNodes, edgeStyle),
      className: selectable ? 'edge-selectable' : '',
    };
  });
}

// ── Main Graph ──────────────────────────────────────────────────────────

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode, workers, edgeSelectMode, settings } = useGameStore();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const isEdgeSelecting = !!edgeSelectMode;
  const edgeStyle = settings.edgeStyle;
  const showWorkerDots = settings.showWorkerDots;

  // Track known node IDs to detect newly appeared nodes for fade-in
  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  const fadeInIdsRef = useRef<Set<string>>(new Set());

  const rfNodes = useMemo(() => {
    const currentIds = new Set(gameNodes.map(n => n.id));
    const newIds = new Set<string>();
    // On first load (knownNodeIdsRef empty), don't fade — just register all as known
    if (knownNodeIdsRef.current.size > 0) {
      for (const id of currentIds) {
        if (!knownNodeIdsRef.current.has(id)) newIds.add(id);
      }
    }
    knownNodeIdsRef.current = currentIds;
    // Merge new fade-in IDs (will be cleared after animation completes)
    for (const id of newIds) fadeInIdsRef.current.add(id);

    return toRFNodes(gameNodes, selectedNodeId, workers, showWorkerDots, edgeStyle, fadeInIdsRef.current);
  }, [gameNodes, selectedNodeId, workers, showWorkerDots, edgeStyle]);

  const rfEdges = useMemo(
    () => toRFEdges(gameEdges, isEdgeSelecting, gameNodes, edgeStyle),
    [gameEdges, isEdgeSelecting, gameNodes, edgeStyle]
  );

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges]);

  // Clear fade-in flags after animation duration
  useEffect(() => {
    if (fadeInIdsRef.current.size === 0) return;
    const timer = setTimeout(() => { fadeInIdsRef.current.clear(); }, 600);
    return () => clearTimeout(timer);
  }, [rfNodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    if (isEdgeSelecting) return; // Ignore node clicks during edge selection
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, selectNode, isEdgeSelecting]);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    if (edgeSelectMode) {
      // Only allow selecting edges where both nodes are unlocked
      const isUnlocked = (id: string) => {
        const n = gameNodes.find(n => n.id === id);
        return n?.id === 'hub' || !!n?.data?.unlocked;
      };
      if (isUnlocked(edge.source) && isUnlocked(edge.target)) {
        edgeSelectMode.onSelect({ id: edge.id, source: edge.source, target: edge.target });
      }
    }
  }, [edgeSelectMode, gameNodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{
          padding: 0.3,
          nodes: nodes.filter(n => n.id === 'hub' || n.data?.unlocked),
          maxZoom: 1.2,
        }}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1}
          color="rgba(0, 212, 170, 0.06)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--bg-glass-heavy)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <MiniMap
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
          }}
          nodeColor={(node) => {
            if (node.type === 'hub') return '#00d4aa';
            if (node.type === 'infected') return '#ff4757';
            if (node.type === 'resource') return '#45aaf2';
if (node.type === 'cache') return '#a78bfa';
            if (node.type === 'api') return '#f59e0b';
            if (node.type === 'empty') return '#555';
            return '#333';
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
