import type { WorkerClassEntry } from './workerRegistry.js';

export const TUTORIAL_MINER_CLASS: WorkerClassEntry = {
  class_id: 'tutorial_miner',
  class_name: 'TutorialMiner',
  class_icon: 'Pickaxe',
  fields: {
    route: { type: 'edge', field: 'route', description: 'Edge route to mine' } as any,
    pickaxe: { type: 'item', item_type: 'Pickaxe', field: 'pickaxe', description: 'Mining pickaxe' } as any,
  },
  docstring: 'Tutorial worker. Mines along the selected edge route using your pickaxe.',
  file: '[built-in tutorial]',
  language: 'python',
};
