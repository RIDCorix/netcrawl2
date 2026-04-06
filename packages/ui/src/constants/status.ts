// ── Worker status display config ────────────────────────────────────────────

export interface StatusConfig {
  label: string;
  color: string;
  dot: 'filled' | 'ring' | 'x';
  spin?: boolean;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  running:    { color: '#4ade80', dot: 'filled', label: 'Active' },
  moving:     { color: '#4ade80', dot: 'filled', label: 'Active' },
  idle:       { color: '#4ade80', dot: 'filled', label: 'Active' },
  harvesting: { color: '#4ade80', dot: 'filled', label: 'Active' },
  deploying:  { color: '#60a5fa', dot: 'ring',   label: 'Deploying', spin: true },
  suspending: { color: '#facc15', dot: 'ring',   label: 'Suspending', spin: true },
  suspended:  { color: '#9ca3af', dot: 'ring',   label: 'Suspended' },
  crashed:    { color: '#f87171', dot: 'x',      label: 'Crashed' },
  error:      { color: '#f87171', dot: 'x',      label: 'Error' },
  dead:       { color: '#f87171', dot: 'x',      label: 'Dead' },
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
}
