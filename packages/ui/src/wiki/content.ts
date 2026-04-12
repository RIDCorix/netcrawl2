/**
 * NetCrawl In-Game Wiki — content tree.
 *
 * Flat, strongly-typed registry of chapters and entries.
 * Each entry declares an unlock rule (player level / quests completed / layer).
 * Strings are i18n keys resolved via useT().
 */

import {
  PickaxeBasic, PickaxeIron, PickaxeDiamond, FullstackPickaxe, MemoryAllocator,
  CpuBasic, CpuAdvanced, RamBasic, RamAdvanced,
  ShieldIcon, BeaconIcon, AntivirusIcon, ScannerIcon,
  ChipPackBasic, ChipPackPremium,
} from '../components/icons/GameIcons';
import {
  Bot, Server, Network, Cpu as CpuLucide, HardDrive, Database, Shield as ShieldLucide,
  Radar, Share2, Lock, AlertTriangle, Box, Sparkles, BookOpen, Zap, Terminal, Binary,
  Pickaxe as PickaxeLucide, Route as RouteLucide, Cable,
} from 'lucide-react';

// Permissive icon type covering both lucide-react (ForwardRef) and our custom
// SVG components in ./icons/GameIcons (plain functional).
export type IconCmp = any;

export interface UnlockRule {
  /** Minimum player level to auto-unlock this entry (optional). */
  level?: number;
  /** Minimum number of completed quests (optional). */
  questsCompleted?: number;
  /** Active layer index (chapter) that must be reached (optional). */
  layer?: number;
  /** If true, this entry is always visible (free / tutorial). */
  always?: boolean;
  /** Recipe id that must be unlocked (via quest reward) before this entry is visible. */
  unlockedRecipe?: string;
}

export interface WikiField {
  /** i18n key for label, or plain text. */
  label: string;
  /** i18n key for value, or plain text. */
  value: string;
}

export interface WikiEntry {
  id: string;
  icon: IconCmp;
  color?: string;
  /** i18n key. */
  title: string;
  /** i18n key. */
  summary: string;
  /** i18n keys (array of paragraphs). */
  body?: string[];
  /** Structured key/value list shown as a spec table. */
  fields?: WikiField[];
  unlock: UnlockRule;
  /** Reward granted when this entry is first unlocked (optional). */
  reward?: { kind: 'credits' | 'rp' | 'data'; amount: number };
  /** Key into WIKI_DEMOS registry for an interactive code demo (DemoPlayer).
   *  Only used for SDK-related entries like equipment (pickaxe, CPU, RAM). */
  demoScriptId?: string;
}

export interface WikiSection {
  id: string;
  icon: IconCmp;
  color?: string;
  title: string;
  entries: WikiEntry[];
}

export interface WikiCategory {
  id: string;
  icon: IconCmp;
  color: string;
  title: string;
  sections: WikiSection[];
}

// ─── content ───────────────────────────────────────────────────────────────

