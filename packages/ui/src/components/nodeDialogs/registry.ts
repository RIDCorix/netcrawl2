/**
 * Plugin registry — auto-discovers all files under `plugins/**` via Vite's
 * eager glob import. Adding a new plugin is a one-file drop-in; nothing
 * else needs editing.
 */

import type { NodeDialogPlugin, NodeDialogConfig } from './types';

type PluginModule = { default: NodeDialogPlugin | NodeDialogPlugin[] };

// Eager glob — all modules are loaded synchronously at startup so the
// registry is ready by first render. Vite resolves this at build time.
const pluginModules = import.meta.glob<PluginModule>('./plugins/**/*.ts', {
  eager: true,
});

const allPlugins: NodeDialogPlugin[] = [];
const seenIds = new Set<string>();
for (const [path, mod] of Object.entries(pluginModules)) {
  const exported = mod.default;
  if (!exported) {
    console.warn(`[nodeDialogs] ${path} has no default export`);
    continue;
  }
  const list = Array.isArray(exported) ? exported : [exported];
  for (const plugin of list) {
    if (seenIds.has(plugin.id)) {
      console.warn(`[nodeDialogs] duplicate plugin id: ${plugin.id} (${path})`);
      continue;
    }
    seenIds.add(plugin.id);
    allPlugins.push(plugin);
  }
}

export interface ResolvedDialog {
  /** The dialogKey of the winning plugin — stable id for React keys. */
  key: string;
  config: NodeDialogConfig;
}

/**
 * Resolve all dialogs that should render for a node. Groups matches by
 * `dialogKey` and picks the highest-priority plugin per slot.
 */
export function getDialogsForNode(nodeType: string, nodeData: any): ResolvedDialog[] {
  const bySlot = new Map<string, NodeDialogPlugin>();
  for (const plugin of allPlugins) {
    if (plugin.nodeType !== nodeType) continue;
    if (!plugin.match(nodeData)) continue;
    const existing = bySlot.get(plugin.dialogKey);
    if (!existing || (plugin.priority ?? 0) > (existing.priority ?? 0)) {
      bySlot.set(plugin.dialogKey, plugin);
    }
  }
  const resolved: ResolvedDialog[] = [];
  for (const [key, plugin] of bySlot.entries()) {
    resolved.push({ key, config: plugin.build(nodeData) });
  }
  return resolved;
}

/** Exposed for debugging — lists every registered plugin id. */
export function listRegisteredPlugins(): string[] {
  return allPlugins.map((p) => p.id);
}
