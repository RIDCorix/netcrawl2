import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Cpu, Star, Lock, AlertTriangle, MousePointer, Upload, Pickaxe, Info, Shield, Box, Server, Globe, Zap, Bug, Plus, Minus } from 'lucide-react';
import { useGameStore, GameNode, Resources } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { ChipSlotManager } from './ChipSlotManager';
import { InvCell } from './ui/InvCell';
import { NODE_DIALOG_REGISTRY, NodeDialogConfig, NodeInfoDialog } from './NodeInfoDialog';
import { DeployDialog } from './DeployDialog';
import { useT } from '../hooks/useT';
import { formatResource } from '../lib/format';
import { CostBadge, ActionButton, StatusMessage, NodeEnhanceSection, toSnakeCase } from './nodeDetail/NodeDetailWidgets';

import { SectionLabel, Divider } from './ui/primitives';

const NODE_TYPE_ICONS: Record<string, any> = {
  hub: Shield,
  resource: Database,
  compute: Cpu,
  empty: Box,
  cache: Server,
  api: Globe,
  infected: Bug,
  locked: Lock,
};


export function NodeDetailPanel() {
  const { selectedNodeId, nodes, edges, resources, selectNode } = useGameStore();
  const [deployOpen, setDeployOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<NodeDialogConfig | null>(null);
  const t = useT();
  const tn = (label: string) => { const k = `n.${label}`; const v = t(k); return v === k ? label : v; };

  const node = nodes.find((n: any) => n.id === selectedNodeId);

  const gather = useAsyncAction(
    () => axios.post('/api/gather', { nodeId: node?.id }),
    { successMsg: '+10 gathered!', fallbackError: 'Gather failed' },
  );
  const unlock = useAsyncAction(
    () => axios.post('/api/unlock', { nodeId: node?.id }),
    { successMsg: 'Unlocked!', fallbackError: 'Unlock failed' },
  );
  const build = useAsyncAction(
    (structureType: string) => axios.post('/api/node/build', { nodeId: node?.id, structureType }),
    { successMsg: (d) => `Built ${d?.structureType || 'structure'} node!`, fallbackError: 'Build failed' },
  );

  // Combined message from whichever action last fired
  const msg = gather.msg || unlock.msg || build.msg;

  const canAffordUnlock = (cost: Partial<Resources>) =>
    Object.entries(cost).every(([k, v]) => (resources as any)[k] >= v);

  // A node can only be unlocked if at least one directly-adjacent node is
  // already unlocked (or the node itself is the hub). This prevents the
  // player from unlocking stranded nodes in the middle of nowhere.
  const hasUnlockedNeighbor = (targetNodeId: string): boolean => {
    const neighborIds = new Set<string>();
    for (const e of edges) {
      if (e.source === targetNodeId) neighborIds.add(e.target);
      else if (e.target === targetNodeId) neighborIds.add(e.source);
    }
    if (neighborIds.size === 0) return false;
    return nodes.some(n => neighborIds.has(n.id) && n.data?.unlocked);
  };

  const BUILD_COSTS: Record<string, Record<string, number>> = {
    cache: { data: 1500, rp: 5 },
    api: { data: 2000, rp: 8 },
  };

  const getNodeColor = (n: GameNode) => {
    if (n.type === 'infected') return 'var(--danger)';
    if (n.type === 'hub') return 'var(--accent)';
    if (n.type === 'resource') {
      return 'var(--data-color)';
    }
if (n.type === 'cache') return '#a78bfa';
    if (n.type === 'api') return '#f59e0b';
    if (n.type === 'empty') return 'var(--text-muted)';
    return 'var(--text-muted)';
  };

  const canDeploy = node && (node.id === 'hub' || node.data.unlocked) && !node.data.infected;

  return (
    <>
      <AnimatePresence>
        {selectedNodeId && node && (
          <motion.div
            key={selectedNodeId}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            style={{
              position: 'fixed',
              right: 16,
              top: 72,
              bottom: 16,
              width: 320,
              background: 'var(--bg-glass-heavy)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              zIndex: 40,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Accent bar at top */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 20,
              right: 20,
              height: 2,
              borderRadius: '0 0 2px 2px',
              background: `linear-gradient(90deg, transparent, ${getNodeColor(node)}, transparent)`,
            }} />

            {/* Header: type label + name (id) + close */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                {/* Type row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => {
                    const NodeIcon = NODE_TYPE_ICONS[node.type] || Box;
                    return <NodeIcon size={12} style={{ color: getNodeColor(node), flexShrink: 0 }} />;
                  })()}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: getNodeColor(node),
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>
                    {node.type}
                  </span>
                </div>
                {/* Name (id) row */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {(() => {
                    const NodeIcon = NODE_TYPE_ICONS[node.type] || Box;
                    return <NodeIcon size={16} style={{ color: getNodeColor(node), flexShrink: 0, position: 'relative', top: 2 }} />;
                  })()}
                  <span style={{
                    fontSize: 18, fontWeight: 800, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {tn(node.data.label)}
                  </span>
                  <span style={{
                    fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                  }}>
                    ({node.id})
                  </span>
                </div>
              </div>
              <button
                onClick={() => selectNode(null)}
                style={{
                  color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', padding: 4, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Level + XP bar */}
            {(() => {
              const nodeXp = node.data.nodeXp || 0;
              const nodeXpToNext = node.data.nodeXpToNext || 0;
              const upgradeLevel = node.data.upgradeLevel || 0;
              const hasXpSystem = nodeXpToNext > 0;
              const xpPercent = hasXpSystem ? Math.min(100, (nodeXp / nodeXpToNext) * 100) : 0;
              const xpFull = hasXpSystem && nodeXp >= nodeXpToNext;
              const isMax = !hasXpSystem;

              if (!node.data.unlocked && node.id !== 'hub') return null;
              if (isMax && upgradeLevel === 0) return null;

              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)', flexShrink: 0 }}>
                    {t('ui.lv').replace('{level}', String(upgradeLevel))}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {isMax ? t('ui.max') : xpFull ? 'READY' : ''}
                  </span>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{
                      width: `${isMax ? 100 : xpPercent}%`,
                      height: '100%',
                      background: isMax ? '#f59e0b' : 'var(--accent)',
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {hasXpSystem ? `${nodeXp}/${nodeXpToNext}` : ''}
                  </span>
                </div>
              );
            })()}

            {/* Infected warning */}
            {(node.type === 'infected' || node.data.infected) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-dim)',
                border: '1px solid rgba(255, 71, 87, 0.25)',
              }}>
                <AlertTriangle size={14} color="var(--danger)" />
                <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {t('node.type.infected')} — Deploy a Guardian to repair
                </span>
              </div>
            )}

            <Divider />

            {/* Depletion status */}
            {node.data.depleted && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-dim)',
                border: '1px solid rgba(255, 71, 87, 0.25)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                  {t('node.depleted')} — {t('node.recover.in', { s: node.data.depletedUntil ? Math.max(0, Math.ceil((node.data.depletedUntil - Date.now()) / 1000)) : '?' })}
                </span>
              </div>
            )}

            {/* Drops on node — shown as inventory grid at bottom of panel */}

            {/* Resource info */}
            {node.type === 'resource' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>{t('ui.resource')}</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Type</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}>{node.data.resource}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Rate</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>+{node.data.rate}/harvest</div>
                  </div>
                </div>
                {node.data.mineable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Pickaxe size={11} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('ui.mineable')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Compute node info */}
            {node.type === 'compute' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Compute Puzzle</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Difficulty</div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
                      color: node.data.difficulty === 'easy' ? '#4ade80' : node.data.difficulty === 'medium' ? '#60a5fa' : '#f59e0b',
                    }}>
                      {node.data.difficulty || 'easy'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Reward</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--data-color)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.rewardResource || 'data'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Solved</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.solveCount || 0}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginTop: 4 }}>
                  Send a worker here, then <span style={{ color: 'var(--accent)' }}>node = self.get_current_node()</span> to get a ComputeNode. Call <span style={{ color: 'var(--accent)' }}>node.get_task()</span> and <span style={{ color: 'var(--accent)' }}>node.submit(task_id, answer)</span>.
                </div>
                {/* Pluggable dialog buttons */}
                {NODE_DIALOG_REGISTRY[node.type] && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {Object.entries(NODE_DIALOG_REGISTRY[node.type]).map(([key, configFn]) => {
                      const cfg = configFn(node.data);
                      return (
                        <button key={key} onClick={() => setActiveDialog(cfg)} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                          color: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>
                          <Info size={10} /> {cfg.buttonLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cache node info */}
            {node.type === 'cache' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Cache Service</SectionLabel>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Range</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                      {node.data.cacheRange || 1} hop{(node.data.cacheRange || 1) > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Capacity</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                      {node.data.cacheCapacity || 10} keys
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Level</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.upgradeLevel || 1}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginTop: 4 }}>
                  <span style={{ color: 'var(--accent)' }}>cache = self.get_service("{node.id}")</span><br />
                  <span style={{ color: 'var(--accent)' }}>cache.set(key, val)</span> / <span style={{ color: 'var(--accent)' }}>cache.get(key)</span>
                </div>
              </div>
            )}

            {/* API Node spec */}
            {node.type === 'api' && node.data.unlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>API Specification</SectionLabel>

                <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Pending</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                      {node.data.pendingRequests || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Level</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {node.data.upgradeLevel || 1}
                    </div>
                  </div>
                </div>

                {/* Endpoints */}
                <div style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    POST /compute
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}
                    {'{ op: "add"|"sub"|"mul"|"max"|"mod", a, b }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}
                    {'{ result: number }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Example:</span>{' '}
                    {'{ op:"add", a:12, b:8 } → { result: 20 }'}
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    POST /echo
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}
                    {'{ value: any }'}<br />
                    <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}
                    {'{ value: any }'}
                  </div>
                </div>

                {/* Security warning */}
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 'var(--radius-sm)', padding: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    ⚠ SECURITY
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                    Some requests arrive <span style={{ color: '#ef4444', fontWeight: 700 }}>without authentication</span> (has_token=False).
                    You MUST check <span style={{ color: 'var(--accent)' }}>request.has_token</span> and drop unauthenticated requests.
                    Responding to them causes a <span style={{ color: '#ef4444' }}>SECURITY BREACH</span> and infects this node.
                  </div>
                </div>

                {/* Code example */}
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginTop: 2 }}>
                  <span style={{ color: 'var(--accent)' }}>node = self.get_current_node()</span><br />
                  <span style={{ color: 'var(--accent)' }}>req = node.poll_for_request()</span><br />
                  <span style={{ color: '#ef4444' }}>if not req.has_token: return</span><br />
                  <span style={{ color: 'var(--accent)' }}>node.respond(req.id, {'{'} result {'}'} )</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {node.data.unlocked && node.type === 'resource' && (
                <>
                  <SectionLabel>{t('ui.actions')}</SectionLabel>
                  <ActionButton onClick={gather.run} disabled={gather.loading}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <MousePointer size={12} />
                      {gather.loading ? 'GATHERING...' : `${t('node.gather')} (+10)`}
                    </span>
                  </ActionButton>
                </>
              )}

              {!node.data.unlocked && node.data.unlockCost && (() => {
                const affordable = canAffordUnlock(node.data.unlockCost);
                const reachable = hasUnlockedNeighbor(node.id);
                const label = unlock.loading
                  ? 'UNLOCKING...'
                  : !reachable
                    ? t('ui.no_adjacent_unlock')
                    : !affordable
                      ? t('ui.insufficient')
                      : t('node.unlock');
                return (
                  <>
                    <SectionLabel>Unlock Cost</SectionLabel>
                    <CostBadge cost={node.data.unlockCost} />
                    <ActionButton
                      onClick={unlock.run}
                      disabled={unlock.loading || !affordable || !reachable}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Lock size={12} />
                        {label}
                      </span>
                    </ActionButton>
                  </>
                );
              })()}

              {node.type === 'empty' && node.data.unlocked && (
                <>
                  <Divider />
                  <SectionLabel>Build Structure</SectionLabel>
                  {Object.entries(BUILD_COSTS).map(([type, cost]) => (
                    <div key={type} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 4, textTransform: 'uppercase' }}>
                        {type} Node
                      </div>
                      <CostBadge cost={cost} />
                      <ActionButton
                        onClick={() => build.run(type)}
                        disabled={build.loading || !canAffordUnlock(cost)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {build.loading ? 'BUILDING...' : canAffordUnlock(cost) ? `BUILD ${type.toUpperCase()}` : t('ui.insufficient')}
                        </span>
                      </ActionButton>
                    </div>
                  ))}
                </>
              )}

              {msg && <StatusMessage msg={msg} />}
            </div>

            {/* Upgrade + Chip section (unlocked nodes only) */}
            {(node.id === 'hub' || node.data.unlocked) && (
              <NodeEnhanceSection nodeId={node.id} node={node} />
            )}

            {/* Deploy button */}
            {canDeploy && (
              <>
                <Divider />
                <ActionButton onClick={() => setDeployOpen(true)}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Upload size={12} />
                    {t('worker.deploy')}
                  </span>
                </ActionButton>
              </>
            )}

            {/* Chip Slots — 4x2 grid at bottom */}
            {(node.id === 'hub' || node.data.unlocked) && (node.data.chipSlots || 0) > 0 && (
              <>
                <Divider />
                <ChipSlotManager nodeId={node.id} chipSlots={node.data.chipSlots || 0} installedChips={node.data.installedChips || []} />
              </>
            )}

            {/* Ground Items — inventory grid */}
            {(() => {
              const floorItems = Array.isArray(node.data.items) ? node.data.items : (Array.isArray(node.data.drops) ? node.data.drops : []);
              const maxBuffer: number | undefined = node.data.maxBuffer;
              const stacks = floorItems.length;
              if (stacks === 0 && !maxBuffer) return null;
              // Aggregate items by type (items are already stacked, but be safe)
              const itemCounts: Record<string, number> = {};
              for (const d of floorItems) {
                itemCounts[d.type] = (itemCounts[d.type] || 0) + (d.count ?? d.amount ?? 1);
              }
              const totalItems = Object.values(itemCounts).reduce((s, v) => s + v, 0);
              const ITEM_ICONS: Record<string, any> = { data_fragment: Database, rp_shard: Cpu, bad_data: AlertTriangle };
              const ITEM_COLORS: Record<string, string> = { data_fragment: '#45aaf2', rp_shard: '#a78bfa', bad_data: '#ef4444' };
              const ITEM_LABELS: Record<string, string> = { data_fragment: 'Data', rp_shard: 'RP', bad_data: 'Bad Data' };

              return (
                <>
                  <Divider />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Box size={11} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                        {t('ui.ground_items')}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {totalItems}
                      </span>
                      {maxBuffer !== undefined && maxBuffer > 0 && (
                        <div style={{
                          marginLeft: 'auto',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 9, fontWeight: 700,
                          color: stacks >= maxBuffer ? '#ef4444' : 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          <span>{t('node.buffer') || 'BUFFER'}</span>
                          <span>{stacks}/{maxBuffer}</span>
                          <div style={{
                            width: 40, height: 4, borderRadius: 2,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, (stacks / maxBuffer) * 100)}%`,
                              height: '100%',
                              background: stacks >= maxBuffer ? '#ef4444' : 'var(--accent)',
                              transition: 'width 0.2s, background 0.2s',
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                      {Object.entries(itemCounts).map(([type, count]) => (
                        <InvCell
                          key={type}
                          icon={ITEM_ICONS[type] || Box}
                          color={ITEM_COLORS[type] || 'var(--text-muted)'}
                          label={ITEM_LABELS[type] || type}
                          count={count}
                          itemType={type}
                        />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deploy dialog */}
      <AnimatePresence>
        {deployOpen && node && (
          <DeployDialog
            nodeId={node.id}
            nodeName={tn(node.data.label)}
            onClose={() => setDeployOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Node info dialog (pluggable) */}
      <AnimatePresence>
        {activeDialog && (
          <NodeInfoDialog config={activeDialog} onClose={() => setActiveDialog(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
