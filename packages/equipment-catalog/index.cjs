const EQUIPMENT_CATALOG = require('./catalog.json');

function getEquipmentDefinition(itemType) {
  return EQUIPMENT_CATALOG[itemType];
}

function getAcceptedItems(slot) {
  return Object.entries(EQUIPMENT_CATALOG)
    .filter(([, definition]) => definition.slot === slot)
    .map(([itemType]) => itemType);
}

module.exports = { EQUIPMENT_CATALOG, getEquipmentDefinition, getAcceptedItems };