export const WIKI: WikiCategory[] = [
  {
    id: 'intro',
    title: 'wiki.cat.intro',
    icon: BookOpen,
    color: '#00d4aa',
    sections: [
      {
        id: 'overview',
        title: 'wiki.section.overview',
        icon: Terminal,
        entries: [
          {
            id: 'welcome',
            icon: Sparkles,
            title: 'wiki.entry.welcome.title',
            summary: 'wiki.entry.welcome.summary',
            body: ['wiki.entry.welcome.body1', 'wiki.entry.welcome.body2'],
            unlock: { always: true },
          },
          {
            id: 'how-to-read',
            icon: BookOpen,
            title: 'wiki.entry.how_to_read.title',
            summary: 'wiki.entry.how_to_read.summary',
            body: ['wiki.entry.how_to_read.body1'],
            unlock: { always: true },
          },
        ],
      },
    ],
  },

  {
    id: 'nodes',
    title: 'wiki.cat.nodes',
    icon: Network,
    color: '#a78bfa',
    sections: [
      {
        id: 'node-types',
        title: 'wiki.section.node_types',
        icon: Share2,
        entries: [
          {
            id: 'hub',
            icon: Server,
            color: '#00d4aa',
            title: 'wiki.entry.hub.title',
            summary: 'wiki.entry.hub.summary',
            body: ['wiki.entry.hub.body1'],
            fields: [
              { label: 'wiki.field.role', value: 'wiki.entry.hub.role' },
              { label: 'wiki.field.dropable', value: 'wiki.yes' },
            ],
            unlock: { always: true },
          },
          {
            id: 'resource',
            icon: Database,
            color: '#45aaf2',
            title: 'wiki.entry.resource.title',
            summary: 'wiki.entry.resource.summary',
            body: ['wiki.entry.resource.body1', 'wiki.entry.resource.body2'],
            fields: [
              { label: 'wiki.field.mineable', value: 'wiki.yes' },
              { label: 'wiki.field.defense', value: 'wiki.entry.resource.defense' },
            ],
            unlock: { always: true },
          },
          {
            id: 'relay',
            icon: Cable,
            color: '#60a5fa',
            title: 'wiki.entry.relay.title',
            summary: 'wiki.entry.relay.summary',
            body: ['wiki.entry.relay.body1'],
            unlock: { questsCompleted: 3 },
            reward: { kind: 'credits', amount: 50 },
          },
          {
            id: 'locked',
            icon: Lock,
            color: '#9ca3af',
            title: 'wiki.entry.locked.title',
            summary: 'wiki.entry.locked.summary',
            body: ['wiki.entry.locked.body1'],
            unlock: { always: true },
          },
          {
            id: 'infected',
            icon: AlertTriangle,
            color: '#ef4444',
            title: 'wiki.entry.infected.title',
            summary: 'wiki.entry.infected.summary',
            body: ['wiki.entry.infected.body1', 'wiki.entry.infected.body2'],
            unlock: { level: 3 },
            reward: { kind: 'rp', amount: 25 },
          },
        ],
      },
    ],
  },

  {
    id: 'workers',
    title: 'wiki.cat.workers',
    icon: Bot,
    color: '#60a5fa',
    sections: [
      {
        id: 'deploy-specs',
        title: 'wiki.section.deploy_specs',
        icon: RouteLucide,
        entries: [
          {
            id: 'spec-edge',
            icon: Cable,
            color: '#60a5fa',
            title: 'wiki.entry.spec_edge.title',
            summary: 'wiki.entry.spec_edge.summary',
            body: ['wiki.entry.spec_edge.body1'],
            fields: [
              { label: 'wiki.field.type', value: 'Edge' },
              { label: 'wiki.field.input', value: 'wiki.entry.spec_edge.input' },
            ],
            unlock: { always: true },
          },
          {
            id: 'spec-route',
            icon: RouteLucide,
            color: '#a78bfa',
            title: 'wiki.entry.spec_route.title',
            summary: 'wiki.entry.spec_route.summary',
            body: ['wiki.entry.spec_route.body1'],
            fields: [
              { label: 'wiki.field.type', value: 'Route' },
              { label: 'wiki.field.input', value: 'wiki.entry.spec_route.input' },
            ],
            unlock: { level: 2 },
            reward: { kind: 'credits', amount: 30 },
          },
          {
            id: 'spec-node',
            icon: Server,
            color: '#00d4aa',
            title: 'wiki.entry.spec_node.title',
            summary: 'wiki.entry.spec_node.summary',
            body: ['wiki.entry.spec_node.body1'],
            fields: [
              { label: 'wiki.field.type', value: 'Node' },
            ],
            unlock: { always: true },
          },
        ],
      },
      {
        id: 'deploy-equipment',
        title: 'wiki.section.deploy_equipment',
        icon: HardDrive,
        entries: [
          {
            id: 'pickaxe_basic',
            icon: PickaxeBasic,
            color: '#9ca3af',
            title: 'wiki.entry.pickaxe_basic.title',
            summary: 'wiki.entry.pickaxe_basic.summary',
            body: ['wiki.entry.pickaxe_basic.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.pickaxe_basic.effect' },
              { label: 'wiki.field.slot', value: 'Pickaxe' },
            ],
            unlock: { unlockedRecipe: 'pickaxe_basic' },
            reward: { kind: 'credits', amount: 10 },
            demoScriptId: 'wiki_pickaxe',
          },
          {
            id: 'pickaxe_iron',
            icon: PickaxeIron,
            color: '#c0c0c0',
            title: 'wiki.entry.pickaxe_iron.title',
            summary: 'wiki.entry.pickaxe_iron.summary',
            body: ['wiki.entry.pickaxe_iron.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.pickaxe_iron.effect' },
              { label: 'wiki.field.slot', value: 'Pickaxe' },
            ],
            unlock: { unlockedRecipe: 'pickaxe_iron' },
            reward: { kind: 'credits', amount: 20 },
          },
          {
            id: 'pickaxe_diamond',
            icon: PickaxeDiamond,
            color: '#60a5fa',
            title: 'wiki.entry.pickaxe_diamond.title',
            summary: 'wiki.entry.pickaxe_diamond.summary',
            body: ['wiki.entry.pickaxe_diamond.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.pickaxe_diamond.effect' },
              { label: 'wiki.field.slot', value: 'Pickaxe' },
            ],
            unlock: { unlockedRecipe: 'pickaxe_diamond' },
            reward: { kind: 'credits', amount: 50 },
          },
          {
            id: 'fullstack_pickaxe',
            icon: FullstackPickaxe,
            color: '#fbbf24',
            title: 'wiki.entry.fullstack_pickaxe.title',
            summary: 'wiki.entry.fullstack_pickaxe.summary',
            body: ['wiki.entry.fullstack_pickaxe.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.fullstack_pickaxe.effect' },
              { label: 'wiki.field.slot', value: 'Pickaxe' },
            ],
            unlock: { level: 10, questsCompleted: 15 },
            reward: { kind: 'rp', amount: 100 },
          },
          {
            id: 'memory_allocator',
            icon: MemoryAllocator,
            color: '#a78bfa',
            title: 'wiki.entry.memory_allocator.title',
            summary: 'wiki.entry.memory_allocator.summary',
            body: ['wiki.entry.memory_allocator.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.memory_allocator.effect' },
              { label: 'wiki.field.slot', value: 'Pickaxe' },
            ],
            unlock: { level: 8 },
            reward: { kind: 'credits', amount: 120 },
          },
          {
            id: 'cpu_basic',
            icon: CpuBasic,
            color: '#f59e0b',
            title: 'wiki.entry.cpu_basic.title',
            summary: 'wiki.entry.cpu_basic.summary',
            body: ['wiki.entry.cpu_basic.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.cpu_basic.effect' },
              { label: 'wiki.field.slot', value: 'CPU' },
            ],
            unlock: { unlockedRecipe: 'cpu_basic' },
            reward: { kind: 'credits', amount: 10 },
            demoScriptId: 'wiki_cpu',
          },
          {
            id: 'cpu_advanced',
            icon: CpuAdvanced,
            color: '#f97316',
            title: 'wiki.entry.cpu_advanced.title',
            summary: 'wiki.entry.cpu_advanced.summary',
            body: ['wiki.entry.cpu_advanced.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.cpu_advanced.effect' },
              { label: 'wiki.field.slot', value: 'CPU' },
            ],
            unlock: { unlockedRecipe: 'cpu_advanced' },
            reward: { kind: 'credits', amount: 30 },
          },
          {
            id: 'ram_basic',
            icon: RamBasic,
            color: '#a78bfa',
            title: 'wiki.entry.ram_basic.title',
            summary: 'wiki.entry.ram_basic.summary',
            body: ['wiki.entry.ram_basic.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.ram_basic.effect' },
              { label: 'wiki.field.slot', value: 'RAM' },
            ],
            unlock: { unlockedRecipe: 'ram_basic' },
            reward: { kind: 'credits', amount: 10 },
            demoScriptId: 'wiki_ram',
          },
          {
            id: 'ram_advanced',
            icon: RamAdvanced,
            color: '#8b5cf6',
            title: 'wiki.entry.ram_advanced.title',
            summary: 'wiki.entry.ram_advanced.summary',
            body: ['wiki.entry.ram_advanced.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.ram_advanced.effect' },
              { label: 'wiki.field.slot', value: 'RAM' },
            ],
            unlock: { unlockedRecipe: 'ram_advanced' },
            reward: { kind: 'credits', amount: 30 },
          },
          {
            id: 'shield',
            icon: ShieldIcon,
            color: '#4ade80',
            title: 'wiki.entry.shield.title',
            summary: 'wiki.entry.shield.summary',
            body: ['wiki.entry.shield.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.shield.effect' },
              { label: 'wiki.field.slot', value: 'Gadget' },
            ],
            unlock: { unlockedRecipe: 'shield' },
            reward: { kind: 'credits', amount: 10 },
          },
          {
            id: 'beacon',
            icon: BeaconIcon,
            color: '#00d4aa',
            title: 'wiki.entry.beacon.title',
            summary: 'wiki.entry.beacon.summary',
            body: ['wiki.entry.beacon.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.beacon.effect' },
              { label: 'wiki.field.slot', value: 'Gadget' },
            ],
            unlock: { unlockedRecipe: 'beacon' },
            reward: { kind: 'credits', amount: 10 },
          },
          {
            id: 'scanner',
            icon: ScannerIcon,
            color: '#60a5fa',
            title: 'wiki.entry.scanner.title',
            summary: 'wiki.entry.scanner.summary',
            body: ['wiki.entry.scanner.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.scanner.effect' },
              { label: 'wiki.field.slot', value: 'Gadget' },
            ],
            unlock: { unlockedRecipe: 'scanner' },
            reward: { kind: 'credits', amount: 20 },
          },
          {
            id: 'antivirus_module',
            icon: AntivirusIcon,
            color: '#ef4444',
            title: 'wiki.entry.antivirus_module.title',
            summary: 'wiki.entry.antivirus_module.summary',
            body: ['wiki.entry.antivirus_module.body1'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.antivirus_module.effect' },
              { label: 'wiki.field.slot', value: 'Gadget' },
            ],
            unlock: { level: 6 },
            reward: { kind: 'rp', amount: 40 },
          },
        ],
      },
    ],
  },

  {
    id: 'chips',
    title: 'wiki.cat.chips',
    icon: Zap,
    color: '#fbbf24',
    sections: [
      {
        id: 'node-chips',
        title: 'wiki.section.node_chips',
        icon: Cable,
        entries: [
          {
            id: 'chip_node_buffer',
            icon: Database,
            color: '#00d4aa',
            title: 'wiki.entry.chip_node_buffer.title',
            summary: 'wiki.entry.chip_node_buffer.summary',
            body: ['wiki.entry.chip_node_buffer.body1', 'wiki.entry.chip_node_buffer.body2'],
            fields: [
              { label: 'wiki.field.effect', value: 'wiki.entry.chip_node_buffer.effect' },
              { label: 'wiki.field.slot', value: 'Node chip slot' },
            ],
            unlock: { level: 3 },
            reward: { kind: 'credits', amount: 40 },
          },
        ],
      },
    ],
  },

  {
    id: 'items',
    title: 'wiki.cat.items',
    icon: Box,
    color: '#f59e0b',
    sections: [
      {
        id: 'resources',
        title: 'wiki.section.resources',
        icon: Binary,
        entries: [
          {
            id: 'data_fragment',
            icon: Database,
            color: '#45aaf2',
            title: 'wiki.entry.data_fragment.title',
            summary: 'wiki.entry.data_fragment.summary',
            body: ['wiki.entry.data_fragment.body1'],
            unlock: { always: true },
          },
          {
            id: 'rp_shard',
            icon: Sparkles,
            color: '#a78bfa',
            title: 'wiki.entry.rp_shard.title',
            summary: 'wiki.entry.rp_shard.summary',
            body: ['wiki.entry.rp_shard.body1'],
            unlock: { always: true },
          },
          {
            id: 'bad_data',
            icon: AlertTriangle,
            color: '#ef4444',
            title: 'wiki.entry.bad_data.title',
            summary: 'wiki.entry.bad_data.summary',
            body: ['wiki.entry.bad_data.body1'],
            unlock: { level: 2 },
          },
        ],
      },
      {
        id: 'chip-packs',
        title: 'wiki.section.chip_packs',
        icon: Zap,
        entries: [
          {
            id: 'chip_pack_basic',
            icon: ChipPackBasic,
            color: '#9ca3af',
            title: 'wiki.entry.chip_pack_basic.title',
            summary: 'wiki.entry.chip_pack_basic.summary',
            body: ['wiki.entry.chip_pack_basic.body1'],
            unlock: { level: 2 },
          },
          {
            id: 'chip_pack_premium',
            icon: ChipPackPremium,
            color: '#f59e0b',
            title: 'wiki.entry.chip_pack_premium.title',
            summary: 'wiki.entry.chip_pack_premium.summary',
            body: ['wiki.entry.chip_pack_premium.body1'],
            unlock: { level: 5 },
            reward: { kind: 'credits', amount: 75 },
          },
        ],
      },
    ],
  },
];

