/**
 * Quest definitions — FTB Quest Book style.
 *
 * Chapters are thematic pages. Within each chapter, quests form a DAG.
 * A "mainline" runs vertically through chapters (sequential gates).
 * Side quests branch off and can be done in any order within a chapter.
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
  content: string;
}

export interface QuestDef {
  id: string;
  chapter: number;
  name: string;
  description: string;
  codeConcept: string;
  mainline: boolean;     // part of the main sequential line
  prerequisites: string[];
  objectives: QuestObjective[];
  rewards: RewardType[];
  position: { x: number; y: number };
  guide?: GuideStep[];
}

// ── Chapter metadata ───────────────────────────────────────────────────────

export const CHAPTER_COLORS: Record<number, string> = {
  1: '#4ade80',   // Getting Started
  2: '#60a5fa',   // Automation
  3: '#a78bfa',   // Networking
  4: '#ef4444',   // Security
  5: '#f59e0b',   // Infrastructure
  6: '#00d4aa',   // Optimization
  7: '#ec4899',   // System Design
  8: '#8b5cf6',   // Mastery
};

export const CHAPTER_NAMES: Record<number, string> = {
  1: 'Getting Started',
  2: 'Automation',
  3: 'Networking',
  4: 'Security',
  5: 'Infrastructure',
  6: 'Optimization',
  7: 'System Design',
  8: 'Mastery',
};

export const CHAPTER_DESCRIPTIONS: Record<number, string> = {
  1: 'Deploy your first worker and learn the basics of the network.',
  2: 'Automate repetitive tasks with loops and patterns.',
  3: 'Expand your network and learn graph theory.',
  4: 'Defend against infections and learn security concepts.',
  5: 'Build structures and manage infrastructure.',
  6: 'Optimize performance with upgrades and caching.',
  7: 'Design resilient systems with real-world architecture patterns.',
  8: 'Master every concept and push your network to its limits.',
};

// ── Quest definitions ───────────────────────────────────────────────────────

export const QUESTS: QuestDef[] = [
  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 1: Getting Started
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_hello_world', chapter: 1, name: 'Hello, World!', codeConcept: 'Running Code',
    description: 'Every journey begins with a single deployment. Deploy your first worker.',
    mainline: true, prerequisites: [],
    objectives: [{ id: 'o1', description: 'Deploy 1 worker', statKey: 'total_workers_deployed', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 500 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_first_mine', chapter: 1, name: 'Gather Data', codeConcept: 'Return Values',
    description: 'Functions return values. Mine a resource node to see what comes back.',
    mainline: true, prerequisites: ['q_hello_world'],
    objectives: [{ id: 'o1', description: 'Mine a resource node', statKey: 'total_mines', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'pickaxe_basic', count: 1, metadata: { efficiency: 1.0 } }] }],
    position: { x: 400, y: 120 },
  },
  {
    id: 'q_first_deposit', chapter: 1, name: 'Return Statement', codeConcept: 'Functions',
    description: 'A function that computes but never returns is useless. Deposit resources at the hub.',
    mainline: true, prerequisites: ['q_first_mine'],
    objectives: [{ id: 'o1', description: 'Deposit at hub', statKey: 'total_deposits', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 300 } }],
    position: { x: 400, y: 240 },
  },
  {
    id: 'q_unlock_node', chapter: 1, name: 'Import Module', codeConcept: 'Imports',
    description: 'Expand your capabilities. Unlock a new node to grow the network.',
    mainline: true, prerequisites: ['q_first_deposit'],
    objectives: [{ id: 'o1', description: 'Unlock 1 node', statKey: 'total_nodes_unlocked', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'harvest_speed_5', description: '+5% harvest speed', effect: { global_harvest_speed_mult: 1.05 } }],
    position: { x: 400, y: 360 },
  },

  // ── Side quests ──
  {
    id: 'q_craft_first', chapter: 1, name: 'First Craft', codeConcept: 'Constructors',
    description: 'Create something new. Craft any item from the crafting menu.',
    mainline: false, prerequisites: ['q_first_deposit'],
    objectives: [{ id: 'o1', description: 'Craft 1 item', statKey: 'total_crafts', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 200 } }],
    position: { x: 200, y: 300 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 2: Automation
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_for_loop', chapter: 2, name: 'For Loop', codeConcept: 'Loops',
    description: 'Your worker\'s on_loop() runs forever. Make it mine 10 times.',
    mainline: true, prerequisites: ['q_unlock_node'],
    objectives: [{ id: 'o1', description: 'Mine 10 times', statKey: 'total_mines', target: 10, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 1000 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_accumulator', chapter: 2, name: 'Accumulator Pattern', codeConcept: 'State',
    description: 'total = 0; for item in items: total += item. Deposit 1,000 data total.',
    mainline: true, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Deposit 1,000 data', statKey: 'total_data_deposited', target: 1000, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } }] }],
    position: { x: 400, y: 120 },
  },
  {
    id: 'q_multiprocessing', chapter: 2, name: 'Multiprocessing', codeConcept: 'Concurrency',
    description: 'One worker is a thread. Deploy multiple for parallelism.',
    mainline: true, prerequisites: ['q_accumulator'],
    objectives: [{ id: 'o1', description: 'Have 3+ workers at once', statKey: 'total_workers_deployed', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'scanner', name: 'Scanner' }],
    position: { x: 400, y: 240 },
  },

  // ── Side quests ──
  {
    id: 'q_batch_craft', chapter: 2, name: 'Batch Processing', codeConcept: 'Iteration',
    description: '[craft(x) for x in materials] — craft multiple items.',
    mainline: false, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Craft 3 items', statKey: 'total_crafts', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'chip_pack_basic', count: 1 }] }],
    position: { x: 200, y: 60 },
  },
  {
    id: 'q_error_handling', chapter: 2, name: 'Try / Except', codeConcept: 'Error Handling',
    description: 'Things break. The key is recovering. Deploy 5 workers to learn resilience.',
    mainline: false, prerequisites: ['q_for_loop'],
    objectives: [{ id: 'o1', description: 'Deploy 5 workers total', statKey: 'total_workers_deployed', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'shield', count: 1 }] }],
    position: { x: 600, y: 60 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 3: Networking
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_graph_theory', chapter: 3, name: 'Graph Theory', codeConcept: 'Graphs',
    description: 'Networks are graphs: nodes connected by edges. Unlock 3 nodes.',
    mainline: true, prerequisites: ['q_multiprocessing'],
    objectives: [{ id: 'o1', description: 'Unlock 3 nodes', statKey: 'total_nodes_unlocked', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'unlock_discount', description: '-10% unlock cost', effect: { node_unlock_cost_mult: 0.9 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_routing', chapter: 3, name: 'Packet Routing', codeConcept: 'BFS / Pathfinding',
    description: 'Data finds the shortest path. Use move_through() with routes.',
    mainline: true, prerequisites: ['q_graph_theory'],
    objectives: [{ id: 'o1', description: 'Deposit 2,000 data', statKey: 'total_data_deposited', target: 2000, type: 'stat_gte' }],
    rewards: [{ kind: 'items', items: [{ itemType: 'beacon', count: 2 }] }],
    position: { x: 400, y: 120 },
  },

  // ── Side quests ──
  {
    id: 'q_dns', chapter: 3, name: 'DNS Resolution', codeConcept: 'Name Resolution',
    description: 'Use get_current_node() to resolve node info by position.',
    mainline: false, prerequisites: ['q_graph_theory'],
    objectives: [{ id: 'o1', description: 'Deploy 6 workers total', statKey: 'total_workers_deployed', target: 6, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'move_speed_1', rarity: 'common' }] }],
    position: { x: 600, y: 60 },
  },
  {
    id: 'q_relay_topology', chapter: 3, name: 'Network Topology', codeConcept: 'Topology',
    description: 'Relay nodes connect segments. Unlock 4 nodes to see the full topology.',
    mainline: false, prerequisites: ['q_graph_theory'],
    objectives: [{ id: 'o1', description: 'Unlock 4 nodes', statKey: 'total_nodes_unlocked', target: 4, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'signal_booster', name: 'Signal Booster' }],
    position: { x: 200, y: 60 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 4: Security
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_if_statement', chapter: 4, name: 'If Statement', codeConcept: 'Conditionals',
    description: 'if node.infected: repair(node). Repair your first infected node.',
    mainline: true, prerequisites: ['q_routing'],
    objectives: [{ id: 'o1', description: 'Repair 1 infected node', statKey: 'total_repairs', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'defense_1', description: '+1 global defense', effect: { global_defense_bonus: 1 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_firewall', chapter: 4, name: 'Firewall Rules', codeConcept: 'Input Validation',
    description: 'Validate before you act. Install chips to protect nodes.',
    mainline: true, prerequisites: ['q_if_statement'],
    objectives: [{ id: 'o1', description: 'Install 2 chips', statKey: 'total_chips_installed', target: 2, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'defense_2', rarity: 'rare' }] }],
    position: { x: 400, y: 120 },
  },

  // ── Side quests ──
  {
    id: 'q_antivirus', chapter: 4, name: 'Antivirus Daemon', codeConcept: 'Background Process',
    description: 'A Guardian worker that auto-repairs. Repair 3 infections total.',
    mainline: false, prerequisites: ['q_if_statement'],
    objectives: [{ id: 'o1', description: 'Repair 3 infections', statKey: 'total_repairs', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'unique_equipment', itemType: 'antivirus_module', name: 'Antivirus Module', description: 'Shield with auto-repair', metadata: { efficiency: 2.0, autoRepair: true } }],
    position: { x: 200, y: 60 },
  },
  {
    id: 'q_token_auth', chapter: 4, name: 'Token Auth', codeConcept: 'Authentication',
    description: 'Always check has_token before responding to API requests. Complete 5 API requests safely.',
    mainline: false, prerequisites: ['q_firewall'],
    objectives: [{ id: 'o1', description: 'Complete 5 API requests', statKey: 'total_api_requests_completed', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { credits: 10 } }],
    position: { x: 600, y: 120 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 5: Infrastructure
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_build_first', chapter: 5, name: 'First Structure', codeConcept: 'Infrastructure as Code',
    description: 'Build your first structure on an empty node. The network is yours to shape.',
    mainline: true, prerequisites: ['q_firewall'],
    objectives: [{ id: 'o1', description: 'Build a structure', statKey: 'total_structures_built', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 2000 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_compute_node', chapter: 5, name: 'Compute Service', codeConcept: 'Microservices',
    description: 'Solve compute puzzles to earn RP. Each service has a single responsibility.',
    mainline: true, prerequisites: ['q_build_first'],
    objectives: [{ id: 'o1', description: 'Solve 5 puzzles', statKey: 'total_puzzles_solved', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'recipe_unlock', recipeId: 'overclock_kit', name: 'Overclock Kit' }],
    position: { x: 400, y: 120 },
  },

  // ── Side quests ──
  {
    id: 'q_redundancy', chapter: 5, name: 'Redundancy', codeConcept: 'Fault Tolerance',
    description: 'Never rely on a single point of failure. Deploy 8 workers across the network.',
    mainline: false, prerequisites: ['q_build_first'],
    objectives: [{ id: 'o1', description: 'Deploy 8 workers total', statKey: 'total_workers_deployed', target: 8, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { data: 2000 } }],
    position: { x: 200, y: 60 },
  },
  {
    id: 'q_api_service', chapter: 5, name: 'API Gateway', codeConcept: 'API Design',
    description: 'Build an API node and serve your first external request.',
    mainline: false, prerequisites: ['q_build_first'],
    objectives: [{ id: 'o1', description: 'Complete 1 API request', statKey: 'total_api_requests_completed', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { credits: 5 } }],
    position: { x: 600, y: 60 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 6: Optimization
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_upgrade_node', chapter: 6, name: 'Profiling', codeConcept: 'Performance',
    description: 'Measure before optimizing. Upgrade a node to see the difference.',
    mainline: true, prerequisites: ['q_compute_node'],
    objectives: [{ id: 'o1', description: 'Upgrade a node', statKey: 'total_upgrades', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'harvest_speed_15', description: '+15% harvest speed', effect: { global_harvest_speed_mult: 1.15 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_max_upgrade', chapter: 6, name: 'Max Level', codeConcept: 'Vertical Scaling',
    description: 'Push a single node to its limits. Max out an upgrade (LV3).',
    mainline: true, prerequisites: ['q_upgrade_node'],
    objectives: [{ id: 'o1', description: 'Max a node (LV3)', statKey: 'max_node_level', target: 3, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'overclock', rarity: 'legendary' }] }],
    position: { x: 400, y: 120 },
  },

  // ── Side quests ──
  {
    id: 'q_caching', chapter: 6, name: 'Caching', codeConcept: 'Memoization',
    description: 'Build a Cache Node and use get_service() to store computed results.',
    mainline: false, prerequisites: ['q_upgrade_node'],
    objectives: [{ id: 'o1', description: 'Build a cache node', statKey: 'total_structures_built', target: 1, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'cache_bonus', description: '+20% cache capacity', effect: { cache_capacity_mult: 1.2 } }],
    position: { x: 200, y: 60 },
  },
  {
    id: 'q_chip_gacha', chapter: 6, name: 'Big O Notation', codeConcept: 'Complexity',
    description: 'Analyze distributions. Open chip packs to study randomness.',
    mainline: false, prerequisites: ['q_upgrade_node'],
    objectives: [{ id: 'o1', description: 'Open 5 chip packs', statKey: 'total_packs_opened', target: 5, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'production_rate_2', rarity: 'rare' }] }],
    position: { x: 600, y: 60 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 7: System Design
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_ha', chapter: 7, name: 'High Availability', codeConcept: 'HA / Redundancy',
    description: 'Multiple workers on the same node = redundancy. Deploy 3 workers to one API node.',
    mainline: true, prerequisites: ['q_max_upgrade'],
    objectives: [{ id: 'o1', description: 'Complete 10 API requests', statKey: 'total_api_requests_completed', target: 10, type: 'stat_gte' }],
    rewards: [{ kind: 'passive', effectId: 'worker_speed', description: '+10% worker speed', effect: { global_move_speed_mult: 0.9 } }],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_load_balance', chapter: 7, name: 'Load Balancing', codeConcept: 'Distribution',
    description: 'Distribute work across multiple nodes. Mine from 3 different resource nodes.',
    mainline: true, prerequisites: ['q_ha'],
    objectives: [{ id: 'o1', description: 'Deposit 5,000 data', statKey: 'total_data_deposited', target: 5000, type: 'stat_gte' }],
    rewards: [{ kind: 'resources', resources: { credits: 20 } }],
    position: { x: 400, y: 120 },
  },

  // ── Side quests ──
  {
    id: 'q_solve_many', chapter: 7, name: 'Horizontal Scaling', codeConcept: 'Scale Out',
    description: 'Solve 20 puzzles to prove compute capacity.',
    mainline: false, prerequisites: ['q_ha'],
    objectives: [{ id: 'o1', description: 'Solve 20 puzzles', statKey: 'total_puzzles_solved', target: 20, type: 'stat_gte' }],
    rewards: [{ kind: 'chips', chips: [{ chipType: 'harvest_speed_3', rarity: 'rare' }] }],
    position: { x: 200, y: 60 },
  },
  {
    id: 'q_earn_credits', chapter: 7, name: 'Revenue Model', codeConcept: 'Monetization',
    description: 'Earn 50 credits from API requests. Time is money.',
    mainline: false, prerequisites: ['q_ha'],
    objectives: [{ id: 'o1', description: 'Earn 50 credits', statKey: 'total_credits_earned', target: 50, type: 'stat_gte' }],
    rewards: [{ kind: 'unique_equipment', itemType: 'memory_allocator', name: 'Memory Allocator', description: '3.0x efficiency pickaxe', metadata: { efficiency: 3.0 } }],
    position: { x: 600, y: 60 },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Chapter 8: Mastery
  // ════════════════════════════════════════════════════════════════════════════

  // ── Mainline ──
  {
    id: 'q_architect', chapter: 8, name: 'Software Architect', codeConcept: 'Architecture',
    description: 'Master the full stack. Unlock everything, craft everything.',
    mainline: true, prerequisites: ['q_load_balance'],
    objectives: [
      { id: 'o1', description: 'Unlock all nodes', statKey: 'total_nodes_unlocked', target: 6, type: 'stat_gte' },
      { id: 'o2', description: 'Craft all base recipes', statKey: 'crafted_recipes', target: 5, type: 'stat_array_length' },
    ],
    rewards: [
      { kind: 'passive', effectId: 'harvest_speed_25', description: '+25% harvest speed', effect: { global_harvest_speed_mult: 1.25 } },
      { kind: 'chips', chips: [{ chipType: 'overclock', rarity: 'legendary' }] },
    ],
    position: { x: 400, y: 0 },
  },
  {
    id: 'q_full_stack', chapter: 8, name: 'Full Stack Developer', codeConcept: 'Mastery',
    description: 'You\'ve mastered it all. The network bends to your will.',
    mainline: true, prerequisites: ['q_architect'],
    objectives: [
      { id: 'o1', description: 'Deploy 20 workers', statKey: 'total_workers_deployed', target: 20, type: 'stat_gte' },
      { id: 'o2', description: 'Deposit 10,000 data', statKey: 'total_data_deposited', target: 10000, type: 'stat_gte' },
    ],
    rewards: [
      { kind: 'unique_equipment', itemType: 'fullstack_pickaxe', name: 'Full Stack Pickaxe', description: '5.0x efficiency legendary', metadata: { efficiency: 5.0 } },
      { kind: 'passive', effectId: 'carry_capacity', description: '+20 carry capacity', effect: { global_capacity_bonus: 20 } },
    ],
    position: { x: 400, y: 120 },
  },
];

// Attach guide steps to each quest
for (const q of QUESTS) {
  (q as any).guide = QUEST_GUIDES[q.id] || [{ title: q.name, content: q.description }];
}

// ── Unlockable recipes ─────────────────────────────────────────────────────

export const UNLOCKABLE_RECIPES = [
  {
    id: 'scanner',
    name: 'Scanner',
    description: 'Increases scan radius for workers.',
    output: { itemType: 'scanner', count: 1 },
    cost: { rp: 400, data: 200 } as Record<string, number>,
  },
  {
    id: 'signal_booster',
    name: 'Signal Booster',
    description: 'Boosts relay node speed.',
    output: { itemType: 'signal_booster', count: 1 },
    cost: { data: 600 } as Record<string, number>,
  },
  {
    id: 'overclock_kit',
    name: 'Overclock Kit',
    description: 'Temporary 2x speed boost.',
    output: { itemType: 'overclock_kit', count: 1 },
    cost: { data: 800, rp: 400 } as Record<string, number>,
  },
];
