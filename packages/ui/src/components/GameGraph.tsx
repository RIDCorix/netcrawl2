import ReactFlow, {
  Background,
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
  useReactFlow,
  useViewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore, GameNode, GameEdge, Worker } from '../store/gameStore';
import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useT } from '../hooks/useT';
import { Database, Shield, Lock, AlertTriangle, Pickaxe, Package, Cpu, Box, HardDrive, Globe, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Worker Dots Row (with enter/leave animations) ───────────────────────────

function WorkerDotsRow({ nodeId, show }: { nodeId: string; show: boolean }) {
  const selectWorker = useGameStore(s => s.selectWorker);
  const selectedWorkerId = useGameStore(s => s.selectedWorkerId);
  // Subscribe to workers directly; only this component re-renders per tick,
  // not the owning NodeWrapper/custom-node tree.
  const allWorkers = useGameStore(s => s.workers);
  const workers = allWorkers.filter((w: any) => {
    const at = w.current_node || w.node_id;
    if (at !== nodeId) return false;
    // While moving, the worker is animated as a traffic dot on the edge.
    // Hide it from the target node until the move animation finishes
    // (status transitions back to running/idle/harvesting).
    if (w.status === 'moving') return false;
    return true;
  });

  if (!show) return null;

  const visibleWorkers = workers.filter((w: any) => !w.leaving);

  // NOTE: do NOT early-return when visibleWorkers is empty — we need
  // AnimatePresence to stay mounted so exit animations can play when the
  // last worker leaves the node.
  return (
    <div style={{
      position: 'absolute', top: -14, left: '50%',
      transform: 'translateX(-50%)', display: 'flex', gap: 4,
      pointerEvents: visibleWorkers.length === 0 ? 'none' : undefined,
    }}>
      <AnimatePresence initial={false}>
      {visibleWorkers.map((w: any, wi: number) => {
        const c = CLASS_COLORS[w.class_name] || '#a78bfa';
        const isActive = ['running', 'harvesting', 'idle', 'moving'].includes(w.status);
        const isSelected = w.id === selectedWorkerId;
        const hasHolding = Array.isArray(w.holding) ? w.holding.length > 0 : !!w.holding;
        const showAction = w.status === 'harvesting' || hasHolding;
        // Show bubble if lastLog exists and is recent (< 2 seconds)
        // Error bubble: always show if status is error/crashed. Info bubble: 2s fade.
        const isError = w.status === 'error' || w.status === 'crashed';
        const showInfoBubble = w.lastLog && true && !isError && (Date.now() - (w.lastLog.ts || 0) < 2000);
        const showErrorBubble = isError && w.lastLog && true;

        return (
          <motion.div
            key={w.id}
            layout
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
            title={`${w.class_name} (${w.status})\nid: ${w.id}\n@ ${w.current_node}`}
            onClick={(e) => { e.stopPropagation(); selectWorker(w.id); }}
            style={{
              position: 'relative',
              width: isSelected ? 12 : 8,
              height: isSelected ? 12 : 8,
              borderRadius: '50%',
              background: isError ? '#ef4444' : c,
              border: isSelected ? '2px solid #fff' : '1.5px solid rgba(0,0,0,0.5)',
              boxShadow: isSelected
                ? `0 0 8px ${c}, 0 0 16px ${c}`
                : isError
                  ? '0 0 6px #ef4444, 0 0 14px #ef444480'
                  : isActive ? `0 0 6px ${c}, 0 0 12px ${c}40` : `0 0 4px ${c}60`,
              cursor: 'pointer',
              animation: isError ? 'error-shake 3s ease-in-out infinite' : undefined,
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
            {/* Error speech bubble — persistent, with float + shake animations */}
            {showErrorBubble && (() => {
              const lc = '#ef4444';
              const msg = (w.lastLog.message || '').replace(/^\[(INFO|WARN|ERROR)\]\s*/i, '');
              const vLen = 28 + (workers.length - 1 - wi) * 13;
              const totalH = vLen + 12;
              return (
                <div style={{
                  position: 'absolute', left: 2, bottom: 6,
                  pointerEvents: 'none', whiteSpace: 'nowrap',
                  animation: 'error-float 2.5s ease-in-out infinite',
                  width: 0, height: 0, zIndex: 100,
                }}>
                  <svg width={140} height={totalH} style={{ position: 'absolute', left: 0, bottom: 0, overflow: 'visible' }}>
                    <line x1="1" y1={totalH} x2="1" y2={12} stroke={lc} strokeWidth="0.7" opacity="0.5" />
                    <line x1="1" y1={12} x2="14" y2={1} stroke={lc} strokeWidth="0.7" opacity="0.5" />
                    <line x1="14" y1={1} x2="24" y2={1} stroke={lc} strokeWidth="0.7" opacity="0.3" />
                  </svg>
                  <span style={{
                    position: 'absolute', left: 14, bottom: totalH + 1,
                    fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: lc, lineHeight: 1,
                    borderBottom: `0.7px solid ${lc}60`,
                    padding: '0 2px 2px',
                    maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                    textShadow: '0 0 6px rgba(239,68,68,0.4)',
                  }}>
                    ⚠ {msg}
                  </span>
                </div>
              );
            })()}
            {/* Info speech bubble — 2s fade as before */}
            {showInfoBubble && (() => {
              const lc = w.lastLog.level === 'error' ? '#ef4444' : w.lastLog.level === 'warn' ? '#f59e0b' : c;
              const msg = (w.lastLog.message || '').replace(/^\[(INFO|WARN|ERROR)\]\s*/i, '');
              // Right-most workers get shorter lines (lower height)
              const vLen = 28 + (workers.length - 1 - wi) * 13;
              const totalH = vLen + 12;
              return (
                <div key={`b-${w.lastLog.ts}`} style={{
                  position: 'absolute', left: 2, bottom: 6,
                  pointerEvents: 'none', whiteSpace: 'nowrap',
                  animation: 'bubble-fade 2s ease-out forwards',
                  width: 0, height: 0,
                }}>
                  <svg width={140} height={totalH} style={{ position: 'absolute', left: 0, bottom: 0, overflow: 'visible' }}>
                    {/* Vertical from dot upward */}
                    <line x1="1" y1={totalH} x2="1" y2={12} stroke={lc} strokeWidth="0.7" opacity="0.4" />
                    {/* Diagonal kick right */}
                    <line x1="1" y1={12} x2="14" y2={1} stroke={lc} strokeWidth="0.7" opacity="0.4" />
                    {/* Short horizontal connector to text */}
                    <line x1="14" y1={1} x2="24" y2={1} stroke={lc} strokeWidth="0.7" opacity="0.25" />
                  </svg>
                  {/* Text — sits above the horizontal line, underline trims to text width */}
                  <span style={{
                    position: 'absolute', left: 14, bottom: totalH + 1,
                    fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    color: lc, lineHeight: 1,
                    borderBottom: `0.7px solid ${lc}40`,
                    padding: '0 1px 2px',
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {msg}
                  </span>
                </div>
              );
            })()}
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}

// ── Custom Node Components ──────────────────────────────────────────────────

const HANDLE_STYLE_HIDDEN = { opacity: 0 } as const;
const HANDLE_STYLE_CENTER = { opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as const;

function NodeWrapper({ children, selected, glowColor, style = {}, nodeId, showWorkerDots, edgeStyle: currentEdgeStyle, fadeIn, routeIndices }: {
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
      {/* Route sequence badges */}
      {isOnRoute && (
        <div style={{
          position: 'absolute', top: -10, right: -10, zIndex: 10,
          display: 'flex', gap: 2,
        }}>
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

function HubNode({ id, data, selected }: any) {
  const deposits = useGameStore(s => s.hubDeposits);
  const removeHubDeposit = useGameStore(s => s.removeHubDeposit);

  // Determine frame flash color based on the most recent deposit.
  // If any recent deposit has bad data, flash red; else flash yellow.
  const recent = deposits[deposits.length - 1];
  const flashKind: 'good' | 'bad' | null = recent
    ? (recent.badCount > 0 ? 'bad' : 'good')
    : null;

  const flashKey = recent ? recent.id : 'idle';
  const flashColor = flashKind === 'bad' ? '#ef4444' : flashKind === 'good' ? '#facc15' : null;

  return (
    <NodeWrapper selected={selected} glowColor="var(--accent)" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      animation: 'hub-pulse 3s ease-in-out infinite',
      padding: '14px 20px',
      borderRadius: 'var(--radius-lg)',
    }}>
      {/* Deposit flash frame — fades in/out over the most recent deposit */}
      {flashColor && (
        <motion.div
          key={flashKey}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1.08, 1.14] }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: -4,
            borderRadius: 'var(--radius-lg)',
            border: `2px solid ${flashColor}`,
            boxShadow: `0 0 18px ${flashColor}, 0 0 36px ${flashColor}80`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Floating deposit indicators — one per deposit event, stacked */}
      <AnimatePresence>
        {deposits.map((d, i) => (
          <HubDepositBadge
            key={d.id}
            deposit={d}
            offset={i}
            onDone={() => removeHubDeposit(d.id)}
          />
        ))}
      </AnimatePresence>

      {/* Hub uses full layout, not icon-only */}
      <div data-tutorial="hub-node" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Shield size={20} color="var(--accent)" />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{data.label}</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CENTRAL HUB</div>
      </div>
    </NodeWrapper>
  );
}

function HubDepositBadge({ deposit, offset, onDone }: {
  deposit: { id: number; goodCount: number; badCount: number };
  offset: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposit.id]);

  const isBad = deposit.badCount > 0;
  const count = isBad ? deposit.badCount : deposit.goodCount;
  const color = isBad ? '#ef4444' : '#facc15';
  const Icon = isBad ? AlertTriangle : Database;

  // Stagger subsequent badges slightly to the side so they don't overlap.
  const xBase = isBad ? 14 : -14;
  const xOffset = xBase + offset * (isBad ? 12 : -12);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, x: xOffset, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 0], y: -46, x: xOffset, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeOut', times: [0, 0.15, 0.7, 1] }}
      style={{
        position: 'absolute',
        top: -4, left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '3px 7px',
        borderRadius: 999,
        background: `${color}20`,
        border: `1px solid ${color}`,
        boxShadow: `0 0 10px ${color}aa`,
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: 10, fontWeight: 800,
        whiteSpace: 'nowrap',
        zIndex: 20,
      }}
    >
      <Icon size={11} />
      <span>+{count}</span>
    </motion.div>
  );
}

function ResourceNode({ id, data, selected }: any) {
  const Icon = Database;
  const color = 'var(--data-color)';
  const floorItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.drops) ? data.drops : []);
  const dropsCount = floorItems.reduce((s: number, d: any) => s + (d.count ?? d.amount ?? 1), 0);
  const isDepleted = !!data.depleted;

  return (
    <NodeWrapper
      selected={selected}
      glowColor={data.unlocked && !isDepleted ? color : undefined}
      nodeId={id}
      showWorkerDots={data.showWorkerDots}
      edgeStyle={data.edgeStyle}
      fadeIn={data.fadeIn} routeIndices={data.routeIndices}
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


function InfectedNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor="var(--danger)" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      animation: 'infected-pulse 1.5s ease-in-out infinite',
      borderColor: 'var(--danger)',
    }}>
      <NodeLabel label={data.label} icon={AlertTriangle} iconColor="var(--danger)" subtitle="INFECTED" />
    </NodeWrapper>
  );
}

function LockedNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
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

function ComputeNode({ id, data, selected }: any) {
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
      {/* Rotating aura ring behind the icon */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -14,
          borderRadius: 18,
          border: `1px dashed ${color}55`,
          pointerEvents: 'none',
          animation: 'boss-rotate 14s linear infinite',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -22,
          borderRadius: 22,
          border: `1px dotted ${color}33`,
          pointerEvents: 'none',
          animation: 'boss-rotate 22s linear infinite reverse',
        }}
      />

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <div style={{
          width: 38, height: 38,
          borderRadius: 10,
          background: `radial-gradient(circle at 50% 50%, ${color}33, ${color}0a 60%, transparent 100%)`,
          border: `1px solid ${color}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'boss-icon-pulse 2.2s ease-in-out infinite',
          color,
        }}>
          <Cpu size={22} color={color} strokeWidth={2.25} />
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
          color: data.unlocked ? color : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
        }}>
          {data.unlocked ? (data.difficulty || 'PUZZLE') : 'LOCKED'}
        </div>
      </div>

      {/* Label to the right (matches other nodes) */}
      <div style={{
        position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
        marginLeft: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {data.label}
        </div>
        <div style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}>
          BOSS · {(data.difficulty || 'PUZZLE').toUpperCase()}
        </div>
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

function AuthNodeComponent({ id, data, selected }: any) {
  const label = data.data?.label || 'Auth';
  const unlocked = data.data?.unlocked || false;

  return (
    <NodeWrapper selected={selected} glowColor="#a78bfa" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: unlocked ? 1 : 0.5 }}>
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

function APINodeComponent({ id, data, selected }: any) {
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
    <NodeWrapper selected={selected} glowColor={slaColor} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: unlocked ? 1 : 0.5 }}>
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

function EmptyNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
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

function CacheNode({ id, data, selected }: any) {
  return (
    <NodeWrapper selected={selected} glowColor={data.unlocked ? '#a78bfa' : undefined} nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{ opacity: data.unlocked ? 1 : 0.5 }}>
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
  relay: EmptyNode,
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

const EDGE_TYPES: EdgeTypes = {
  worker: WorkerEdge,
};

import { CLASS_COLORS } from '../constants/colors';

// ── Conversion helpers ──────────────────────────────────────────────────

function toRFNodes(gameNodes: GameNode[], selectedId: string | null, showWorkerDots: boolean, edgeStyle: string, fadeInIds: Set<string>, tn: (label: string) => string, routePath: string[] = []): Node[] {
  // Workers are intentionally NOT included here — WorkerDotsRow subscribes to
  // the store directly by nodeId. This keeps the React Flow node list stable
  // across polling ticks so nodes don't re-render on every worker update.
  return gameNodes.map(n => {
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        ...n.data, label: tn(n.data.label), selected: n.id === selectedId, showWorkerDots, edgeStyle, fadeIn: fadeInIds.has(n.id),
        routeIndices: routePath.reduce<number[]>((acc, id, i) => { if (id === n.id) acc.push(i); return acc; }, []),
      },
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

function toRFEdges(gameEdges: GameEdge[], edgeSelectMode: boolean, gameNodes: GameNode[], edgeStyle: string, routePath: string[] = []): Edge[] {
  const isUnlocked = (nodeId: string) => {
    const n = gameNodes.find(n => n.id === nodeId);
    return n?.id === 'hub' || !!n?.data?.unlocked;
  };

  // Build set of edges that are part of the route path
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

// ── Off-screen Error Indicators ─────────────────────────────────────────

/** Must be rendered inside <ReactFlow> so useReactFlow() works. */
function ErrorOffscreenIndicators({ gameNodes }: { gameNodes: GameNode[] }) {
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Subscribe here locally so the parent GameGraph doesn't re-render every tick.
  const workers = useGameStore(s => s.workers);

  // Compute indicators on every render (viewport changes frequently)
  const errorWorkers = workers.filter(w => w.status === 'error' || w.status === 'crashed');

  const indicators = useMemo(() => {
    if (errorWorkers.length === 0) return [];
    // Get the wrapper size from the ref, or fallback to window
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
            position: 'absolute',
            left: ind.x,
            top: ind.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            animation: 'error-indicator-pulse 2s ease-in-out infinite',
          }}
          title={`Error: ${ind.label} — click to jump`}
        >
          <svg width={20} height={20} style={{ transform: `rotate(${ind.angle}deg)`, filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.6))' }}>
            <polygon points="18,10 2,3 2,17" fill="#ef4444" />
          </svg>
          <span style={{
            fontSize: 8,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: '#ef4444',
            background: 'rgba(0,0,0,0.75)',
            padding: '2px 5px',
            borderRadius: 3,
            border: '1px solid #ef444460',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textShadow: '0 0 4px rgba(239,68,68,0.5)',
          }}>
            ⚠ {ind.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Graph ──────────────────────────────────────────────────────────

export function GameGraph() {
  const { nodes: gameNodes, edges: gameEdges, selectedNodeId, selectNode, edgeSelectMode, nodeSelectMode, routePath, settings } = useGameStore();
  const t = useT();
  const tn = useCallback((label: string) => { const k = `n.${label}`; const v = t(k); return v === k ? label : v; }, [t]);
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

    return toRFNodes(gameNodes, selectedNodeId, showWorkerDots, edgeStyle, fadeInIdsRef.current, tn, routePath);
  }, [gameNodes, selectedNodeId, showWorkerDots, edgeStyle, tn, routePath]);

  const rfEdges = useMemo(
    () => toRFEdges(gameEdges, isEdgeSelecting, gameNodes, edgeStyle, routePath),
    [gameEdges, isEdgeSelecting, gameNodes, edgeStyle, routePath]
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
    if (isEdgeSelecting) return;
    if (nodeSelectMode) {
      // Route building: only allow unlocked nodes
      const gn = gameNodes.find(n => n.id === node.id);
      if (gn?.id === 'hub' || gn?.data?.unlocked) {
        nodeSelectMode.onSelect(node.id);
      }
      return;
    }
    selectNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, selectNode, isEdgeSelecting, nodeSelectMode, gameNodes]);

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
        <ErrorOffscreenIndicators gameNodes={gameNodes} />
      </ReactFlow>
    </div>
  );
}
