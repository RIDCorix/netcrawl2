/**
 * Custom SVG game icons for NetCrawl items.
 * All icons are 24x24 viewBox, accept size + style props like lucide-react.
 */

import React from 'react';

interface IconProps {
  size?: number;
  style?: React.CSSProperties;
  color?: string;
}

const I = ({ size = 24, style, color = 'currentColor', children }: IconProps & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

// ── Pickaxes (variants by handle style) ─────────────────────────────────────

export const PickaxeBasic = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 3.5L20.5 9.5" />
    <path d="M15 9L3.5 20.5" />
    <circle cx="17.5" cy="6.5" r="1" fill={p.color || 'currentColor'} stroke="none" />
  </I>
);

export const PickaxeIron = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 3.5L20.5 9.5" />
    <path d="M15 9L3.5 20.5" />
    <path d="M13 5L19 11" />
    <circle cx="17.5" cy="6.5" r="1.5" fill={p.color || 'currentColor'} stroke="none" />
  </I>
);

export const PickaxeDiamond = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 3.5L20.5 9.5" />
    <path d="M15 9L3.5 20.5" />
    <path d="M13 5L19 11" />
    <path d="M12 6L18 12" />
    <rect x="15.5" y="4.5" width="4" height="4" rx="0.5" fill={p.color || 'currentColor'} stroke="none" transform="rotate(45 17.5 6.5)" />
  </I>
);

// ── CPU (circuit board chip — small/large) ──────────────────────────────────

export const CpuBasic = (p: IconProps) => (
  <I {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" fill={p.color || 'currentColor'} opacity="0.2" stroke="none" />
    {/* Pins */}
    <line x1="9" y1="6" x2="9" y2="3" />
    <line x1="15" y1="6" x2="15" y2="3" />
    <line x1="9" y1="18" x2="9" y2="21" />
    <line x1="15" y1="18" x2="15" y2="21" />
    <line x1="6" y1="9" x2="3" y2="9" />
    <line x1="6" y1="15" x2="3" y2="15" />
    <line x1="18" y1="9" x2="21" y2="9" />
    <line x1="18" y1="15" x2="21" y2="15" />
  </I>
);

export const CpuAdvanced = (p: IconProps) => (
  <I {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill={p.color || 'currentColor'} stroke="none" />
    {/* More pins */}
    <line x1="9" y1="6" x2="9" y2="3" />
    <line x1="12" y1="6" x2="12" y2="3" />
    <line x1="15" y1="6" x2="15" y2="3" />
    <line x1="9" y1="18" x2="9" y2="21" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="15" y1="18" x2="15" y2="21" />
    <line x1="6" y1="9" x2="3" y2="9" />
    <line x1="6" y1="12" x2="3" y2="12" />
    <line x1="6" y1="15" x2="3" y2="15" />
    <line x1="18" y1="9" x2="21" y2="9" />
    <line x1="18" y1="12" x2="21" y2="12" />
    <line x1="18" y1="15" x2="21" y2="15" />
  </I>
);

// ── RAM (memory stick with notch) ───────────────────────────────────────────

export const RamBasic = (p: IconProps) => (
  <I {...p}>
    <rect x="3" y="8" width="18" height="8" rx="1.5" />
    {/* Notch */}
    <path d="M10 16V18" strokeWidth="2" />
    {/* Memory chips */}
    <rect x="5" y="10" width="2" height="4" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="8.5" y="10" width="2" height="4" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="13.5" y="10" width="2" height="4" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="17" y="10" width="2" height="4" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    {/* Pins at bottom */}
    <line x1="5" y1="16" x2="5" y2="17.5" />
    <line x1="7" y1="16" x2="7" y2="17.5" />
    <line x1="13" y1="16" x2="13" y2="17.5" />
    <line x1="15" y1="16" x2="15" y2="17.5" />
    <line x1="17" y1="16" x2="17" y2="17.5" />
    <line x1="19" y1="16" x2="19" y2="17.5" />
  </I>
);

export const RamAdvanced = (p: IconProps) => (
  <I {...p}>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M10 17V19" strokeWidth="2" />
    {/* Heatsink fins on top */}
    <line x1="5" y1="7" x2="5" y2="5" />
    <line x1="8" y1="7" x2="8" y2="5" />
    <line x1="11" y1="7" x2="11" y2="5" />
    <line x1="14" y1="7" x2="14" y2="5" />
    <line x1="17" y1="7" x2="17" y2="5" />
    <line x1="19" y1="7" x2="19" y2="5" />
    {/* Memory chips */}
    <rect x="5" y="9.5" width="2.5" height="5" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="8.5" y="9.5" width="2.5" height="5" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="13" y="9.5" width="2.5" height="5" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <rect x="16.5" y="9.5" width="2.5" height="5" rx="0.5" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
  </I>
);

// ── Beacon (signal tower) ───────────────────────────────────────────────────

export const BeaconIcon = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M8.5 8.5a5 5 0 010 7" />
    <path d="M15.5 8.5a5 5 0 000 7" />
    <path d="M6 6a9 9 0 010 12" />
    <path d="M18 6a9 9 0 000 12" />
  </I>
);

// ── Shield (hexagonal) ──────────────────────────────────────────────────────

export const ShieldIcon = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3L20 7V13C20 17 16.5 20 12 21.5C7.5 20 4 17 4 13V7L12 3Z" />
    <path d="M9 12L11 14L15 10" />
  </I>
);

