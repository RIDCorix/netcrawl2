/**
 * network/edge.ts
 *
 * Edge declarative field. At deploy time the user specifies a single edge.
 * At runtime the field value becomes that edge ID string.
 */

import { EdgeField } from '../fields.js';

/**
 * Declarative edge field. At deploy time, user selects a single edge.
 * At runtime, becomes an edge ID string: 'e5'
 *
 * Usage:
 *   class Collector extends WorkerClass {
 *     static fields = { miningEdge: new Edge("Edge to resource node") };
 *   }
 *
 * In onLoop:
 *   this.move(this.miningEdge);
 */
export class Edge extends EdgeField {}
