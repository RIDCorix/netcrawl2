/**
 * network/route.ts
 *
 * Route declarative field. At deploy time the user specifies a sequence of
 * connected edges forming a path. At runtime the field value becomes a list
 * of edge IDs.
 */

import { RouteField } from '../fields.js';

/**
 * Declarative route field. At deploy time, user specifies a sequence of
 * connected edges (a path). Requires an advanced route chip equipped.
 * At runtime, becomes a list of edge IDs: ['e1', 'e3', 'e5']
 *
 * Usage:
 *   class Collector extends WorkerClass {
 *     static fields = { toMine: new Route("Path from Hub to resource node") };
 *   }
 *
 * In onLoop:
 *   this.move(this.toMine);
 *   this.move([...this.toMine].reverse());
 */
export class Route extends RouteField {}
