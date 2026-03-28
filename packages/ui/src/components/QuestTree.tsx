import ReactFlow, {
  Node, Edge, NodeTypes, Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState, Handle, Position,
  ReactFlowProvider, useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Check, BookOpen, Star, Gift, Play, RefreshCw, Network, ShieldCheck, Server, Gauge, Blocks, Trophy } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QuestGuideDialog } from './QuestGuideDialog';
import { CHAPTER_COLORS } from '../constants/colors';

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
        padding: !q.mainline ? '10px 14px' : '14px 18px',
        borderRadius: !q.mainline ? 'var(--radius-lg)' : 'var(--radius-md)',
        background: bg,
        border: `${isSelected ? '2px' : '1.5px'} ${status === 'locked' ? 'dashed' : 'solid'} ${isSelected ? 'var(--accent)' : borderColor}`,
        boxShadow: isSelected ? `0 0 16px var(--accent-dim)` : status === 'completed' ? `0 0 12px ${color}20` : 'none',
        opacity: status === 'locked' ? 0.35 : 1,
        cursor: status === 'locked' ? 'default' : 'pointer',
        minWidth: !q.mainline ? 120 : 160,
        textAlign: 'center' as const,
        transition: 'all 0.2s',
        position: 'relative',
      }}
    >
      <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="center" type="source" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="center" type="target" position={Position.Top} style={{ opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      {/* Status icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
        {status === 'locked' && <Lock size={14} style={{ color: 'var(--text-muted)' }} />}
        {status === 'available' && <BookOpen size={14} style={{ color }} />}
        {status === 'completed' && <Gift size={14} style={{ color }} />}
        {status === 'claimed' && <Check size={14} style={{ color }} />}
      </div>

      {/* Name */}
      <div style={{
        fontSize: !q.mainline ? 10 : 12,
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
      {!q.mainline && (
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

// ── Chapter tab names (must match server) ──────────────────────────────────

const CHAPTER_NAMES: Record<number, string> = {
  1: 'Getting Started', 2: 'Automation', 3: 'Networking', 4: 'Security',
  5: 'Infrastructure', 6: 'Optimization', 7: 'System Design', 8: 'Mastery',
};

const CHAPTER_ICONS: Record<number, any> = {
  1: Play, 2: RefreshCw, 3: Network, 4: ShieldCheck,
  5: Server, 6: Gauge, 7: Blocks, 8: Trophy,
};

export function QuestTree() {
  const { questsOpen, toggleQuests, selectedQuestId, selectQuest, settings } = useGameStore();
  const edgeStyle = settings.edgeStyle;
  const [questData, setQuestData] = useState<any>(null);
  const [activeChapter, setActiveChapter] = useState(1);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch quest data
  useEffect(() => {
    if (!questsOpen) return;
    axios.get('/api/quests').then(r => setQuestData(r.data)).catch(() => {});
  }, [questsOpen, useGameStore.getState().questSummary]);

  // Get chapters that have quests
  const chapters = questData
    ? [...new Set(questData.quests.map((q: any) => q.chapter))].sort((a: any, b: any) => a - b) as number[]
    : [];

  // Filter to active chapter and convert to ReactFlow
  useEffect(() => {
    if (!questData) return;
    const chapterQuests = questData.quests.filter((q: any) => q.chapter === activeChapter);
    const chapterQuestIds = new Set(chapterQuests.map((q: any) => q.id));

    const rfNodes: Node[] = chapterQuests.map((q: any) => ({
      id: q.id,
      type: 'quest',
      position: q.position,
      data: { quest: q },
    }));

    // Compute edge handles from relative positions
    const getQuestEdgeHandles = (sourceId: string, targetId: string) => {
      const s = chapterQuests.find((q: any) => q.id === sourceId);
      const t = chapterQuests.find((q: any) => q.id === targetId);
      if (!s || !t) return { sourceHandle: 'center', targetHandle: 'center' };

      // Straight mode or same-x (vertical chain): always center-to-center for clean lines
      if (edgeStyle === 'straight' || s.position.x === t.position.x) {
        return { sourceHandle: 'center', targetHandle: 'center' };
      }

      const dx = t.position.x - s.position.x;
      const dy = t.position.y - s.position.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0
          ? { sourceHandle: 'right', targetHandle: 'left' }
          : { sourceHandle: 'left', targetHandle: 'right' };
      }
      return dy > 0
        ? { sourceHandle: 'bottom', targetHandle: 'top' }
        : { sourceHandle: 'top', targetHandle: 'bottom' };
    };

    // Only show edges within this chapter
    const rfEdges: Edge[] = questData.edges
      .filter((e: any) => chapterQuestIds.has(e.source) && chapterQuestIds.has(e.target))
      .map((e: any, i: number) => {
        const sourceQuest = questData.quests.find((q: any) => q.id === e.source);
        const targetQuest = questData.quests.find((q: any) => q.id === e.target);
        const sourceStatus = sourceQuest?.status;
        const targetStatus = targetQuest?.status;
        const bothUnlocked = sourceStatus === 'claimed' || sourceStatus === 'completed';
        const color = CHAPTER_COLORS[activeChapter] || '#666';
        return {
          id: `qe-${i}`,
          source: e.source,
          target: e.target,
          type: edgeStyle === 'bezier' ? 'default' : edgeStyle,
          ...getQuestEdgeHandles(e.source, e.target),
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
  }, [questData, activeChapter, edgeStyle]);

  const selectedQuest = questData?.quests?.find((q: any) => q.id === selectedQuestId);

  const onNodeClick = useCallback((_: any, node: Node) => {
    selectQuest(node.id);
  }, [selectQuest]);

  const getChapterProgress = (ch: number) => {
    if (!questData) return { claimed: 0, total: 0 };
    const cq = questData.quests.filter((q: any) => q.chapter === ch);
    return { claimed: cq.filter((q: any) => q.status === 'claimed').length, total: cq.length };
  };

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
          {/* Chapter tabs (left sidebar) */}
          <div style={{
            width: 200, borderRight: '1px solid var(--border-bright)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-secondary)',
            flexShrink: 0,
          }}>
            {/* Header */}
            <div style={{
              padding: '16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <BookOpen size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                QUEST BOOK
              </span>
            </div>

            {/* Chapter list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {chapters.map(ch => {
                const color = CHAPTER_COLORS[ch] || '#666';
                const name = CHAPTER_NAMES[ch] || `Ch.${ch}`;
                const ChIcon = CHAPTER_ICONS[ch] || BookOpen;
                const { claimed, total } = getChapterProgress(ch);
                const isActive = ch === activeChapter;
                const allClaimed = claimed === total && total > 0;
                return (
                  <button
                    key={ch}
                    onClick={() => setActiveChapter(ch)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', marginBottom: 4,
                      background: isActive ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                      border: isActive ? `1px solid color-mix(in srgb, ${color} 30%, transparent)` : '1px solid transparent',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <ChIcon size={14} style={{
                      color: allClaimed ? color : isActive ? color : 'var(--text-muted)',
                      opacity: allClaimed ? 1 : 0.7,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isActive ? color : 'var(--text-secondary)', marginBottom: 4 }}>
                        {name}
                      </div>
                      {/* Progress bar */}
                      <div style={{
                        height: 3, borderRadius: 2,
                        background: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: total > 0 ? `${(claimed / total) * 100}%` : '0%',
                          background: color,
                          opacity: allClaimed ? 1 : 0.6,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontFamily: 'var(--font-mono)',
                      color: allClaimed ? color : 'var(--text-muted)',
                    }}>
                      {claimed}/{total}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Close */}
            <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
              <button
                onClick={toggleQuests}
                style={{
                  width: '100%', padding: '8px',
                  color: 'var(--text-muted)', background: 'none',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <X size={10} /> Close [Q]
              </button>
            </div>
          </div>

          {/* Quest graph for active chapter */}
          <div style={{ flex: 1, position: 'relative' }}>
            {/* Chapter title */}
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: 'var(--bg-glass-heavy)', borderRadius: 'var(--radius-md)',
              border: `1px solid color-mix(in srgb, ${CHAPTER_COLORS[activeChapter] || '#666'} 30%, transparent)`,
            }}>
              {(() => { const Icon = CHAPTER_ICONS[activeChapter] || BookOpen; return <Icon size={16} style={{ color: CHAPTER_COLORS[activeChapter] || '#666' }} />; })()}
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: CHAPTER_COLORS[activeChapter] || '#666', letterSpacing: '0.08em' }}>
                {CHAPTER_NAMES[activeChapter] || `Chapter ${activeChapter}`}
              </span>
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={QUEST_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.8, maxZoom: 1.2 }}
              style={{ background: 'transparent' }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
              key={activeChapter}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={`color-mix(in srgb, ${CHAPTER_COLORS[activeChapter] || '#666'} 5%, transparent)`} />
              <Controls showInteractive={false} style={{ background: 'var(--bg-glass-heavy)', border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-md)' }} />
            </ReactFlow>
          </div>

          {/* Quest detail / guide dialog */}
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
