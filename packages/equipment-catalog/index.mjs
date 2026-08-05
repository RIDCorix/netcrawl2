import catalog from './catalog.json';

export const EQUIPMENT_CATALOG = catalog;

export function getEquipmentDefinition(itemType) {
  return EQUIPMENT_CATALOG[itemType];
}

export function getAcceptedItems(slot) {
  return Object.entries(EQUIPMENT_CATALOG)
    .filter(([, definition]) => definition.slot === slot)
    .map(([itemType]) => itemType);
}
