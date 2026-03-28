import ReactFlow, {
  Node, Edge, NodeTypes, Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Check, BookOpen, Star, Gift } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QuestGuideDialog } from './QuestGuideDialog';

const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80', 2: '#60a5fa', 3: '#a78bfa', 4: '#ef4444', 5: '#f59e0b', 6: '#00d4aa',
};

// ── Custom quest nodes ──────────────────────────────────────────────────────

function QuestNode({ data }: any) {
  const { selectQuest, selectedQuestId } = useGameStore();
  const q = data.quest;
  const status = q.status;
  const color = CHAPTER_COLORS[q.chapter] || '#9ca3af';
  const isSelected = selectedQuestId === q.id;

  const borderColor = status === 'claimed' ? `${color}60`
    : status === 'completed' ? color
    : status === 'available' ? `${color}80`
    : 'var(--border)';

  const bg = status === 'claimed' ? `${color}15`
    : status === 'completed' ? `${color}10`
    : 'var(--bg-glass-heavy)';

  return (
    <div
      onClick={() => selectQuest(q.id)}
      style={{
        padding: q.sideQuest ? '10px 14px' : '14px 18px',
        borderRadius: q.sideQuest ? 'var(--radius-lg)' : 'var(--radius-md)',
        background: bg,
        border: `${isSelected ? '2px' : '1.5px'} ${status === 'locked' ? 'dashed' : 'solid'} ${isSelected ? 'var(--accent)' : borderColor}`,
        boxShadow: isSelected ? `0 0 16px var(--accent-dim)` : status === 'completed' ? `0 0 12px ${color}20` : 'none',
        opacity: status === 'locked' ? 0.35 : 1,
        cursor: status === 'locked' ? 'default' : 'pointer',
        minWidth: q.sideQuest ? 120 : 160,
        textAlign: 'center' as const,
        transition: 'all 0.2s',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Status icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
        {status === 'locked' && <Lock size={14} style={{ color: 'var(--text-muted)' }} />}
        {status === 'available' && <BookOpen size={14} style={{ color }} />}
        {status === 'completed' && <Gift size={14} style={{ color }} />}
        {status === 'claimed' && <Check size={14} style={{ color }} />}
      </div>

      {/* Name */}
      <div style={{
        fontSize: q.sideQuest ? 10 : 12,
        fontWeight: 700,
        color: status === 'locked' ? 'var(--text-muted)' : 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {q.name}
      </div>

      {/* Code concept tag */}
      <div style={{
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        color: status === 'locked' ? 'var(--text-muted)' : color,
        marginTop: 3,
        letterSpacing: '0.05em',
      }}>
        {q.codeConcept}
      </div>

      {/* Side quest indicator */}
      {q.sideQuest && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 14, height: 14, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Star size={8} color="#000" />
        </div>
      )}

      {/* Completed badge */}
      {status === 'completed' && (
        <div style={{
          position: 'absolute', top: -6, left: -6,
          width: 18, height: 18, borderRadius: '50%',
          background: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--bg-primary)',
        }}>
          <Gift size={9} color="#000" />
        </div>
      )}
    </div>
  );
}

const QUEST_NODE_TYPES: NodeTypes = {
  quest: QuestNode,
};

// ── Quest Detail Side Panel ─────────────────────────────────────────────────

function QuestDetail({ quest, onClose }: { quest: any; onClose: () => void }) {
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState('');
  const color = CHAPTER_COLORS[quest.chapter] || '#9ca3af';

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await axios.post(`/api/quests/${quest.id}/claim`);
      setMsg('Rewards claimed!');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Failed');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div style={{
      width: 300, padding: 20, background: 'var(--bg-glass-heavy)',
      borderLeft: '1px solid var(--border-bright)',
      display: 'flex', flexDirection: 'column', gap: 12,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            CH.{quest.chapter} {quest.sideQuest ? '/ SIDE QUEST' : '/ MAIN QUEST'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {quest.name}
          </div>
          <div style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', marginTop: 2, padding: '1px 6px', background: `${color}15`, borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
            {quest.codeConcept}
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <X size={12} />
        </button>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        {quest.description}
      </div>

      {/* Objectives */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>OBJECTIVES</div>
        {quest.objectives.map((obj: any) => (
          <div key={obj.id} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: obj.met ? 'var(--success)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {obj.description}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: obj.met ? 'var(--success)' : 'var(--text-muted)' }}>
                {obj.current}/{obj.target}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-primary)', marginTop: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (obj.current / obj.target) * 100)}%`, background: obj.met ? 'var(--success)' : color, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Rewards */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>REWARDS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {quest.rewards.map((r: any, i: number) => (
            <div key={i} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
            }}>
              {r.kind === 'resources' && Object.entries(r.resources).map(([k, v]) => `${v} ${k}`).join(', ')}
              {r.kind === 'passive' && r.description}
              {r.kind === 'recipe_unlock' && `Unlock recipe: ${r.name}`}
              {r.kind === 'items' && r.items.map((it: any) => `${it.count}x ${it.itemType}`).join(', ')}
              {r.kind === 'chips' && r.chips.map((c: any) => `${c.chipType} (${c.rarity})`).join(', ')}
              {r.kind === 'unique_equipment' && `${r.name} - ${r.description}`}
            </div>
          ))}
        </div>
      </div>

      {/* Claim button */}
      {quest.status === 'completed' && (
        <button onClick={handleClaim} disabled={claiming} style={{
          padding: '10px', borderRadius: 'var(--radius-sm)',
          background: 'var(--accent)', color: '#000', border: 'none',
          fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)',
          cursor: claiming ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Gift size={14} /> {claiming ? 'Claiming...' : 'CLAIM REWARDS'}
        </button>
      )}

      {quest.status === 'claimed' && (
        <div style={{ fontSize: 10, color: 'var(--success)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '8px' }}>
          Claimed {quest.claimedAt ? new Date(quest.claimedAt).toLocaleString() : ''}
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 10, color: msg.includes('claimed') ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ── Main Quest Tree Panel ───────────────────────────────────────────────────

export function QuestTree() {
  const { questsOpen, toggleQuests, selectedQuestId, selectQuest } = useGameStore();
  const [questData, setQuestData] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch quest data
  useEffect(() => {
    if (!questsOpen) return;
    axios.get('/api/quests').then(r => setQuestData(r.data)).catch(() => {});
  }, [questsOpen, useGameStore.getState().questSummary]);

  // Convert to ReactFlow
  useEffect(() => {
    if (!questData) return;
    const rfNodes: Node[] = questData.quests.map((q: any) => ({
      id: q.id,
      type: 'quest',
      position: q.position,
      data: { quest: q },
    }));
    const rfEdges: Edge[] = questData.edges.map((e: any, i: number) => {
      const sourceQuest = questData.quests.find((q: any) => q.id === e.source);
      const targetQuest = questData.quests.find((q: any) => q.id === e.target);
      const sourceStatus = sourceQuest?.status;
      const targetStatus = targetQuest?.status;
      const bothUnlocked = sourceStatus === 'claimed' || sourceStatus === 'completed';
      const color = CHAPTER_COLORS[targetQuest?.chapter] || '#666';
      return {
        id: `qe-${i}`,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: {
          stroke: bothUnlocked ? color : 'var(--border)',
          strokeWidth: bothUnlocked ? 2 : 1,
          strokeDasharray: targetStatus === 'locked' ? '4 4' : undefined,
          opacity: targetStatus === 'locked' ? 0.3 : 0.7,
        },
        animated: targetStatus === 'available',
      };
    });
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [questData]);

  const selectedQuest = questData?.quests?.find((q: any) => q.id === selectedQuestId);

  const onNodeClick = useCallback((_: any, node: Node) => {
    selectQuest(node.id);
  }, [selectQuest]);

  return (
    <AnimatePresence>
      {questsOpen && (
        <motion.div
          key="quest-tree"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'var(--bg-primary)',
            display: 'flex',
          }}
        >
          {/* Tree */}
          <div style={{ flex: 1, position: 'relative' }}>
            {/* Close button */}
            <button
              onClick={toggleQuests}
              style={{
                position: 'absolute', top: 16, right: 16, zIndex: 10,
                color: 'var(--text-muted)', background: 'var(--bg-glass-heavy)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              }}
            >
              <X size={12} /> Close [Q]
            </button>

            {/* Title */}
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: 'var(--bg-glass-heavy)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-bright)',
            }}>
              <BookOpen size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                QUEST TREE
              </span>
              {questData && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {questData.quests.filter((q: any) => q.status === 'claimed').length}/{questData.quests.length}
                </span>
              )}
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={QUEST_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              style={{ background: 'transparent' }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(0,212,170,0.04)" />
              <Controls showInteractive={false} style={{ background: 'var(--bg-glass-heavy)', border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-md)' }} />
            </ReactFlow>
          </div>

          {/* Guide dialog */}
          <AnimatePresence>
            {selectedQuest && selectedQuest.status !== 'locked' && (
              <QuestGuideDialog quest={selectedQuest} onClose={() => selectQuest(null)} />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
