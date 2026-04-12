/**
 * Generic tab bar for inventory/crafting sections.
 */

export function TabBar({ tabs, active, onChange, hasResults }: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  hasResults: Record<string, boolean>;
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        const has = hasResults[tab.key] !== false;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              border: isActive ? '1px solid rgba(0,212,170,0.25)' : '1px solid transparent',
              color: !has ? 'var(--text-muted)' : isActive ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.1s',
              opacity: !has ? 0.4 : 1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
