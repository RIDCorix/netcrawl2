import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Minecraft-style inventory cell: icon + count, tooltip on hover via portal */
export function InvCell({ icon: Icon, color, label, count }: {
  icon: any;
  color: string;
  label: string;
  count: number;
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const rect = hover && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        aspectRatio: '1', borderRadius: 'var(--radius-sm)',
        background: `color-mix(in srgb, ${color} 8%, var(--bg-primary))`,
        border: `1px solid color-mix(in srgb, ${color} ${hover ? '35%' : '20%'}, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', cursor: 'default',
        transition: 'border-color 0.1s',
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

      {/* Tooltip via portal */}
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
    </div>
  );
}
