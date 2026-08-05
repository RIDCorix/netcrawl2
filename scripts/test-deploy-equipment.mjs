import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../packages/server/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync('packages/server/src/deployEquipment.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports, module) { ${compiled} })(module.exports, module)`, { module });
const { resolvePickaxeSelection } = module.exports;

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

const routeSource = readFileSync('packages/server/src/routes/deployRoutes.ts', 'utf8');
assert.match(routeSource, /worker\.status === 'crashed' \|\| worker\.status === 'error'/);
assert.match(routeSource, /equippedPickaxe: null,[\s\S]*equippedCpu: null,[\s\S]*equippedRam: null/);

console.log('Deploy equipment regression: 8 assertions passed');