// ─── lookup helpers ─────────────────────────────────────────────────────────

/** Flat entry lookup by id (first match wins). */
export function findEntry(entryId: string): { category: WikiCategory; section: WikiSection; entry: WikiEntry } | null {
  for (const category of WIKI) {
    for (const section of category.sections) {
      for (const entry of section.entries) {
        if (entry.id === entryId) return { category, section, entry };
      }
    }
  }
  return null;
}

/**
 * Map an in-game item type (as stored in player inventory) to a wiki entry id.
 * Unmapped types return null and the cell hint stays hidden.
 */
export function wikiIdForItem(itemType: string): string | null {
  // Identity mapping covers most cases (entries share the item type id).
  const known = new Set([
    'pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond', 'fullstack_pickaxe',
    'memory_allocator', 'shield', 'beacon', 'scanner', 'antivirus_module',
    'cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced',
    'data_fragment', 'rp_shard', 'bad_data',
    'chip_pack_basic', 'chip_pack_premium',
  ]);
  return known.has(itemType) ? itemType : null;
}

/** Map a node type string to a wiki entry id. */
export function wikiIdForNodeType(nodeType: string): string | null {
  const map: Record<string, string> = {
    hub: 'hub',
    resource: 'resource',
    relay: 'relay',
    locked: 'locked',
    infected: 'infected',
  };
  return map[nodeType] || null;
}

// ─── unlock evaluation ──────────────────────────────────────────────────────

export interface PlayerProgress {
  level: number;
  questsCompleted: number;
  activeLayer: number;
  unlockedRecipes: string[];
}

export function isEntryUnlocked(rule: UnlockRule, p: PlayerProgress): boolean {
  if (rule.always) return true;
  if (rule.level !== undefined && p.level < rule.level) return false;
  if (rule.questsCompleted !== undefined && p.questsCompleted < rule.questsCompleted) return false;
  if (rule.layer !== undefined && p.activeLayer < rule.layer) return false;
  if (rule.unlockedRecipe !== undefined && !p.unlockedRecipes.includes(rule.unlockedRecipe)) return false;
  return true;
}

/** All currently-unlocked entry ids for a given progress snapshot. */
export function computeUnlockedEntryIds(p: PlayerProgress): string[] {
  const out: string[] = [];
  for (const category of WIKI) {
    for (const section of category.sections) {
      for (const entry of section.entries) {
        if (isEntryUnlocked(entry.unlock, p)) out.push(entry.id);
      }
    }
  }
  return out;
}
