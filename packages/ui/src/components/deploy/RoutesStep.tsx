/**
 * Deploy wizard Step 2: Route/edge configuration.
 */

import { useT } from '../../hooks/useT';

interface RouteSlot {
  name: string;
  description: string;
  fieldType: 'route' | 'edge';
}

interface RoutesStepProps {
  routeSlots: RouteSlot[];
  routes: Record<string, { id: string; source: string; target: string }[]>;
  routeNodes: Record<string, string[]>;
  selectingRoute: string | null;
  startRouteSelect: (fieldName: string, fieldType: 'edge' | 'route') => void;
  finishRouteSelect: () => void;
  getNodeLabel: (id: string) => string;
}

export function RoutesStep({
  routeSlots, routes, routeNodes, selectingRoute,
  startRouteSelect, finishRouteSelect, getNodeLabel,
}: RoutesStepProps) {
  const t = useT();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.configure_routes')}</div>
      {routeSlots.map(slot => {
        const edges = routes[slot.name] || [];
        const isEdge = slot.fieldType === 'edge';
        const isSelecting = selectingRoute === slot.name;
        const filled = edges.length > 0;
        return (
          <div key={slot.name} style={{
            padding: '12px 14px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: `1px solid ${isSelecting ? '#f59e0b' : filled ? 'var(--accent)' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{slot.name}</span>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: isEdge ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)', color: isEdge ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {isEdge ? 'Edge' : 'Route'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{slot.description}</div>
              </div>
              {!isSelecting ? (
                <button
                  onClick={() => startRouteSelect(slot.name, slot.fieldType)}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                    background: filled ? 'var(--bg-primary)' : 'var(--accent)',
                    border: filled ? '1px solid var(--border)' : 'none',
                    color: filled ? 'var(--text-secondary)' : '#000',
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  }}
                >
                  {filled ? t('ui.change') : t('ui.select_on_map')}
                </button>
              ) : (
                <button
                  onClick={finishRouteSelect}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                    background: '#f59e0b', border: 'none', color: '#000',
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                    animation: 'pulse-connect 1.5s ease-in-out infinite',
                  }}
                >
                  Done ({edges.length})
                </button>
              )}
            </div>
            {filled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                {isEdge ? (
                  <span><span style={{ fontWeight: 700 }}>{getNodeLabel(edges[0].source)}</span> <span style={{ color: 'var(--text-muted)' }}>↔</span> <span style={{ fontWeight: 700 }}>{getNodeLabel(edges[0].target)}</span></span>
                ) : (
                  (routeNodes[slot.name] || []).map((nid, i, arr) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 700 }}>{getNodeLabel(nid)}</span>
                      {i < arr.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
