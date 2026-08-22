import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AssignmentTransferView } from '../packages/ui/src/components/computeLab/stage';

const t = (key: string, vars?: Record<string, string | number>) =>
  `${key}${vars ? ` ${Object.values(vars).join(' ')}` : ''}`;
const transfer = {
  source: 'a = b',
  evaluationSource: 'b',
  evaluatedValue: '7',
  references: [{ name: 'b', value: '7' }],
  targets: [{ name: 'a', value: '7' }],
};

let renderer: TestRenderer.ReactTestRenderer;
await act(async () => {
  renderer = TestRenderer.create(<AssignmentTransferView transfer={transfer} animated t={t} />);
});

const reference = renderer!.root.findByProps({ 'data-testid': 'compute-lab-assignment-reference' });
assert.equal(reference.findAllByType('code')[0].children.join(''), 'b');
assert.equal(reference.findByType('strong').children.join(''), '7');
const payload = renderer!.root.findByProps({ 'data-testid': 'compute-lab-assignment-payload' });
assert.equal(payload.children.join(''), '7', 'the evaluated value itself must travel, not only an arrow glyph');
const pendingTarget = renderer!.root.findByProps({ 'data-testid': 'compute-lab-assignment-target-a' });
assert.equal(pendingTarget.props['data-phase'], 'pending');
assert.notEqual(
  pendingTarget.findByType('span').children.join(''),
  'a · 7',
  'the destination cannot update before transfer ends',
);

await act(async () => {
  renderer!.update(<AssignmentTransferView transfer={transfer} animated={false} t={t} />);
});
const settledTarget = renderer!.root.findByProps({ 'data-testid': 'compute-lab-assignment-target-a' });
assert.equal(settledTarget.props['data-phase'], 'complete');
assert.equal(
  settledTarget.findByType('span').children.join(''),
  'a · 7',
  'reduced motion and settled playback land directly on truth',
);
assert.equal(
  renderer!.root.findAllByProps({ 'data-testid': 'compute-lab-assignment-payload' }).length,
  0,
  'the reduced-motion/final state contains no stranded travel payload',
);

await act(async () => {
  renderer!.update(
    <AssignmentTransferView
      transfer={{
        ...transfer,
        evaluatedValue: '[7, 8]',
        targets: [
          { name: 'a', value: '7' },
          { name: 'c', value: '8' },
        ],
      }}
      animated
      t={t}
    />,
  );
});
assert.deepEqual(
  renderer!.root
    .findAllByProps({ 'data-testid': 'compute-lab-assignment-payload' })
    .map(node => [node.props['data-target'], node.children.join(''), node.props.style['--compute-lab-payload-offset']]),
  [
    ['a', '7', '-7px'],
    ['c', '8', '7px'],
  ],
  'each observed target gets its own binding value and non-overlapping path',
);

await act(async () => {
  renderer!.update(
    <AssignmentTransferView
      transfer={{ ...transfer, evaluatedValue: '8', targets: [{ name: 'a', value: '8' }] }}
      animated={false}
      t={t}
    />,
  );
});
assert.equal(
  renderer!.root.findByProps({ 'data-testid': 'compute-lab-assignment-target-a' }).findByType('span').children.join(''),
  'a · 8',
  'a seek/pause render cannot retain an in-between payload from the previous step',
);
renderer!.unmount();

console.log('Rendered assignment transfer phases passed');
