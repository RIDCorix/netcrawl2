import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

/* global console */
const require = createRequire(import.meta.url);
const equipmentCatalog = require('../packages/equipment-catalog/index.cjs');
const ts = require('../packages/server/node_modules/typescript');
const source = readFileSync('packages/server/src/deployEquipment.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports, module, require) { ${compiled} })(module.exports, module, require)`, {
  module,
  require: id => {
    if (id === '@netcrawl/equipment-catalog') return equipmentCatalog;
    throw new Error(`Unexpected module import: ${id}`);
  },
});
const { decideDeployAck, isPickaxeItemType, resolvePickaxeSelection } = module.exports;

for (const language of ['python', 'javascript']) {
  const fieldName = language === 'python' ? 'mining_tool' : 'primaryTool';
  const fields = {
    [fieldName]: { type: 'item', item_type: 'Pickaxe' },
    edge: { type: 'edge' },
  };
  const selection = resolvePickaxeSelection(fields, { [fieldName]: 'pickaxe_basic' });
  assert.equal(selection?.fieldName, fieldName, `${language} must preserve its declared item-field name`);
  assert.equal(selection?.itemType, 'pickaxe_basic');
}

assert.equal(
  resolvePickaxeSelection({ shield: { type: 'item', item_type: 'Shield' } }, { shield: 'shield' }),
  null,
  'non-pickaxe item fields must not authorize mining',
);
assert.equal(resolvePickaxeSelection({}, undefined), null);

assert.equal(isPickaxeItemType('pickaxe_basic'), true);
assert.equal(isPickaxeItemType('pickaxe_iron'), true);
assert.equal(isPickaxeItemType('pickaxe_diamond'), true);
assert.equal(isPickaxeItemType('memory_allocator'), true);
assert.equal(isPickaxeItemType('fullstack_pickaxe'), true);
assert.equal(isPickaxeItemType('shield'), false);
assert.equal(isPickaxeItemType('cpu_basic'), false);
assert.deepEqual(equipmentCatalog.getAcceptedItems('Pickaxe'), [
  'pickaxe_basic',
  'pickaxe_iron',
  'pickaxe_diamond',
  'memory_allocator',
  'fullstack_pickaxe',
]);
assert.equal(equipmentCatalog.getEquipmentDefinition('memory_allocator').efficiency, 3);
assert.equal(equipmentCatalog.getEquipmentDefinition('fullstack_pickaxe').efficiency, 5);

assert.equal(decideDeployAck('deploying', false), 'spawn_succeeded');
assert.equal(decideDeployAck('deploying', true), 'spawn_failed');
assert.equal(decideDeployAck('running', true), 'duplicate', 'late failure cannot crash a running worker');
assert.equal(decideDeployAck('running', false), 'duplicate', 'duplicate success is idempotent');
assert.equal(decideDeployAck('crashed', true), 'duplicate', 'duplicate failure cannot restore inventory twice');
assert.equal(decideDeployAck('error', false), 'duplicate', 'stale success cannot revive a terminal worker');
assert.equal(decideDeployAck('suspended', false), 'duplicate', 'stale ACK cannot resume a suspended worker');

console.log('Deploy equipment regression: 23 assertions passed');
