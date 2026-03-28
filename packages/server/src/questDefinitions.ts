/**
 * Quest definitions — 24 quests across 6 chapters teaching programming concepts.
 */

import type { RecipeCost, Resources } from './db.js';
import type { ChipRarity } from './upgradeDefinitions.js';
import { QUEST_GUIDES } from './questGuides.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestObjective {
  id: string;
  description: string;
  statKey: string;
  target: number;
  type: 'stat_gte' | 'stat_array_includes' | 'stat_array_length';
  statArrayValue?: string;
}

export type RewardType =
  | { kind: 'passive'; effectId: string; description: string; effect: Record<string, number> }
  | { kind: 'recipe_unlock'; recipeId: string; name: string }
  | { kind: 'items'; items: Array<{ itemType: string; count: number; metadata?: any }> }
  | { kind: 'chips'; chips: Array<{ chipType: string; rarity: ChipRarity }> }
  | { kind: 'unique_equipment'; itemType: string; name: string; description: string; metadata: any }
  | { kind: 'resources'; resources: Partial<Resources> };

export interface GuideStep {
  title: string;
  content: string; // supports simple markdown-like formatting
}

export interface QuestDef {
  id: string;
  chapter: number;
  name: string;
  description: string;
  codeConcept: string;
  sideQuest: boolean;
  prerequisites: string[];
  objectives: QuestObjective[];
  rewards: RewardType[];
  position: { x: number; y: number };
  guide?: GuideStep[];
}

// ── Chapter colors ──────────────────────────────────────────────────────────

export const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80',
  2: '#60a5fa',
  3: '#a78bfa',
  4: '#ef4444',
  5: '#f59e0b',
  6: '#00d4aa',
};

export const CHAPTER_NAMES: Record<number, string> = {
  1: 'Basics',
  2: 'Automation',
  3: 'Networking',
  4: 'Defense',
  5: 'Optimization',
  6: 'Mastery',
};

// ── Quest definitions ───────────────────────────────────────────────────────

