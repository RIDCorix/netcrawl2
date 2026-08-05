export interface DeployField {
  type: string;
  item_type?: string;
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
