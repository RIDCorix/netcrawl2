/**
 * Shared UI primitives used across multiple components.
 */

export function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em',
      marginBottom: 8,
      textTransform: 'uppercase' as const,
    }}>
      {children}
    </div>
  );
}

export function Divider() {
  return <div style={{
    height: 1,
    background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)',
    margin: '4px 0',
  }} />;
}

export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 800,
      fontFamily: 'var(--font-mono)',
      padding: '1px 5px',
      borderRadius: 'var(--radius-sm)',
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      color,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
    }}>
      {children}
    </span>
  );
}
