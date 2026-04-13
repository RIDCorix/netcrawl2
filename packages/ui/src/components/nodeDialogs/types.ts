/**
 * Plugin contract for node detail dialogs.
 *
 * Each plugin handles one (nodeType, dialogKey) "slot". When multiple plugins
 * match the same slot for a given node, the highest `priority` wins — so a
 * specific plugin (e.g. `fixedPuzzleTemplate === 'typeof'`) can override a
 * generic fallback (e.g. `difficulty === 'easy'`) without either knowing
 * about the other.
 */

import type { ReactNode } from 'react';

export interface NodeDialogConfig {
  buttonLabel: string;
  buttonIcon?: ReactNode;
  dialogTitle: string;
  /** Markdown string rendered inside the dialog body */
  dialogContent: string;
}

export interface NodeDialogPlugin {
  /** Unique identifier — only used for debugging / dedup. */
  id: string;
  /** Node type this plugin handles (e.g. 'compute', 'resource'). */
  nodeType: string;
  /**
   * Dialog slot key. Plugins sharing the same (nodeType, dialogKey) compete;
   * different keys coexist as separate buttons on the same node.
   */
  dialogKey: string;
  /** Higher priority wins in a slot competition. Default 0. */
  priority?: number;
  /** Predicate — return true if this plugin should handle the given node. */
  match: (nodeData: any) => boolean;
  /** Build the dialog config. Only called when `match` returned true. */
  build: (nodeData: any) => NodeDialogConfig;
}
