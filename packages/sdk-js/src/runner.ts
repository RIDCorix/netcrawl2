/**
 * runner.ts
 *
 * Entrypoint for worker subprocesses.
 * Reads env vars set by the daemon, imports the worker class,
 * injects field values, and runs the worker lifecycle.
 *
 * Called by daemon like:
 *   node --import runner.js
 * With env vars:
 *   NETCRAWL_WORKER_ID=worker-abc123
 *   NETCRAWL_API_URL=http://localhost:4800
 *   NETCRAWL_SCRIPT_PATH=/path/to/units/collector.ts
 *   NETCRAWL_CLASS_NAME=Collector
 *   NETCRAWL_INJECTED={"pickaxe":{"itemType":"pickaxe_basic","efficiency":1.0},"toMine":"e1","toHub":"e3"}
 */

import { pathToFileURL } from 'node:url';
import { ItemField, EdgeField, RouteField } from './fields.js';
import { RuntimeItem, RuntimeSensorGadget, RuntimeBasicSensor, RuntimeAdvancedSensor, RuntimeGadget } from './runtime.js';
import { SensorGadget, BasicSensor, AdvancedSensor } from './items/equipment.js';
import { WorkerClass } from './base.js';
import type { WorkerField } from './fields.js';

let _shutdown = false;

process.on('SIGTERM', () => { _shutdown = true; });
process.on('SIGINT', () => { _shutdown = true; });

/** Discover fields from a class's static `fields` property walking the prototype chain. */
function discoverFields(cls: typeof WorkerClass): Record<string, WorkerField> {
  const fields: Record<string, WorkerField> = {};
  const chain: (typeof WorkerClass)[] = [];
  let current: Function | null = cls;
  while (current && current !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(current, 'fields')) {
      chain.push(current as typeof WorkerClass);
    }
    current = Object.getPrototypeOf(current);
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const staticFields = (chain[i] as unknown as Record<string, unknown>)['fields'] as Record<string, WorkerField> | undefined;
    if (staticFields) {
      for (const [key, value] of Object.entries(staticFields)) {
        if (value && typeof value === 'object' && '_fieldName' in value) {
          (value as WorkerField)._fieldName = key;
          fields[key] = value as WorkerField;
        }
      }
    }
  }

  return fields;
}

async function main(): Promise<void> {
  const workerId = process.env['NETCRAWL_WORKER_ID'] ?? '';
  const apiUrl = process.env['NETCRAWL_API_URL'] ?? 'http://localhost:4800';
  const scriptPath = process.env['NETCRAWL_SCRIPT_PATH'];
  const className = process.env['NETCRAWL_CLASS_NAME'];
  const injectedRaw = process.env['NETCRAWL_INJECTED'] ?? '{}';

  if (!scriptPath || !className) {
    console.error('ERROR: NETCRAWL_SCRIPT_PATH and NETCRAWL_CLASS_NAME are required');
    process.exit(1);
  }

  const injectedFieldsRaw: Record<string, unknown> = JSON.parse(injectedRaw);

  // Dynamically import the user's script
  const moduleUrl = pathToFileURL(scriptPath).href;
  const module = await import(moduleUrl);

  // Retrieve the worker class by name
  const WorkerCls = module[className] as typeof WorkerClass | undefined;
  if (!WorkerCls) {
    console.error(`ERROR: Class '${className}' not found in ${scriptPath}`);
    process.exit(1);
  }

  // Process injected fields
  const fields = discoverFields(WorkerCls as typeof WorkerClass);
  const injectedFields: Record<string, unknown> = {};

  // First: auto-create runtime proxies for gadget fields (not injected by server)
  for (const [fieldName, clsField] of Object.entries(fields)) {
    if (clsField instanceof BasicSensor) {
      injectedFields[fieldName] = new RuntimeBasicSensor();
    } else if (clsField instanceof AdvancedSensor) {
      injectedFields[fieldName] = new RuntimeAdvancedSensor();
    } else if (clsField instanceof SensorGadget) {
      injectedFields[fieldName] = new RuntimeSensorGadget();
    }
  }

  // Then: process server-injected values
  for (const [fieldName, value] of Object.entries(injectedFieldsRaw)) {
    const clsField = fields[fieldName];
    if (clsField instanceof ItemField && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      injectedFields[fieldName] = new RuntimeItem(value as Record<string, unknown>);
    } else if (clsField instanceof EdgeField && typeof value === 'string') {
      injectedFields[fieldName] = value;
    } else if (clsField instanceof RouteField && Array.isArray(value)) {
      injectedFields[fieldName] = value;
    } else {
      injectedFields[fieldName] = value;
    }
  }

  // Instantiate with injected values
  const worker = new (WorkerCls as new (workerId: string, apiUrl: string, injectedFields: Record<string, unknown>) => WorkerClass)(
    workerId,
    apiUrl,
    injectedFields,
  );

  console.log(`[${workerId}] Starting ${className}...`);

  // Run lifecycle
  try {
    await worker.onStartup();
  } catch (e: unknown) {
    console.error(`[${workerId}] onStartup() failed: ${e}`);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  }

  // Main loop
  let loopCount = 0;
  while (!_shutdown) {
    try {
      await worker.onLoop();
      loopCount += 1;
    } catch (e: unknown) {
      const msg = `onLoop() error #${loopCount}: ${e}`;
      console.error(`[${workerId}] ${msg}`);
      if (e instanceof Error && e.stack) {
        console.error(e.stack);
      }
      // Report fatal error to server
      try {
        await worker._client.action('report_error', { message: msg });
      } catch {
        // Ignore reporting errors
      }
      console.log(`[${workerId}] Stopped due to error after ${loopCount} loops.`);
      process.exit(1);
    }
  }

  console.log(`[${workerId}] Suspended cleanly after ${loopCount} loops.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Runner fatal error:', e);
  process.exit(1);
});
