import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { Node } from 'reactflow';
import { ComputeLabScreen } from '../packages/ui/src/components/ComputeLabScreen';
import { NodeDetailPanel } from '../packages/ui/src/components/NodeDetailPanel';
import { DeployDialog } from '../packages/ui/src/components/DeployDialog';
import { ActionButton } from '../packages/ui/src/components/nodeDetail/NodeDetailWidgets';
import { useGameStore, type GameNode } from '../packages/ui/src/store/gameStore';

type KeyHandler = (event: KeyboardEvent) => void;
const keyHandlers = new Set<KeyHandler>();
const windowMock = {
  addEventListener: (type: string, handler: KeyHandler) => {
    if (type === 'keydown') keyHandlers.add(handler);
  },
  removeEventListener: (type: string, handler: KeyHandler) => {
    if (type === 'keydown') keyHandlers.delete(handler);
  },
  dispatchEvent: () => true,
  setTimeout,
  clearTimeout,
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class HTMLElement {} });
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => undefined });

const addNode: GameNode = {
  id: 'e_op_add',
  type: 'compute',
  position: { x: 0, y: 0 },
  data: { label: 'ADD', unlocked: true },
};

useGameStore.setState({
  computeLabOpen: true,
  computeLabSourceNodeId: addNode.id,
  nodes: [addNode],
  edges: [],
  selectedNodeId: addNode.id,
  workerClasses: [],
});

function GraphStub({ nodes, onNodeClick }: { nodes: Node[]; onNodeClick: (_: unknown, node: Node) => void }) {
  return (
    <div data-lab-graph>
      {nodes.map(node => (
        <button key={node.id} data-lab-node={node.id} onClick={() => onNodeClick(null, node)} />
      ))}
    </div>
  );
}

let lab: TestRenderer.ReactTestRenderer;
act(() => {
  lab = TestRenderer.create(<ComputeLabScreen GraphCanvasComponent={GraphStub as never} />);
});
assert.equal(
  lab!.root.findByType(NodeDetailPanel).props.nodeOverride,
  null,
  'Lab must open without falling back to the selected world node',
);

for (const nodeId of ['lab_start', 'lab_operator', 'lab_input_a', 'lab_input_b', 'lab_result']) {
  act(() => lab!.root.findByProps({ 'data-lab-node': nodeId }).props.onClick());
  assert.equal(lab!.root.findByType(NodeDetailPanel).props.nodeOverride.id, nodeId);
  const closeButton = lab!.root
    .findAllByProps({ 'data-node-panel-close': true })
    .find(candidate => candidate.type === 'button');
  assert.ok(closeButton);
  act(() => closeButton.props.onClick());
  assert.equal(lab!.root.findByType(NodeDetailPanel).props.nodeOverride, null, `${nodeId} panel must stay closed`);
}

act(() => lab!.root.findByProps({ 'data-lab-node': 'lab_start' }).props.onClick());
const deployButton = lab!.root.findByType(ActionButton);
await act(async () => deployButton.props.onClick());
assert.equal(lab!.root.findAllByType(DeployDialog).length, 1, 'real DeployDialog must remain mounted');
assert.equal(lab!.root.findByType(DeployDialog).props.nodeId, 'e_op_add');
assert.equal(lab!.root.findByType(NodeDetailPanel).props.nodeOverride.id, 'lab_start');

for (const key of ['Escape', 'Tab']) {
  let prevented = false;
  act(() => {
    for (const handler of keyHandlers) {
      handler({ key, preventDefault: () => (prevented = true), shiftKey: false } as KeyboardEvent);
    }
  });
  assert.equal(prevented, false, `outer Lab must not handle ${key} while deploy dialog is open`);
  assert.equal(useGameStore.getState().computeLabOpen, true);
  assert.equal(lab!.root.findAllByType(DeployDialog).length, 1);
  assert.equal(lab!.root.findByType(NodeDetailPanel).props.nodeOverride.id, 'lab_start');
}

act(() => {
  lab!.unmount();
});

console.log('Compute Lab selection, panel, deploy, and nested-keyboard interactions passed');
