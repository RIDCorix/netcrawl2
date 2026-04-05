# /design-quest-chapter — NetCrawl Quest Chapter Designer

Design a complete quest chapter for NetCrawl that fuses **programming education** with **game feel**. Outputs a structured chapter design document with mainline quests, branching side quests, rewards, and tutorial guides — all conforming to the existing codebase types.

## When to Use

- Designing a new chapter (Ch1–Ch8+) or redesigning an existing one
- Adding a new network layer's quest content
- Planning quest rewards that feel meaningful at the player's progression stage

---

## Design Philosophy

### Three Pillars

| Pillar | Question to Ask |
|--------|----------------|
| **Programming Learning** | What CS concept does the player internalize by completing this quest? |
| **Game Feel** | Does the quest create tension, discovery, or satisfaction? |
| **Progression Utility** | Is the reward immediately useful for the player's current capabilities? |

### Core Principles

1. **Show, Don't Tell** — The quest objective IS the lesson. `q_for_loop` doesn't lecture about loops; it asks you to mine 10 times. The player's own code becomes the textbook.
2. **Escalating Autonomy** — Early quests are hand-held (single actions). Later quests require multi-step worker scripts the player writes themselves.
3. **Side Quests = Depth, Mainline = Breadth** — Mainline advances to the next concept. Side quests explore the current concept deeper or from an unexpected angle.
4. **Reward the Next Step** — Rewards should unlock or enhance the gameplay the player is about to enter, not the gameplay they just finished.

---

## Chapter Design Process

### Step 1: Define the Chapter Theme

```
Chapter N: <Theme Name>
├── CS Domain:       e.g. "Data Structures", "Concurrency", "Security"
├── Game Scenario:   e.g. "Corporate infiltration", "Dark web exploration"
├── Entry Prereq:    Which mainline quest from Ch(N-1) gates entry?
├── Target Level:    Player level range when they reach this chapter
└── Layer Context:   Which network layer(s) does this chapter span?
```

Reference existing chapters for tone:
- Ch1 (Getting Started) — gentle, single-action objectives
- Ch2 (Automation) — loop-based, cumulative targets
- Ch3 (Networking) — graph exploration, topology
- Ch4 (Security) — reactive defense, conditional logic
- Ch5 (Infrastructure) — building, API design
- Ch6 (Optimization) — upgrades, performance tuning
- Ch7 (System Design) — distribution, scaling, revenue
- Ch8 (Mastery) — endgame convergence

### Step 2: Design the Learning Curve

Map **programming concepts** to a difficulty ramp within the chapter:

```
Mainline Flow (vertical, sequential):
  ┌─ Concept A (intro)        ← Player sees the concept for the first time
  ├─ Concept B (application)   ← Player applies it in a slightly harder context
  └─ Concept C (synthesis)     ← Player combines with prior knowledge

Side Quests (horizontal, any order):
  ├─ Concept A' (alternate angle)
  ├─ Concept B' (edge case / deeper)
  └─ Concept X (surprise / easter egg)
```

**Learning Curve Rules:**
- Each mainline quest introduces exactly ONE new concept
- Side quests never introduce concepts needed by later mainline quests
- The first mainline quest in a chapter should feel achievable within 2-3 minutes
- The final mainline quest should require ~10 minutes of sustained play or code writing
- Side quests can be harder than the mainline — they're optional depth

### Step 3: Design the Quest DAG

```
Mainline (vertical):          Side branches:
                              
  q_chN_main1 ─────────────── q_chN_side1a
       │                       q_chN_side1b
       ▼
  q_chN_main2 ─────────────── q_chN_side2a
       │
       ▼
  q_chN_main3 ─────────────── q_chN_side3a
                               q_chN_side3b
```

**DAG Rules:**
- Mainline quests form a strict linear chain (each prereqs the previous)
- Side quests prereq a mainline quest but never another side quest
- Side quests never gate mainline progression
- Aim for 3-5 mainline + 2-4 side quests per chapter (total 5-9 quests)
- Side quests branch from different mainline nodes to spread engagement

### Step 4: Design Rewards (Sense of Awarding)

**Reward Tier Guidelines by Chapter:**

| Chapter Range | Typical Rewards | Why |
|--------------|-----------------|-----|
| Ch1-2 (Early) | Resources, basic items, first recipe unlocks | Player needs materials to get started |
| Ch3-4 (Mid-Early) | Passive effects, chips (common/uncommon), beacons | Player is expanding; passives help scaling |
| Ch5-6 (Mid) | Recipe unlocks, rare chips, unique equipment | Player is building; needs specialized tools |
| Ch7-8 (Late) | Legendary chips, unique equipment, large passives | Player is optimizing; rewards feel premium |

**Reward Design Rules:**

1. **Mainline rewards > Side quest rewards** in perceived value (mainline gates progression)
2. **First quest reward = immediate utility** (tool or resource the player needs right now)
3. **Final mainline quest reward = chapter trophy** (unique item, powerful passive, or recipe unlock)
4. **Side quest rewards = specialization** (chips, niche items, alternative builds)
5. **Never reward something the player can't use yet** (no legendary chips before chip slots are available)
6. **Resources scale with the economy** — Ch1 gives 200-500 data; Ch7 gives 2000+ data or credits

**Available Reward Types:**

