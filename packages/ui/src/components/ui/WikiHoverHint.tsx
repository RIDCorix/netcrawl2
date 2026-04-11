import { createPortal } from 'react-dom';
import { BookOpen } from 'lucide-react';
import { useCtrlOrCmd, getModifierLabel } from '../../hooks/useModifierKey';

/**
 * Cursor-follow "hold ctrl/cmd to open wiki" hint. Presentational only —
 * callers manage hover state, cursor tracking, and the ctrl-trigger action.
 */
export function WikiHoverHint({
  visible, cursor, accentColor,
}: {
  visible: boolean;
  cursor: { x: number; y: number } | null;
  accentColor: string;
}) {
  const ctrlHeld = useCtrlOrCmd();
  const modLabel = getModifierLabel();
  if (!visible || !cursor) return null;
  return createPortal(
    <div style={{
      position: 'fixed',
      top: cursor.y + 14,
      left: cursor.x + 14,
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 7px',
      background: ctrlHeld
        ? `color-mix(in srgb, ${accentColor} 30%, var(--bg-glass-heavy))`
        : 'var(--bg-glass-heavy)',
      backdropFilter: 'blur(14px)',
      border: `1px solid ${ctrlHeld
        ? `color-mix(in srgb, ${accentColor} 70%, transparent)`
        : 'var(--border-bright)'}`,
      borderRadius: 'var(--radius-sm)',
      pointerEvents: 'none', zIndex: 10000,
      boxShadow: ctrlHeld
        ? `0 0 12px color-mix(in srgb, ${accentColor} 50%, transparent)`
        : '0 2px 8px rgba(0,0,0,0.4)',
      transition: 'background 0.1s, border-color 0.1s, box-shadow 0.15s',
    }}>
      <kbd style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 800,
        padding: '1px 5px',
        border: '1px solid var(--border-bright)',
        borderRadius: 3,
        color: ctrlHeld ? accentColor : 'var(--text-secondary)',
        background: 'color-mix(in srgb, var(--bg-primary) 70%, transparent)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        lineHeight: 1,
      }}>
        {modLabel}
      </kbd>
      <BookOpen size={10} style={{ color: ctrlHeld ? accentColor : 'var(--text-secondary)' }} />
    </div>,
    document.body
  );
}