export const QUESTS: QuestDef[] = [
  // ── Chapter 1: Basics ─────────────────────────────────────────────────────
  {
    id: 'q_hello_world', chapter: 1, name: 'Hello, World!', codeConcept: 'Running Code',
    description: 'Every journey begins with a single deployment. Deploy your first worker to the network.',
    sideQuest: false, prerequisites: [],
    objectives: [{ id: 'o1', description: 'Deploy 1 worker', statKey: 'total_workers_deployed', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { energy: 50 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_first_harvest', chapter: 1, name: 'Gather Data', codeConcept: 'Return Values',
    description: 'Functions return values. Mine a resource node to see what comes back.',
    sideQuest: false, prerequisites: ['q_hello_world'],
    objectives: [{ id: 'o1', description: 'Mine a resource node', statKey: 'total_mines', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } }] }],
    position: { x: 400, y: 120 },
  },
  {
    id: 'q_bring_it_home', chapter: 1, name: 'Return Statement', codeConcept: 'Functions',
    description: 'A function that computes but never returns is useless. Bring resources back to the hub.',
    sideQuest: false, prerequisites: ['q_first_harvest'],
    objectives: [{ id: 'o1', description: 'Deposit resources at hub', statKey: 'total_deposits', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { ore: 30 } }],
    position: { x: 400, y: 240 },
  },
  {
    id: 'q_expand_network', chapter: 1, name: 'Import Module', codeConcept: 'Imports',
    description: 'Expand your capabilities by importing new modules. Unlock a node to grow your network.',
    sideQuest: false, prerequisites: ['q_bring_it_home'],
    objectives: [{ id: 'o1', description: 'Unlock 1 node', statKey: 'total_nodes_unlocked', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'harvest_speed_5', description: '+5% global harvest speed', effect: { global_harvest_speed_mult: 1.05 } }],
    position: { x: 400, y: 360 },
  },
  {
    id: 'q_variable_types', chapter: 1, name: 'Variable Types', codeConcept: 'Data Types',
    description: 'Python has many types: int, str, float. Your network has energy, ore, and data.',
    sideQuest: true, prerequisites: ['q_expand_network'],
    objectives: [
      { id: 'o1', description: 'Deposit ore', statKey: 'total_ore_deposited', target: 1, type: 'stat_gte' },
      { id: 'o2', description: 'Deposit energy', statKey: 'total_energy_deposited', target: 1, type: 'stat_gte' },
      { id: 'o3', description: 'Deposit data', statKey: 'total_data_deposited', target: 1, type: 'stat_gte' },
    ],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'harvest_speed_1', rarity: 'common' }] }],
    position: { x: 620, y: 360 },
  },

  // ── Chapter 2: Automation ─────────────────────────────────────────────────
  {
    id: 'q_for_loop', chapter: 2, name: 'For Loop', codeConcept: 'Loops',
    description: 'Why do something once when you can loop? Scale up your workforce.',
    sideQuest: false, prerequisites: ['q_expand_network'],
    objectives: [{ id: 'o1', description: 'Deploy 3 workers total', statKey: 'total_workers_deployed', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { energy: 100 } }],
    position: { x: 400, y: 480 },
  },
  {
    id: 'q_batch_processing', chapter: 2, name: 'Batch Processing', codeConcept: 'Iteration',
    description: 'Process items in batches for efficiency. Mine resources repeatedly.',
    sideQuest: false, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Mine 10 times', statKey: 'total_mines', target: 10, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'scanner', name: 'Scanner' }],
    position: { x: 400, y: 600 },
  },
  {
    id: 'q_accumulator', chapter: 2, name: 'Accumulator Pattern', codeConcept: 'State',
    description: 'total = 0; for item in items: total += item. Accumulate 100 ore.',
    sideQuest: false, prerequisites: ['q_batch_processing'],
    objectives: [{ id: 'o1', description: 'Deposit 100 ore total', statKey: 'total_ore_deposited', target: 100, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } }] }],
    position: { x: 400, y: 720 },
  },
  {
    id: 'q_list_comprehension', chapter: 2, name: 'List Comprehension', codeConcept: 'Concise Code',
    description: '[craft(x) for x in materials] -- craft multiple items efficiently.',
    sideQuest: true, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Craft 3 items', statKey: 'total_crafts', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'chip_pack_basic', count: 1 }] }],
    position: { x: 200, y: 540 },
  },
  {
    id: 'q_error_handling', chapter: 2, name: 'Try / Except', codeConcept: 'Error Handling',
    description: 'Things break. The key is recovering. Deploy enough workers to learn resilience.',
    sideQuest: true, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Deploy 5 workers total', statKey: 'total_workers_deployed', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'shield', count: 1 }] }],
    position: { x: 600, y: 540 },
  },

  // ── Chapter 3: Networking ─────────────────────────────────────────────────
  {
    id: 'q_graph_theory', chapter: 3, name: 'Graph Theory', codeConcept: 'Graphs',
    description: 'Networks are graphs: nodes connected by edges. Expand yours.',
    sideQuest: false, prerequisites: ['q_accumulator'],
    objectives: [{ id: 'o1', description: 'Unlock 3 nodes', statKey: 'total_nodes_unlocked', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'unlock_discount', description: '-10% node unlock cost', effect: { node_unlock_cost_mult: 0.9 } }],
    position: { x: 400, y: 840 },
  },
  {
    id: 'q_routing', chapter: 3, name: 'Packet Routing', codeConcept: 'BFS',
    description: 'Data packets find the shortest path. Diversify your resource streams.',
    sideQuest: false, prerequisites: ['q_graph_theory'],
    objectives: [
      { id: 'o1', description: 'Deposit 10+ ore', statKey: 'total_ore_deposited', target: 10, type: 'stat_gte' },
      { id: 'o2', description: 'Deposit 10+ energy', statKey: 'total_energy_deposited', target: 10, type: 'stat_gte' },
    ],
    rewards: [{ kind: 'items', items: [{ itemType: 'beacon', count: 2 }] }],
    position: { x: 400, y: 960 },
  },
  {
    id: 'q_relay_network', chapter: 3, name: 'Relay Network', codeConcept: 'Topology',
    description: 'Build redundant paths through relay nodes for a resilient network.',
    sideQuest: false, prerequisites: ['q_routing'],
    objectives: [{ id: 'o1', description: 'Unlock 4 nodes', statKey: 'total_nodes_unlocked', target: 4, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'signal_booster', name: 'Signal Booster' }],
    position: { x: 400, y: 1080 },
  },
  {
    id: 'q_dns_lookup', chapter: 3, name: 'DNS Lookup', codeConcept: 'Name Resolution',
    description: 'Explore the network from multiple vantage points.',
    sideQuest: true, prerequisites: ['q_graph_theory'],
    objectives: [{ id: 'o1', description: 'Deploy 6 workers total', statKey: 'total_workers_deployed', target: 6, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'move_speed_1', rarity: 'common' }] }],
    position: { x: 620, y: 900 },
  },

  // ── Chapter 4: Defense ────────────────────────────────────────────────────
  {
    id: 'q_if_statement', chapter: 4, name: 'If Statement', codeConcept: 'Conditionals',
    description: 'if node.infected: repair(node). Deploy guardians to defend your network.',
    sideQuest: false, prerequisites: ['q_relay_network'],
    objectives: [{ id: 'o1', description: 'Repair an infected node', statKey: 'total_repairs', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'defense_1', description: '+1 global defense', effect: { global_defense_bonus: 1 } }],
    position: { x: 400, y: 1200 },
  },
  {
    id: 'q_firewall', chapter: 4, name: 'Firewall Rules', codeConcept: 'Logic',
    description: 'Layer your defenses with conditional rules. Install chips for protection.',
    sideQuest: false, prerequisites: ['q_if_statement'],
    objectives: [{ id: 'o1', description: 'Install 2 chips', statKey: 'total_chips_installed', target: 2, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'defense_2', rarity: 'rare' }] }],
    position: { x: 400, y: 1320 },
  },
  {
    id: 'q_antivirus', chapter: 4, name: 'Antivirus Scan', codeConcept: 'Pattern Matching',
    description: 'Build a dedicated virus scanner. Master the repair cycle.',
    sideQuest: true, prerequisites: ['q_if_statement'],
    objectives: [{ id: 'o1', description: 'Repair 3 infections', statKey: 'total_repairs', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'unique_equipment', itemType: 'antivirus_module', name: 'Antivirus Module', description: 'Shield with auto-repair capability', metadata: { efficiency: 2.0, autoRepair: true } }],
    position: { x: 200, y: 1260 },
  },
  {
    id: 'q_redundancy', chapter: 4, name: 'Redundancy', codeConcept: 'Fault Tolerance',
    description: 'Never rely on a single point of failure. Scale your workforce.',
    sideQuest: true, prerequisites: ['q_if_statement'],
    objectives: [{ id: 'o1', description: 'Deploy 8 workers total', statKey: 'total_workers_deployed', target: 8, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { energy: 200, ore: 100 } }],
    position: { x: 600, y: 1260 },
  },

  // ── Chapter 5: Optimization ───────────────────────────────────────────────
  {
    id: 'q_profiling', chapter: 5, name: 'Profiling', codeConcept: 'Performance',
    description: 'Measure before you optimize. Upgrade a node to see the difference.',
    sideQuest: false, prerequisites: ['q_firewall'],
    objectives: [{ id: 'o1', description: 'Upgrade a node', statKey: 'total_upgrades', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'overclock_kit', name: 'Overclock Kit' }],
    position: { x: 400, y: 1440 },
  },
  {
    id: 'q_caching', chapter: 5, name: 'Caching', codeConcept: 'Memoization',
    description: 'Cache results to avoid redundant work. Max out a node for peak efficiency.',
    sideQuest: false, prerequisites: ['q_profiling'],
    objectives: [{ id: 'o1', description: 'Max upgrade a node (LV3)', statKey: 'max_node_level', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'harvest_speed_15', description: '+15% global harvest speed', effect: { global_harvest_speed_mult: 1.15 } }],
    position: { x: 400, y: 1560 },
  },
  {
    id: 'q_big_o', chapter: 5, name: 'Big O Notation', codeConcept: 'Complexity',
    description: 'Understand the cost of operations. Open packs to analyze chip distributions.',
    sideQuest: true, prerequisites: ['q_profiling'],
    objectives: [{ id: 'o1', description: 'Open 5 chip packs', statKey: 'total_packs_opened', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'production_rate_2', rarity: 'rare' }] }],
    position: { x: 200, y: 1500 },
  },
  {
    id: 'q_memory_mgmt', chapter: 5, name: 'Memory Management', codeConcept: 'Resources',
    description: 'Efficient memory use is key. Accumulate massive resource reserves.',
    sideQuest: true, prerequisites: ['q_profiling'],
    objectives: [
      { id: 'o1', description: 'Deposit 200+ ore', statKey: 'total_ore_deposited', target: 200, type: 'stat_gte' },
      { id: 'o2', description: 'Deposit 200+ energy', statKey: 'total_energy_deposited', target: 200, type: 'stat_gte' },
    ],
    rewards: [{ kind: 'unique_equipment', itemType: 'memory_allocator', name: 'Memory Allocator', description: 'Pickaxe with 3.0x efficiency', metadata: { efficiency: 3.0 } }],
    position: { x: 600, y: 1500 },
  },

  // ── Chapter 6: Mastery ────────────────────────────────────────────────────
  {
    id: 'q_design_patterns', chapter: 6, name: 'Design Patterns', codeConcept: 'Architecture',
    description: 'Master the fundamentals. Unlock the entire network and craft every tool.',
    sideQuest: false, prerequisites: ['q_caching'],
    objectives: [
      { id: 'o1', description: 'Unlock all nodes', statKey: 'total_nodes_unlocked', target: 6, type: 'stat_gte' },
      { id: 'o2', description: 'Craft all recipes', statKey: 'crafted_recipes', target: 5, type: 'stat_array_length' },
    ],
    rewards: [
      { kind: 'passive', effectId: 'harvest_speed_25', description: '+25% all resource rates', effect: { global_harvest_speed_mult: 1.25 } },
      { kind: 'chips', chips: [{ chipType: 'overclock', rarity: 'legendary' }] },
    ],
    position: { x: 400, y: 1680 },
  },
  {
    id: 'q_full_stack', chapter: 6, name: 'Full Stack Developer', codeConcept: 'Mastery',
    description: 'You\'ve learned it all. The network bends to your will.',
    sideQuest: false, prerequisites: ['q_design_patterns'],
    objectives: [
      { id: 'o1', description: 'Deploy 20 workers total', statKey: 'total_workers_deployed', target: 20, type: 'stat_gte' },
      { id: 'o2', description: 'Deposit 500+ ore', statKey: 'total_ore_deposited', target: 500, type: 'stat_gte' },
    ],
    rewards: [
      { kind: 'unique_equipment', itemType: 'fullstack_pickaxe', name: 'Full Stack Pickaxe', description: '5.0x efficiency legendary pickaxe', metadata: { efficiency: 5.0 } },
      { kind: 'passive', effectId: 'carry_capacity', description: 'Workers start with +20 carry capacity', effect: { global_capacity_bonus: 20 } },
    ],
    position: { x: 400, y: 1800 },
  },
];

// Attach guide steps to each quest
for (const q of QUESTS) {
  (q as any).guide = QUEST_GUIDES[q.id] || [{ title: q.name, content: q.description }];
}

// ── New unlockable recipes ──────────────────────────────────────────────────

export const UNLOCKABLE_RECIPES = [
  {
    id: 'scanner',
    name: 'Scanner',
    description: 'Increases scan radius for workers.',
    output: { itemType: 'scanner', count: 1 },
    cost: { data: 40, energy: 20 } as Record<string, number>,
  },
  {
    id: 'signal_booster',
    name: 'Signal Booster',
    description: 'Boosts relay node speed.',
    output: { itemType: 'signal_booster', count: 1 },
    cost: { ore: 60, energy: 40 } as Record<string, number>,
  },
  {
    id: 'overclock_kit',
    name: 'Overclock Kit',
    description: 'Temporary 2x speed boost.',
    output: { itemType: 'overclock_kit', count: 1 },
    cost: { ore: 80, energy: 60, data: 40 } as Record<string, number>,
  },
];