```typescript
// Resources — immediate spending power
{ kind: 'resources', resources: { data: N, rp: N, credits: N } }

// Items — tools and consumables
{ kind: 'items', items: [{ itemType: 'pickaxe_iron', count: 1, metadata: { efficiency: 1.5 } }] }

// Passive Effects — permanent multipliers (feel powerful)
{ kind: 'passive', effectId: 'unique_id', description: '+N% something', effect: { stat_key: value } }

// Recipe Unlocks — new crafting options
{ kind: 'recipe_unlock', recipeId: 'recipe_id', name: 'Recipe Name' }

// Chips — node upgrades (randomized power)
{ kind: 'chips', chips: [{ chipType: 'chip_id', rarity: 'common'|'uncommon'|'rare'|'legendary' }] }

// Unique Equipment — one-of-a-kind items (major reward feel)
{ kind: 'unique_equipment', itemType: 'id', name: 'Name', description: 'Desc', metadata: { ... } }
```

**Existing Chip Types:** `harvest_speed_1/2/3`, `defense_1/2`, `move_speed_1`, `production_rate_1/2`, `capacity_1`, `auto_repair`, `overclock`

**Existing Passive Effect Keys:** `global_harvest_speed_mult`, `global_defense_bonus`, `node_unlock_cost_mult`, `global_move_speed_mult`, `global_capacity_bonus`, `cache_capacity_mult`

### Step 5: Write Quest Definitions

Each quest must conform to:

```typescript
interface QuestDef {
  id: string;              // q_<short_snake_case>
  chapter: number;         // 1-8+
  name: string;            // Short, punchy (2-4 words)
  description: string;     // 1-2 sentences, ties game action to CS concept
  codeConcept: string;     // The CS concept being taught
  mainline: boolean;       // true = sequential gate, false = optional branch
  prerequisites: string[]; // quest IDs that must be claimed first
  objectives: QuestObjective[];
  rewards: RewardType[];
  position: { x: number; y: number }; // Quest book layout position
}
```

**Objective Types:**

```typescript
// Player stat reaches a threshold
{ type: 'stat_gte', statKey: 'total_mines', target: 10 }

// Player stat array includes a specific value
{ type: 'stat_array_includes', statKey: 'crafted_recipes', statArrayValue: 'scanner' }

// Player stat array reaches a length
{ type: 'stat_array_length', statKey: 'crafted_recipes', target: 5 }
```

**Available stat keys:** `total_workers_deployed`, `total_mines`, `total_deposits`, `total_data_deposited`, `total_nodes_unlocked`, `total_crafts`, `total_repairs`, `total_chips_installed`, `total_structures_built`, `total_puzzles_solved`, `total_upgrades`, `max_node_level`, `total_api_requests_completed`, `total_credits_earned`, `total_packs_opened`, `total_rp_deposited`, `crafted_recipes`, `code_server_connected`

**Position Layout Convention:**
- Mainline quests: x=400, y increments by 300 (0, 300, 600, 900...)
- Left side quests: x=0, y between the mainline quests they branch from
- Right side quests: x=700, y between the mainline quests they branch from

### Step 6: Write Quest Guides

Each quest should have a `GuideStep[]` array — a multi-step tutorial that teaches the concept:

```typescript
interface GuideStep {
  title: string;    // Step heading (e.g. "Understanding Loops")
  content: string;  // Markdown with code blocks, tables, tips
}
```

**Guide Writing Rules:**
1. First step = explain the CS concept with a real-world analogy
2. Middle steps = show the NetCrawl code that implements it
3. Last step = tell the player exactly what to do to complete the objective
4. Include Python code blocks showing worker class patterns
5. Keep each step under 200 words
6. Use tables for comparisons (node types, resource types, etc.)

---

## Quest Name & Description Conventions

**Naming Pattern:** Quest names should be programming terms that double as game actions:
- `For Loop` (mine 10 times — it's a loop!)
- `Return Statement` (deposit at hub — return the value!)
- `Import Module` (unlock a node — import new capability!)
- `Firewall Rules` (install chips — validate input!)

**Description Pattern:** `<Programming metaphor>. <Game instruction>.`
- "Functions return values. Mine a resource node to see what comes back."
- "if node.infected: repair(node). Repair your first infected node."

---

## Output Format

When designing a chapter, produce:

1. **Chapter Overview** — theme, narrative, layer, level range, entry prereq
2. **Learning Progression** — ordered list of concepts with difficulty ratings
3. **Quest DAG Diagram** — ASCII art showing mainline + branches
4. **Quest Definitions** — Full TypeScript `QuestDef[]` ready to paste into `questDefinitions.ts`
5. **Quest Guides** — Full `GuideStep[]` entries ready to paste into `questGuides.ts`
6. **Reward Justification** — For each reward, explain WHY it's useful at this progression stage

---

## Checklist Before Finalizing

- [ ] Every mainline quest teaches exactly one new concept
- [ ] Side quests don't gate mainline progression
- [ ] Rewards are useful for the NEXT stage, not the current one
- [ ] Quest descriptions connect CS concepts to game actions
- [ ] Objectives use existing stat keys (or document new ones needed)
- [ ] Positions don't overlap in the quest book layout
- [ ] Guide steps include runnable Python code examples
- [ ] Total quest count is 5-9 per chapter
- [ ] First quest is completable in under 3 minutes
- [ ] Final quest feels like a chapter boss (multi-objective or high target)
- [ ] No reward references items/chips that don't exist in the catalog
- [ ] Resource rewards scale appropriately for the chapter's economy stage
