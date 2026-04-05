/**
 * fields.ts
 *
 * Declarative field descriptors for WorkerClass.
 * These are used at class definition time to describe deploy-time requirements.
 * At runtime the actual values are injected as instance attributes.
 */

export interface FieldSchema {
  type: string;
  field: string;
  description: string;
  item_type?: string;
}

export abstract class WorkerField {
  _fieldName: string = '';

  abstract schema(): FieldSchema;
}

export class ItemField extends WorkerField {
  private _itemClass: string | null;

  constructor(itemClass: string | null = null) {
    super();
    this._itemClass = itemClass;
  }

  schema(): FieldSchema {
    const itemName = this._itemClass ?? 'any';
    return {
      type: 'item',
      field: this._fieldName,
      item_type: itemName,
      description: `Requires 1x ${itemName} from inventory`,
    };
  }
}

export class GadgetField extends WorkerField {
  protected _description: string;

  constructor(description: string = '') {
    super();
    this._description = description;
  }

  schema(): FieldSchema {
    return {
      type: 'gadget',
      field: this._fieldName,
      description: this._description || `Gadget: ${this._fieldName}`,
    };
  }
}

export class EdgeField extends WorkerField {
  protected _edgeDescription: string;

  constructor(description: string = '') {
    super();
    this._edgeDescription = description;
  }

  schema(): FieldSchema {
    return {
      type: 'edge',
      field: this._fieldName,
      description: this._edgeDescription || `Edge for ${this._fieldName}`,
    };
  }
}

export class RouteField extends WorkerField {
  protected _routeDescription: string;

  constructor(description: string = '') {
    super();
    this._routeDescription = description;
  }

  schema(): FieldSchema {
    return {
      type: 'route',
      field: this._fieldName,
      description: this._routeDescription || `Route for ${this._fieldName}`,
    };
  }
}
