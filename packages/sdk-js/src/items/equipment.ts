/**
 * items/equipment.ts
 *
 * Concrete item classes. Each is both a field descriptor (used at class level
 * to declare a deploy-time requirement) and carries default stat attributes.
 *
 * At runtime, these descriptors are replaced by RuntimeItem instances (see runtime.ts).
 */

import { ItemField, GadgetField } from '../fields.js';
import type { FieldSchema } from '../fields.js';

/**
 * Mining tool. Deploy-time: consumes 1 pickaxe from inventory.
 * Runtime: provides this.pickaxe.mine() to create drops at current node.
 */
export class Pickaxe extends ItemField {
  efficiency: number = 1.0;

  constructor() {
    super(null);
  }

  schema(): FieldSchema {
    return {
      type: 'item',
      field: this._fieldName,
      item_type: 'Pickaxe',
      description: 'Requires 1x Pickaxe from inventory',
    };
  }

  mine(): never {
    throw new Error(
      'pickaxe.mine() called on the descriptor -- ' +
      'this means the worker was not initialized correctly. ' +
      'The runner should have replaced this with a RuntimeItem.'
    );
  }

  mineAndCollect(): never {
    throw new Error('pickaxe.mineAndCollect() called on descriptor');
  }
}

/**
 * Defensive item. Reduces infection chance when passing through infected nodes.
 */
export class Shield extends ItemField {
  defense: number = 0.5;

  constructor() {
    super(null);
  }

  schema(): FieldSchema {
    return {
      type: 'item',
      field: this._fieldName,
      item_type: 'Shield',
      description: 'Requires 1x Shield from inventory',
    };
  }
}

/**
 * Scanner booster. Increases scan radius.
 */
export class Beacon extends ItemField {
  radius: number = 2;

  constructor() {
    super(null);
  }

  schema(): FieldSchema {
    return {
      type: 'item',
      field: this._fieldName,
      item_type: 'Beacon',
      description: 'Requires 1x Beacon from inventory',
    };
  }
}

/**
 * Advanced graph navigation gadget. Provides pathfinding and exploration
 * methods at runtime. No deploy-time cost.
 */
export class SensorGadget extends GadgetField {
  constructor() {
    super('Sensor Gadget -- pathfinding & exploration');
  }

  travelTo(_nodeId: string): never {
    throw new Error('sensor.travelTo() called on descriptor -- worker not initialized');
  }

  findNearest(_nodeType: string): never {
    throw new Error('sensor.findNearest() called on descriptor -- worker not initialized');
  }

  explore(): never {
    throw new Error('sensor.explore() called on descriptor -- worker not initialized');
  }
}

/**
 * Basic edge scanner. Returns adjacent edges with basic info (edge ID, direction)
 * but NO target node type info. No deploy-time cost.
 */
export class BasicSensor extends GadgetField {
  constructor() {
    super('Basic Sensor -- scan adjacent edges');
  }

  scan(): never {
    throw new Error('basicSensor.scan() called on descriptor -- worker not initialized');
  }
}

/**
 * Advanced edge scanner. Returns adjacent edges WITH target node type info,
 * enabling instanceof checks and smart routing. No deploy-time cost.
 */
export class AdvancedSensor extends GadgetField {
  constructor() {
    super('Advanced Sensor -- scan edges with node type info');
  }

  scan(): never {
    throw new Error('advancedSensor.scan() called on descriptor -- worker not initialized');
  }
}
