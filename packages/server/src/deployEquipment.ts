import { getEquipmentDefinition } from '@netcrawl/equipment-catalog';

export interface DeployField {
  type: string;
  item_type?: string;
}

export function isPickaxeItemType(itemType: string): boolean {
  return getEquipmentDefinition(itemType)?.slot === 'Pickaxe';
}

export type DeployAckDecision = 'spawn_succeeded' | 'spawn_failed' | 'duplicate';

/** ACKs are accepted only while the authoritative worker is awaiting its first ACK. */
export function decideDeployAck(workerStatus: string, hasSpawnError: boolean): DeployAckDecision {
  if (workerStatus !== 'deploying') return 'duplicate';
  return hasSpawnError ? 'spawn_failed' : 'spawn_succeeded';
}

/** Resolve equipment by the worker schema's declared field name, never a UI label. */
export function resolvePickaxeSelection(
  fields: Record<string, DeployField>,
  equippedItems: Record<string, string> | undefined,
): { fieldName: string; itemType: string } | null {
  if (!equippedItems) return null;

  for (const [fieldName, field] of Object.entries(fields)) {
    if (field.type !== 'item' || field.item_type?.toLowerCase() !== 'pickaxe') continue;
    const itemType = equippedItems[fieldName];
    if (itemType) return { fieldName, itemType };
  }

  return null;
}
