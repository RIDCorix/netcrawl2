/**
 * Music pack definitions — purchasable bundles of BGM tracks.
 */

export interface MusicPack {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  cost: { credits: number };
  icon: string; // lucide icon name
}

export const MUSIC_PACKS: Record<string, MusicPack> = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    description: 'A chill ambient track to get you started. Included free with every installation.',
    trackIds: ['default'],
    cost: { credits: 0 },
    icon: 'Music',
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave Collection',
    description: 'Pulsing bass and bright arpeggios. Ride the neon grid in style.',
    trackIds: ['neon_grid'],
    cost: { credits: 50 },
    icon: 'Zap',
  },
  ambient: {
    id: 'ambient',
    name: 'Deep Space Ambient',
    description: 'Dark evolving pads and deep bass. For those long sessions in the void.',
    trackIds: ['deep_space'],
    cost: { credits: 30 },
    icon: 'Moon',
  },
  techno: {
    id: 'techno',
    name: 'Data Flow Beats',
    description: 'Minimal techno with glitchy rhythms and crisp hi-hats. Stay in the zone.',
    trackIds: ['data_flow'],
    cost: { credits: 40 },
    icon: 'Activity',
  },
  epic: {
    id: 'epic',
    name: 'Quantum Core Suite',
    description: 'Epic layered soundscapes with dramatic intensity. For the final push.',
    trackIds: ['quantum_core'],
    cost: { credits: 100 },
    icon: 'Atom',
  },
};

/** All pack IDs in display order */
export const MUSIC_PACK_ORDER = ['starter', 'ambient', 'techno', 'synthwave', 'epic'] as const;

/** Get all track IDs across all packs */
export function getAllTrackIds(): string[] {
  return Object.values(MUSIC_PACKS).flatMap((p) => p.trackIds);
}

/** Check if a pack is free */
export function isFreePack(packId: string): boolean {
  return MUSIC_PACKS[packId]?.cost.credits === 0;
}
