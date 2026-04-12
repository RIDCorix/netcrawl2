/**
 * Node-type-specific info sections for the detail panel.
 * Extracted from NodeDetailPanel to reduce its size.
 */

import { Pickaxe, Info, Box, Database, Cpu, AlertTriangle } from 'lucide-react';
import type { GameNode } from '../../store/gameStore';
import { SectionLabel } from '../ui/primitives';
import { NODE_DIALOG_REGISTRY, NodeDialogConfig } from '../NodeInfoDialog';
import { useT } from '../../hooks/useT';
import { InvCell } from '../ui/InvCell';

// ── Resource Node ───────────────────────────────────────────────────────────

export function ResourceNodeInfo({ node }: { node: GameNode }) {
  const t = useT();
  return (
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
  );
}

// ── Compute Node ────────────────────────────────────────────────────────────

export function ComputeNodeInfo({ node, onOpenDialog }: { node: GameNode; onOpenDialog: (cfg: NodeDialogConfig) => void }) {
  const difficultyColor = node.data.difficulty === 'easy' ? '#4ade80' : node.data.difficulty === 'medium' ? '#60a5fa' : '#f59e0b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Compute Puzzle</SectionLabel>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Difficulty</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'capitalize', color: difficultyColor }}>
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
      {NODE_DIALOG_REGISTRY[node.type] && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {Object.entries(NODE_DIALOG_REGISTRY[node.type]).map(([key, configFn]) => {
            const cfg = configFn(node.data);
            return (
              <button key={key} onClick={() => onOpenDialog(cfg)} style={{
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
  );
}

// ── Cache Node ──────────────────────────────────────────────────────────────

export function CacheNodeInfo({ node }: { node: GameNode }) {
  return (
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
  );
}

// ── API Node ────────────────────────────────────────────────────────────────

export function ApiNodeInfo({ node }: { node: GameNode }) {
  return (
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
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>POST /compute</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}{'{ op: "add"|"sub"|"mul"|"max"|"mod", a, b }'}<br />
          <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}{'{ result: number }'}<br />
          <span style={{ color: 'var(--text-secondary)' }}>Example:</span>{' '}{'{ op:"add", a:12, b:8 } → { result: 20 }'}
        </div>
      </div>

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>POST /echo</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Body:</span>{' '}{'{ value: any }'}<br />
          <span style={{ color: 'var(--text-secondary)' }}>Response:</span>{' '}{'{ value: any }'}
        </div>
      </div>

      {/* Security warning */}
      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          ⚠ SECURITY
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
          Some requests arrive <span style={{ color: '#ef4444', fontWeight: 700 }}>without authentication</span> (has_token=False).
          You MUST check <span style={{ color: 'var(--accent)' }}>request.has_token</span> and drop unauthenticated requests.
          Responding to them causes a <span style={{ color: '#ef4444' }}>SECURITY BREACH</span> and infects this node.
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginTop: 2 }}>
        <span style={{ color: 'var(--accent)' }}>node = self.get_current_node()</span><br />
        <span style={{ color: 'var(--accent)' }}>req = node.poll_for_request()</span><br />
        <span style={{ color: '#ef4444' }}>if not req.has_token: return</span><br />
        <span style={{ color: 'var(--accent)' }}>node.respond(req.id, {'{'} result {'}'} )</span>
      </div>
    </div>
  );
}

// ── Ground Items ────────────────────────────────────────────────────────────

export function GroundItems({ node }: { node: GameNode }) {
  const t = useT();
  const floorItems = Array.isArray(node.data.items) ? node.data.items : (Array.isArray(node.data.drops) ? node.data.drops : []);
  const maxBuffer: number | undefined = node.data.maxBuffer;
  const stacks = floorItems.length;
  if (stacks === 0 && !maxBuffer) return null;

  const itemCounts: Record<string, number> = {};
  for (const d of floorItems) {
    itemCounts[d.type] = (itemCounts[d.type] || 0) + (d.count ?? d.amount ?? 1);
  }
  const totalItems = Object.values(itemCounts).reduce((s, v) => s + v, 0);
  const ITEM_ICONS: Record<string, any> = { data_fragment: Database, rp_shard: Cpu, bad_data: AlertTriangle };
  const ITEM_COLORS: Record<string, string> = { data_fragment: '#45aaf2', rp_shard: '#a78bfa', bad_data: '#ef4444' };
  const ITEM_LABELS: Record<string, string> = { data_fragment: 'Data', rp_shard: 'RP', bad_data: 'Bad Data' };

  return (
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
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 700,
            color: stacks >= maxBuffer ? '#ef4444' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            <span>{t('node.buffer') || 'BUFFER'}</span>
            <span>{stacks}/{maxBuffer}</span>
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: 'var(--bg-primary)', border: '1px solid var(--border)', overflow: 'hidden',
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
  );
}
