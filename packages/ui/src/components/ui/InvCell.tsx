import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCtrlOrCmd, useCtrlTrigger } from '../../hooks/useModifierKey';
import { useGameStore } from '../../store/gameStore';
import { wikiIdForItem } from '../../wiki/content';
import { WikiHoverHint } from './WikiHoverHint';

/**
 * Minecraft-style inventory cell: icon + count, label tooltip above, and
 * a cursor-follow "hold ctrl/cmd for wiki" hint in the bottom-right of the
 * cursor whenever a wiki entry exists for this item type.
 */
export function InvCell({ icon: Icon, color, label, count, itemType, wikiEntryId }: {
  icon: any;
  color: string;
  label: string;
  count: number;
  /** Raw item type (e.g. 'pickaxe_basic'); auto-resolves to a wiki entry id. */
  itemType?: string;
  /** Explicit wiki entry id override. */
  wikiEntryId?: string;
}) {
  const [hover, setHover] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const openWiki = useGameStore(s => s.openWiki);
  const ctrlHeld = useCtrlOrCmd();

  const resolvedWikiId = wikiEntryId ?? (itemType ? wikiIdForItem(itemType) : null);
  const hasWiki = !!resolvedWikiId;

  // Hold ctrl/cmd while hovering → open wiki page.
  const handleTrigger = useCallback(() => {
    if (hover && resolvedWikiId) openWiki(resolvedWikiId);
  }, [hover, resolvedWikiId, openWiki]);
  useCtrlTrigger(hover && hasWiki, handleTrigger);

  // Clear cursor state when unhovering.
  useEffect(() => { if (!hover) setCursor(null); }, [hover]);

  const rect = hover && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={(e) => {
        if (hasWiki) setCursor({ x: e.clientX, y: e.clientY });
      }}
      style={{
        aspectRatio: '1', borderRadius: 'var(--radius-sm)',
        background: `color-mix(in srgb, ${color} ${hover && ctrlHeld ? '18' : '8'}%, var(--bg-primary))`,
        border: `1px solid color-mix(in srgb, ${color} ${hover ? (ctrlHeld ? '65' : '35') : '20'}%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', cursor: 'default',
        transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      <Icon size={14} style={{ color }} />
      <div style={{
        position: 'absolute', bottom: 1, right: 2,
        fontSize: 8, fontWeight: 800, fontFamily: 'var(--font-mono)',
        color, lineHeight: 1,
      }}>
        {count}
      </div>

      {/* Label tooltip (above cell) */}
      {hover && rect && createPortal(
        <div style={{
          position: 'fixed',
          top: rect.top - 4,
          left: rect.left + rect.width / 2,
          transform: 'translate(-50%, -100%)',
          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-bright)',
          fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {label}
          <span style={{ color, marginLeft: 4 }}>x{count}</span>
        </div>,
        document.body
      )}

      <WikiHoverHint visible={hover && hasWiki} cursor={cursor} accentColor={color} />
    </div>
  );
}
