/**
 * icons.ts
 *
 * Available icons for worker classes.
 * These map to lucide-react icon components in the UI.
 */

export const Icon = {
  // Default
  BOT: 'Bot',

  // Mining / Resources
  PICKAXE: 'Pickaxe',
  HAMMER: 'Hammer',
  WRENCH: 'Wrench',
  COG: 'Cog',
  DRILL: 'Drill',

  // Combat / Defense
  SHIELD: 'Shield',
  SHIELD_CHECK: 'ShieldCheck',
  SWORD: 'Swords',
  BUG: 'Bug',

  // Exploration / Scanning
  RADAR: 'Radar',
  SEARCH: 'Search',
  EYE: 'Eye',
  COMPASS: 'Compass',
  MAP: 'Map',
  SCAN: 'ScanLine',
  ANTENNA: 'Antenna',
  SATELLITE: 'Satellite',

  // Transport / Movement
  TRUCK: 'Truck',
  SEND: 'Send',
  ROUTE: 'Route',
  ARROW_RIGHT: 'ArrowRight',
  WORKFLOW: 'Workflow',

  // Compute / Data
  CPU: 'Cpu',
  DATABASE: 'Database',
  HARD_DRIVE: 'HardDrive',
  TERMINAL: 'Terminal',
  CODE: 'Code',
  BINARY: 'Binary',
  BRACES: 'Braces',

  // Network / Communication
  GLOBE: 'Globe',
  WIFI: 'Wifi',
  NETWORK: 'Network',
  RADIO: 'Radio',
  SIGNAL: 'Signal',

  // Utility
  ZAP: 'Zap',
  GAUGE: 'Gauge',
  TIMER: 'Timer',
  FLASK: 'FlaskConical',
  MICROSCOPE: 'Microscope',
  SPARKLES: 'Sparkles',
  CROWN: 'Crown',
  STAR: 'Star',
} as const;

export type IconName = (typeof Icon)[keyof typeof Icon];
