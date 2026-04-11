/**
 * WikiDialog — in-game interactive manual book.
 *
 * Terminal aesthetic, three-column layout:
 *   [categories] │ [entries in section] │ [entry detail]
 *
 * - Sections unlock based on player progress (level / quests completed)
 * - Locked entries render as dashed stubs with unlock hint
 * - First-time viewing an entry grants its declared reward
 * - Opens via gameStore.openWiki(entryId?) or the HUD Docs button (toggleDocs)
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, ChevronRight, BookOpen, Terminal, Check, Gift } from 'lucide-react';
import { useMemo, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';
import {
  WIKI,
  findEntry,
  isEntryUnlocked,
  type WikiCategory,
  type WikiSection,
  type WikiEntry,
  type PlayerProgress,
} from '../wiki/content';

const LIGHT_THEMES = new Set(['cloud', 'sakura', 'arctic']);

// Resolve an i18n key if present, else return the raw string (allows literal labels).
function useResolver() {
  const t = useT();
  return (keyOrText: string) => {
    const v = t(keyOrText);
    return v && v !== keyOrText ? v : keyOrText;
  };
}

function useProgress(): PlayerProgress {
  const level = useGameStore(s => s.levelSummary.level);
  const questsCompleted = useGameStore(s => s.questSummary.completed);
  const activeLayer = useGameStore(s => s.activeLayer);
  return useMemo(() => ({ level, questsCompleted, activeLayer }), [level, questsCompleted, activeLayer]);
}

// ─── breathing scanline background ─────────────────────────────────────────
function Scanlines() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'overlay',
        zIndex: 0,
      }}
    />
  );
}

// ─── category pill ─────────────────────────────────────────────────────────
function CategoryPill({
  category, active, unlockedCount, totalCount, onClick,
}: {
  category: WikiCategory;
  active: boolean;
  unlockedCount: number;
  totalCount: number;
  onClick: () => void;
}) {
  const r = useResolver();
  const Icon = category.icon;
  const pct = totalCount === 0 ? 0 : Math.round((unlockedCount / totalCount) * 100);
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: active
          ? `color-mix(in srgb, ${category.color} 18%, var(--bg-primary))`
          : 'transparent',
        border: `1px solid ${active
          ? `color-mix(in srgb, ${category.color} 50%, transparent)`
          : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <Icon size={16} style={{ color: category.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {r(category.title)}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
          marginTop: 2,
        }}>
          {unlockedCount}/{totalCount} · {pct}%
        </div>
      </div>
      {active && <ChevronRight size={12} style={{ color: category.color }} />}
    </motion.button>
  );
}

// ─── entry row ─────────────────────────────────────────────────────────────
function EntryRow({
  entry, unlocked, selected, seen, onClick,
}: {
  entry: WikiEntry;
  unlocked: boolean;
  selected: boolean;
  seen: boolean;
  onClick: () => void;
}) {
  const r = useResolver();
  const Icon = unlocked ? entry.icon : Lock;
  const color = unlocked ? (entry.color || 'var(--accent)') : 'var(--text-muted)';
  return (
    <motion.button
      whileHover={unlocked ? { x: 2 } : {}}
      whileTap={unlocked ? { scale: 0.98 } : {}}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px',
        background: selected
          ? `color-mix(in srgb, ${color} 15%, var(--bg-primary))`
          : 'transparent',
        border: selected
          ? `1px solid color-mix(in srgb, ${color} 45%, transparent)`
          : '1px solid transparent',
        borderLeft: selected
          ? `2px solid ${color}`
          : '2px solid transparent',
        borderRadius: 'var(--radius-sm)',
        cursor: unlocked ? 'pointer' : 'not-allowed',
        opacity: unlocked ? 1 : 0.4,
        width: '100%', textAlign: 'left',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <Icon size={13} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          letterSpacing: '0.02em',
        }}>
          {unlocked ? r(entry.title) : '████████'}
        </div>
        {unlocked && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginTop: 1,
          }}>
            {r(entry.summary)}
          </div>
        )}
      </div>
      {unlocked && !seen && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flexShrink: 0,
        }} />
      )}
    </motion.button>
  );
}

// ─── section header with unlock bar ────────────────────────────────────────
function SectionBlock({
  section, category, unlocked, selected, onSelect,
  seenMap,
}: {
  section: WikiSection;
  category: WikiCategory;
  unlocked: (entry: WikiEntry) => boolean;
  selected: string | null;
  onSelect: (entryId: string) => void;
  seenMap: Record<string, number>;
}) {
  const r = useResolver();
  const Icon = section.icon;
  const totalCount = section.entries.length;
  const unlockedCount = section.entries.filter(unlocked).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 6px 4px',
        borderBottom: `1px dashed color-mix(in srgb, ${category.color} 25%, transparent)`,
        marginBottom: 4,
      }}>
        <Icon size={11} style={{ color: category.color }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
          color: category.color, letterSpacing: '0.15em', textTransform: 'uppercase',
          flex: 1,
        }}>
          {r(section.title)}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)',
        }}>
          [{unlockedCount}/{totalCount}]
        </span>
      </div>
      {section.entries.map(entry => (
        <EntryRow
          key={entry.id}
          entry={entry}
          unlocked={unlocked(entry)}
          selected={selected === entry.id}
          seen={seenMap[entry.id] !== undefined}
          onClick={() => unlocked(entry) && onSelect(entry.id)}
        />
      ))}
    </div>
  );
}

// ─── unlock requirement descriptor ─────────────────────────────────────────
function UnlockRequirement({ entry }: { entry: WikiEntry }) {
  const t = useT();
  const { unlock } = entry;
  const parts: string[] = [];
  if (unlock.level) parts.push(t('wiki.req.level').replace('{n}', String(unlock.level)));
  if (unlock.questsCompleted) parts.push(t('wiki.req.quests').replace('{n}', String(unlock.questsCompleted)));
  if (unlock.layer) parts.push(t('wiki.req.layer').replace('{n}', String(unlock.layer)));
  if (parts.length === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 10px',
      background: 'color-mix(in srgb, #9ca3af 10%, var(--bg-primary))',
      border: '1px dashed var(--border-bright)',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      color: 'var(--text-muted)',
    }}>
      <Lock size={11} />
      <span>{parts.join(' · ')}</span>
    </div>
  );
}

// ─── detail panel ──────────────────────────────────────────────────────────
function EntryDetail({
  entry, unlocked, category, claimedReward,
}: {
  entry: WikiEntry | null;
  unlocked: boolean;
  category: WikiCategory | null;
  claimedReward: boolean;
}) {
  const r = useResolver();
  const t = useT();
  if (!entry || !category) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        gap: 10,
      }}>
        <Terminal size={32} style={{ opacity: 0.3 }} />
        <div style={{ letterSpacing: '0.1em' }}>{t('wiki.detail.placeholder')}</div>
        <div style={{ fontSize: 9, opacity: 0.6 }}>{'> select an entry'}</div>
      </div>
    );
  }
  const color = unlocked ? (entry.color || category.color) : 'var(--text-muted)';
  const Icon = unlocked ? entry.icon : Lock;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={entry.id + (unlocked ? ':u' : ':l')}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.2 }}
        style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          padding: 24,
          height: '100%',
          overflowY: 'auto',
        }}
      >
        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          <span>{r(category.title)}</span>
          <ChevronRight size={10} />
          <span style={{ color: 'var(--text-secondary)' }}>{unlocked ? r(entry.title) : '████'}</span>
        </div>

        {/* Title block */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 14px',
          background: `color-mix(in srgb, ${color} 10%, var(--bg-primary))`,
          border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{
            width: 48, height: 48,
            borderRadius: 'var(--radius-sm)',
            background: `color-mix(in srgb, ${color} 18%, var(--bg-primary))`,
            border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={26} style={{ color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800,
              color: 'var(--text-primary)', letterSpacing: '0.04em',
            }}>
              {unlocked ? r(entry.title) : t('wiki.locked.title')}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4,
            }}>
              {unlocked ? r(entry.summary) : t('wiki.locked.summary')}
            </div>
          </div>
        </div>

        {!unlocked && <UnlockRequirement entry={entry} />}

        {/* Body */}
        {unlocked && entry.body && entry.body.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entry.body.map((k, i) => (
              <p key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-secondary)', lineHeight: 1.6,
                margin: 0,
              }}>
                {r(k)}
              </p>
            ))}
          </div>
        )}

        {/* Fields table */}
        {unlocked && entry.fields && entry.fields.length > 0 && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '6px 10px',
              background: 'var(--bg-glass)',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
              color: 'var(--text-muted)', letterSpacing: '0.15em',
              textTransform: 'uppercase',
              borderBottom: '1px solid var(--border)',
            }}>
              {t('wiki.section.specs')}
            </div>
            {entry.fields.map((f, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                padding: '7px 10px',
                borderBottom: i < entry.fields!.length - 1 ? '1px dashed var(--border)' : 'none',
                fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{r(f.label)}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{r(f.value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Reward claimed indicator */}
        {unlocked && entry.reward && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: claimedReward
              ? `color-mix(in srgb, #4ade80 8%, var(--bg-primary))`
              : `color-mix(in srgb, #f59e0b 12%, var(--bg-primary))`,
            border: `1px solid ${claimedReward
              ? 'color-mix(in srgb, #4ade80 35%, transparent)'
              : 'color-mix(in srgb, #f59e0b 45%, transparent)'}`,
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
          }}>
            {claimedReward ? <Check size={12} style={{ color: '#4ade80' }} /> : <Gift size={12} style={{ color: '#f59e0b' }} />}
            <span style={{ color: claimedReward ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>
              {claimedReward ? t('wiki.reward.claimed') : t('wiki.reward.new')}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              +{entry.reward.amount} {entry.reward.kind.toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── main dialog ────────────────────────────────────────────────────────────
export function WikiDialog() {
  const docsOpen = useGameStore(s => s.docsOpen);
  const closeWiki = useGameStore(s => s.closeWiki);
  const selectedEntryId = useGameStore(s => s.wikiSelectedEntry);
  const setState = useGameStore(s => s.setState);
  const markSeen = useGameStore(s => s.markWikiEntrySeen);
  const seenMap = useGameStore(s => s.wikiSeenEntries);
  const addAchievementToast = useGameStore(s => s.addAchievementToast);
  const theme = useGameStore(s => s.settings.theme);
  const t = useT();
  const r = useResolver();
  const progress = useProgress();
  const isLight = LIGHT_THEMES.has(theme);

  // active category derives from selected entry when possible, else first unlocked.
  const [activeCategoryId, setActiveCategoryId] = useState<string>(WIKI[0].id);

  const unlockedFn = useMemo(
    () => (entry: WikiEntry) => isEntryUnlocked(entry.unlock, progress),
    [progress]
  );

  // When selection changes from outside (openWiki(id)), focus the correct category.
  useEffect(() => {
    if (!selectedEntryId) return;
    const found = findEntry(selectedEntryId);
    if (found) setActiveCategoryId(found.category.id);
  }, [selectedEntryId]);

  // Grant reward + mark seen when an unlocked entry is viewed for the first time.
  useEffect(() => {
    if (!docsOpen || !selectedEntryId) return;
    const found = findEntry(selectedEntryId);
    if (!found) return;
    if (!unlockedFn(found.entry)) return;
    if (seenMap[selectedEntryId]) return;
    markSeen(selectedEntryId);
    // Fire a toast when the entry carries a declared reward. Reward persistence
    // is client-only for now; a future server route can swap this without UI changes.
    if (found.entry.reward) {
      const { kind, amount } = found.entry.reward;
      addAchievementToast({
        id: `wiki-${selectedEntryId}`,
        name: t('wiki.reward.new'),
        description: `+${amount} ${kind.toUpperCase()}`,
        category: 'secret',
      });
    }
  }, [docsOpen, selectedEntryId, unlockedFn, seenMap, markSeen, addAchievementToast, t]);

  const activeCategory = WIKI.find(c => c.id === activeCategoryId) || WIKI[0];
  const selectedLookup = selectedEntryId ? findEntry(selectedEntryId) : null;

  const handleSelectCategory = (id: string) => {
    setActiveCategoryId(id);
    // auto-select first unlocked entry in category
    const cat = WIKI.find(c => c.id === id);
    if (cat) {
      for (const section of cat.sections) {
        const first = section.entries.find(unlockedFn);
        if (first) {
          setState({ wikiSelectedEntry: first.id });
          return;
        }
      }
      setState({ wikiSelectedEntry: null });
    }
  };

  const handleSelectEntry = (id: string) => setState({ wikiSelectedEntry: id });

  return (
    <AnimatePresence>
      {docsOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0,
            background: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)', zIndex: 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeWiki}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: 'calc(100vw - 80px)',
              height: 'calc(100vh - 80px)',
              maxWidth: 1200, maxHeight: 780,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 80px rgba(0,0,0,0.6), inset 0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Scanlines />

            {/* Header bar */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 100%)',
              flexShrink: 0,
            }}>
              <BookOpen size={14} style={{ color: 'var(--accent)' }} />
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800,
                color: 'var(--text-primary)', letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                {t('wiki.title')}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-muted)', letterSpacing: '0.1em',
              }}>
                v1.0 · MANUAL
              </div>
              <div style={{ flex: 1 }} />
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-muted)',
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                Lv.{progress.level}
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={closeWiki}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  padding: 4, display: 'flex',
                }}
              >
                <X size={15} />
              </motion.button>
            </div>

            {/* Body: three columns */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'grid',
              gridTemplateColumns: '220px 260px 1fr',
              flex: 1, minHeight: 0,
            }}>
              {/* Categories */}
              <div style={{
                borderRight: '1px solid var(--border)',
                padding: 12,
                display: 'flex', flexDirection: 'column', gap: 6,
                overflowY: 'auto',
                background: 'color-mix(in srgb, var(--bg-primary) 40%, transparent)',
              }}>
                {WIKI.map(cat => {
                  const all = cat.sections.flatMap(s => s.entries);
                  const unlockedCount = all.filter(unlockedFn).length;
                  return (
                    <CategoryPill
                      key={cat.id}
                      category={cat}
                      active={cat.id === activeCategoryId}
                      unlockedCount={unlockedCount}
                      totalCount={all.length}
                      onClick={() => handleSelectCategory(cat.id)}
                    />
                  );
                })}
              </div>

              {/* Entry list */}
              <div style={{
                borderRight: '1px solid var(--border)',
                padding: 10,
                overflowY: 'auto',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px 10px',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                  color: activeCategory.color,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>
                  <activeCategory.icon size={13} />
                  {r(activeCategory.title)}
                </div>
                {activeCategory.sections.map(section => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    category={activeCategory}
                    unlocked={unlockedFn}
                    selected={selectedEntryId}
                    onSelect={handleSelectEntry}
                    seenMap={seenMap}
                  />
                ))}
              </div>

              {/* Detail */}
              <div style={{ position: 'relative' }}>
                <EntryDetail
                  entry={selectedLookup?.entry ?? null}
                  category={selectedLookup?.category ?? null}
                  unlocked={selectedLookup ? unlockedFn(selectedLookup.entry) : false}
                  claimedReward={selectedEntryId ? seenMap[selectedEntryId] !== undefined : false}
                />
              </div>
            </div>

            {/* Footer hint */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 14px',
              borderTop: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-muted)', letterSpacing: '0.08em',
              flexShrink: 0,
              background: 'color-mix(in srgb, var(--bg-primary) 40%, transparent)',
            }}>
              <span>{'> '}</span>
              <span>{t('wiki.footer.hint')}</span>
              <div style={{ flex: 1 }} />
              <span style={{ opacity: 0.6 }}>ESC · CLOSE</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
