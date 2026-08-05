export type EquipmentSlot = 'Pickaxe' | 'Shield' | 'Beacon' | 'CPU' | 'RAM';

export interface EquipmentDefinition {
  slot: EquipmentSlot;
  efficiency?: number;
  computeCost?: number;
  computePoints?: number;
  capacityBonus?: number;
}

export const EQUIPMENT_CATALOG: Readonly<Record<string, Readonly<EquipmentDefinition>>>;
export function getEquipmentDefinition(itemType: string): Readonly<EquipmentDefinition> | undefined;
export function getAcceptedItems(slot: EquipmentSlot): string[];
