/**
 * Quest engine — state machine, condition checker, reward distributor.
 */

import {
  getStat, getStatArray, getGameState, saveGameState,
  getQuestStatus, setQuestStatus, getQuestState,
  addActivePassive, addUnlockedRecipe, getActivePassives,
  addToPlayerInventory, addPlayerChip,
  Chip, awardXp, getCurrentUserId,
} from './db.js';
import { XP_REWARDS } from './levelSystem.js';
import { broadcast } from './websocket.js';
import { QUESTS, QuestDef, QuestObjective } from './questDefinitions.js';
import { CHIP_DEFS } from './upgradeDefinitions.js';

// ── Objective evaluation ────────────────────────────────────────────────────

export function evaluateObjective(obj: QuestObjective): { met: boolean; current: number; target: number } {
  switch (obj.type) {
    case 'stat_gte': {
      const current = getStat(obj.statKey);
      return { met: current >= obj.target, current, target: obj.target };
    }
    case 'stat_array_includes': {
      const arr = getStatArray(obj.statKey);
      const has = obj.statArrayValue ? arr.includes(obj.statArrayValue) : false;
      return { met: has, current: has ? 1 : 0, target: 1 };
    }
    case 'stat_array_length': {
      const arr = getStatArray(obj.statKey);
      return { met: arr.length >= obj.target, current: arr.length, target: obj.target };
    }
    default:
      return { met: false, current: 0, target: obj.target };
  }
}

// ── State machine ───────────────────────────────────────────────────────────

/** Initialize quests that have no status yet. First quest starts as 'available'. */
function ensureQuestInit() {
  for (const q of QUESTS) {
    if (!getQuestStatus(q.id)) {
      if (q.prerequisites.length === 0) {
        setQuestStatus(q.id, 'available');
      } else {
        setQuestStatus(q.id, 'locked');
      }
    }
  }
}

/** Promote locked → available when all prerequisites are claimed. */
function checkAvailability(): QuestDef[] {
  const newlyAvailable: QuestDef[] = [];
  for (const q of QUESTS) {
    if (getQuestStatus(q.id) !== 'locked') continue;
    const allPreqsClaimed = q.prerequisites.every(pid => getQuestStatus(pid) === 'claimed');
    if (allPreqsClaimed) {
      setQuestStatus(q.id, 'available');
      newlyAvailable.push(q);
    }
  }
  return newlyAvailable;
}

/** Promote available → completed when all objectives are met. */
function checkCompletion(): QuestDef[] {
  const newlyCompleted: QuestDef[] = [];
  for (const q of QUESTS) {
    if (getQuestStatus(q.id) !== 'available') continue;
    const allMet = q.objectives.every(obj => evaluateObjective(obj).met);
    if (allMet) {
      setQuestStatus(q.id, 'completed');
      newlyCompleted.push(q);
    }
  }
  return newlyCompleted;
}

// ── Main checker (called after stat changes) ────────────────────────────────

export function checkQuests(userId?: string): void {
  const effectiveUserId = userId || getCurrentUserId() || undefined;
  ensureQuestInit();

  const newAvail = checkAvailability();
  const newComplete = checkCompletion();

  for (const q of newAvail) {
    broadcast({ type: 'QUEST_AVAILABLE', payload: { id: q.id, name: q.name, chapter: q.chapter } }, effectiveUserId);
    console.log(`[Quest] Available: ${q.name}`);
  }

  for (const q of newComplete) {
    broadcast({ type: 'QUEST_COMPLETED', payload: { id: q.id, name: q.name, chapter: q.chapter } }, effectiveUserId);
    console.log(`[Quest] Completed: ${q.name}`);
  }
}

// ── Reward distribution ─────────────────────────────────────────────────────

export function claimQuestReward(questId: string, userId?: string): { ok: boolean; error?: string } {
  const uid = userId || getCurrentUserId() || undefined;
  const status = getQuestStatus(questId, uid);
  if (status !== 'completed') {
    return { ok: false, error: status === 'claimed' ? 'Already claimed' : `Quest is ${status || 'unknown'}` };
  }

  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return { ok: false, error: 'Quest not found' };

  for (const reward of quest.rewards) {
    switch (reward.kind) {
      case 'passive':
        addActivePassive(reward.effectId, reward.description, reward.effect, uid);
        break;

      case 'recipe_unlock':
        addUnlockedRecipe(reward.recipeId, uid);
        break;

      case 'items':
        for (const item of reward.items) {
          addToPlayerInventory(item.itemType, item.count, item.metadata, uid);
        }
        break;

      case 'chips':
        for (const chipSpec of reward.chips) {
          const def = CHIP_DEFS.find(c => c.chipType === chipSpec.chipType);
          if (def) {
            const chip: Chip = {
              id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              chipType: def.chipType,
              name: def.name,
              rarity: def.rarity,
              effect: { ...def.effect },
            };
            addPlayerChip(chip, uid);
          }
        }
        break;

      case 'unique_equipment':
        addToPlayerInventory(reward.itemType, 1, reward.metadata, uid);
        break;

      case 'resources': {
        const state = getGameState(uid);
        const res = { ...state.resources } as Record<string, number>;
        for (const [k, v] of Object.entries(reward.resources)) {
          if (v) res[k] = (res[k] || 0) + v;
        }
        saveGameState({ ...state, resources: res as any }, uid);
        break;
      }
    }
  }

  setQuestStatus(questId, 'claimed', uid);

  // Award XP based on quest chapter
  const xpKey = `claim_quest_ch${quest.chapter}` as keyof typeof XP_REWARDS;
  awardXp(XP_REWARDS[xpKey] || 100, uid);

  // Cascade: claiming may unlock new quests
  checkAvailability();
  checkCompletion();

  return { ok: true };
}

// ── API helpers ─────────────────────────────────────────────────────────────

export function getQuestList(userId?: string) {
  ensureQuestInit();
  return QUESTS.map(q => {
    const status = getQuestStatus(q.id) || 'locked';
    const objectives = q.objectives.map(obj => ({
      ...obj,
      ...evaluateObjective(obj),
    }));
    return {
      id: q.id,
      chapter: q.chapter,
      name: q.name,
      description: q.description,
      codeConcept: q.codeConcept,
      mainline: q.mainline,
      prerequisites: q.prerequisites,
      status,
      objectives,
      rewards: q.rewards,
      position: q.position,
      guide: q.guide || [],
      claimedAt: getQuestState(userId).claimedAt[q.id] || null,
    };
  });
}

export function getQuestEdges() {
  const edges: { source: string; target: string }[] = [];
  for (const q of QUESTS) {
    for (const prereq of q.prerequisites) {
      edges.push({ source: prereq, target: q.id });
    }
  }
  return edges;
}

export function getQuestSummary(userId?: string) {
  ensureQuestInit();
  const state = getQuestState(userId);
  const statuses = state.questStatus;
  return {
    total: QUESTS.length,
    claimed: Object.values(statuses).filter(s => s === 'claimed').length,
    completed: Object.values(statuses).filter(s => s === 'completed').length,
    available: Object.values(statuses).filter(s => s === 'available').length,
    activePassives: state.activePassives,
  };
}