// ── Antivirus (shield + scan) ───────────────────────────────────────────────

export const AntivirusIcon = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3L19 6.5V12C19 16 16 19 12 20.5C8 19 5 16 5 12V6.5L12 3Z" />
    <path d="M9 12H15" />
    <path d="M12 9V15" />
  </I>
);

// ── Scanner (radar sweep) ───────────────────────────────────────────────────

export const ScannerIcon = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="1" fill={p.color || 'currentColor'} stroke="none" />
    <path d="M12 12L12 3" />
    <path d="M12 12L18 6" opacity="0.5" />
    <circle cx="15" cy="9" r="1" fill={p.color || 'currentColor'} opacity="0.5" stroke="none" />
    <circle cx="9" cy="15" r="0.8" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
  </I>
);

// ── Chip Pack (gacha box) ───────────────────────────────────────────────────

export const ChipPackBasic = (p: IconProps) => (
  <I {...p}>
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M4 10H20" />
    <path d="M10 10V6" />
    <path d="M14 10V6" />
    <rect x="9" y="13" width="6" height="4" rx="1" fill={p.color || 'currentColor'} opacity="0.2" stroke="none" />
    <text x="12" y="16.5" textAnchor="middle" fontSize="4" fill={p.color || 'currentColor'} stroke="none" fontWeight="bold">?</text>
  </I>
);

export const ChipPackPremium = (p: IconProps) => (
  <I {...p}>
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M4 10H20" />
    <path d="M10 10V6" />
    <path d="M14 10V6" />
    <rect x="8" y="12.5" width="8" height="5" rx="1" fill={p.color || 'currentColor'} opacity="0.3" stroke="none" />
    <path d="M12 13L13.5 15L12 14.5L10.5 15Z" fill={p.color || 'currentColor'} stroke="none" />
  </I>
);

// ── Special pickaxes ────────────────────────────────────────────────────────

export const MemoryAllocator = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 3.5L20.5 9.5" />
    <path d="M15 9L3.5 20.5" />
    {/* Circuit pattern on head */}
    <rect x="14" y="3" width="8" height="8" rx="1" fill={p.color || 'currentColor'} opacity="0.15" stroke="none" transform="rotate(45 18 7)" />
    <line x1="16" y1="5" x2="19" y2="5" opacity="0.5" />
    <line x1="16" y1="7" x2="19" y2="7" opacity="0.5" />
    <line x1="16" y1="9" x2="19" y2="9" opacity="0.5" />
  </I>
);

export const FullstackPickaxe = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 3.5L20.5 9.5" />
    <path d="M15 9L3.5 20.5" />
    <path d="M13 5L19 11" />
    <path d="M12 6L18 12" />
    {/* Star emblem */}
    <path d="M17.5 6.5L18.2 5L18.9 6.5L20.5 6.5L19.3 7.5L19.7 9L17.5 7.8L15.3 9L15.7 7.5L14.5 6.5Z" fill={p.color || 'currentColor'} stroke="none" />
  </I>
);

// ── Chip icons (all share base shape, vary by detail) ───────────────────────

const ChipBase = ({ children, ...p }: IconProps & { children?: React.ReactNode }) => (
  <I {...p}>
    {/* Base chip shape — rounded square with corner pins */}
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <line x1="8" y1="6" x2="8" y2="4" />
    <line x1="12" y1="6" x2="12" y2="4" />
    <line x1="16" y1="6" x2="16" y2="4" />
    <line x1="8" y1="18" x2="8" y2="20" />
    <line x1="12" y1="18" x2="12" y2="20" />
    <line x1="16" y1="18" x2="16" y2="20" />
    {children}
  </I>
);

export const ChipSpeed = (p: IconProps) => (
  <ChipBase {...p}>
    <path d="M13 9L11 12H13L11 15" fill="none" />
  </ChipBase>
);

export const ChipDefense = (p: IconProps) => (
  <ChipBase {...p}>
    <path d="M12 9L15 11V13.5C15 15 13.5 16 12 16.5C10.5 16 9 15 9 13.5V11L12 9Z" fill={p.color || 'currentColor'} opacity="0.2" stroke="none" />
  </ChipBase>
);

export const ChipHarvest = (p: IconProps) => (
  <ChipBase {...p}>
    <circle cx="12" cy="12" r="2.5" />
    <line x1="12" y1="9" x2="12" y2="9.5" />
    <line x1="12" y1="14.5" x2="12" y2="15" />
    <line x1="9" y1="12" x2="9.5" y2="12" />
    <line x1="14.5" y1="12" x2="15" y2="12" />
  </ChipBase>
);

export const ChipCapacity = (p: IconProps) => (
  <ChipBase {...p}>
    <rect x="9" y="9" width="6" height="6" rx="0.5" fill={p.color || 'currentColor'} opacity="0.15" stroke="none" />
    <path d="M10.5 12H13.5M12 10.5V13.5" />
  </ChipBase>
);

export const ChipGeneric = (p: IconProps) => (
  <ChipBase {...p}>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill={p.color || 'currentColor'} opacity="0.2" stroke="none" />
  </ChipBase>
);
