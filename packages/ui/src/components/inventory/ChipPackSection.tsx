/**
 * Chip Pack buy/open section with reveal animation.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Gift } from 'lucide-react';
import axios from 'axios';
import { useGameStore, Chip } from '../../store/gameStore';
import { RARITY_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';
import { formatBytes } from '../../lib/format';

export function ChipPackSection() {
  const { resources } = useGameStore();
  const t = useT();
  const [packs, setPacks] = useState<any[]>([]);
  const [opening, setOpening] = useState(false);
  const [revealed, setRevealed] = useState<Chip[]>([]);

  useEffect(() => {
    axios.get('/api/chip-packs').then(r => setPacks(r.data.packs || [])).catch(() => {});
  }, [resources]);

  const handleBuy = async (packType: string) => {
    try { await axios.post('/api/chip-pack/buy', { packType }); } catch {}
  };

  const handleOpen = async (packType: string) => {
    setOpening(true);
    try {
      const res = await axios.post('/api/chip-pack/open', { packType });
      setRevealed(res.data.chips || []);
    } catch {} finally { setOpening(false); }
  };

  if (packs.length === 0) return null;

  return (
    <>
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Gift size={12} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.chip_packs')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {packs.map(p => (
            <div key={p.packType} style={{
              flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{t('item.' + p.packType + '.name') || p.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('item.' + p.packType + '.desc') || p.description}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.entries(p.cost).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: k === 'data' ? 'var(--data-color)' : k === 'rp' ? 'var(--rp-color)' : 'var(--credits-color)' }}>
                    {k === 'data' ? formatBytes(v as number) : `${v as number} ${k}`}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => handleBuy(p.packType)} disabled={!p.affordable} style={{
                  flex: 1, padding: '5px', borderRadius: 'var(--radius-sm)',
                  background: p.affordable ? 'var(--accent)' : 'var(--bg-primary)',
                  color: p.affordable ? '#000' : 'var(--text-muted)',
                  border: 'none', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  cursor: p.affordable ? 'pointer' : 'not-allowed', opacity: p.affordable ? 1 : 0.5,
                }}>
                  {t('ui.buy')}
                </button>
                {p.owned > 0 && (
                  <button onClick={() => handleOpen(p.packType)} disabled={opening} style={{
                    flex: 1, padding: '5px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                    color: '#f59e0b', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}>
                    {t('ui.open').replace('{count}', String(p.owned))}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reveal animation */}
      <AnimatePresence>
        {revealed.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setRevealed([])}
          >
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-glass-heavy)', border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', minWidth: 300 }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{t('ui.chips_obtained')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {revealed.map((chip, i) => (
                  <motion.div
                    key={chip.id}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: i * 0.15, type: 'spring', damping: 20 }}
                    style={{
                      width: 80, padding: '10px 8px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)',
                      border: `2px solid ${RARITY_COLORS[chip.rarity]}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      boxShadow: chip.rarity === 'legendary' ? `0 0 16px ${RARITY_COLORS.legendary}40` : chip.rarity === 'rare' ? `0 0 8px ${RARITY_COLORS.rare}30` : 'none',
                    }}
                  >
                    <Cpu size={18} style={{ color: RARITY_COLORS[chip.rarity] }} />
                    <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.2 }}>{t('chip.' + chip.chipType + '.name') || chip.name}</div>
                    <div style={{ fontSize: 7, color: RARITY_COLORS[chip.rarity], fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700 }}>{chip.rarity}</div>
                  </motion.div>
                ))}
              </div>
              <button onClick={() => setRevealed([])} style={{
                padding: '8px 24px', borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)', color: '#000', border: 'none',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}>
                {t('ui.nice')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
