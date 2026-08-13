import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('packages/ui/src/components/chapter0/ChapterZeroCodeEditor.tsx', 'utf8');
const repl = readFileSync('packages/ui/src/components/ChapterZeroRepl.tsx', 'utf8');
const styles = readFileSync('packages/ui/src/styles.css', 'utf8');
const nodeWrapper = readFileSync('packages/ui/src/components/graph/NodeWrapper.tsx', 'utf8');
const deployDialog = readFileSync('packages/ui/src/components/DeployDialog.tsx', 'utf8');
const deployGuide = readFileSync('packages/ui/src/components/chapter0/DeployTutorialGuide.tsx', 'utf8');
const app = readFileSync('packages/ui/src/App.tsx', 'utf8');
const nodePanel = readFileSync('packages/ui/src/components/NodeDetailPanel.tsx', 'utf8');
const workerPanel = readFileSync('packages/ui/src/components/WorkerDetailPanel.tsx', 'utf8');
const tutorialOverlay = readFileSync('packages/ui/src/components/TutorialOverlay.tsx', 'utf8');
const connectDialog = readFileSync('packages/ui/src/components/ConnectDialog.tsx', 'utf8');
const questGuideDialog = readFileSync('packages/ui/src/components/QuestGuideDialog.tsx', 'utf8');
const zhTW = readFileSync('packages/ui/src/i18n/zh-TW.ts', 'utf8');
const en = readFileSync('packages/ui/src/i18n/en.ts', 'utf8');
const ja = readFileSync('packages/ui/src/i18n/ja.ts', 'utf8');

assert.equal(
  (editor.match(/className="chapter0-editor-document"/g) ?? []).length,
  1,
  'editor must render one document',
);
for (const range of ['class', 'identity', 'edge', 'startup', 'loop']) {
  assert.ok(
    editor.includes(`range="${range}"`) || editor.includes(`data-code-range="${range}"`),
    `${range} must have a selectable code range`,
  );
}
assert.match(editor, /\{loopUnlocked && \(/, 'on_loop must remain absent before its checkpoint');
assert.match(editor, /MethodBody value=\{startup\}/, 'startup body must be editable inside the document');
assert.match(editor, /MethodBody value=\{loop\}/, 'loop body must be editable inside the document');

assert.match(repl, /for \(const tick of result\.ticks\)/, 'code-run ticks must be replayed in order');
assert.match(repl, /for \(const statement of tick\.statements\)/, 'statements must be replayed in order');
assert.match(repl, /setVisualWorkerAt\(/, 'playback must drive the visible worker position');
assert.ok(
  repl.indexOf('commitSession(result.session)') > repl.indexOf('for (const tick of result.ticks)'),
  'authoritative state must commit after playback',
);

assert.match(styles, /\.chapter0-screen-fading\s*\{[^}]*opacity:\s*0/s, 'screen fade-out must be defined');
assert.match(styles, /\.chapter0-stage-fade\s*\{[^}]*animation:/s, 'screen fade-in must be defined');
assert.match(styles, /prefers-reduced-motion:\s*reduce/, 'reduced motion must be supported');
assert.doesNotMatch(
  styles,
  /\.chapter0-coldopen-fading\s*\{[^}]*opacity:\s*0/s,
  'cold-open fade must not make the opaque overlay transparent',
);
assert.match(
  styles,
  /\.chapter0-coldopen-fading\s*>\s*\*\s*\{[^}]*opacity:\s*0/s,
  'cold-open fade must target scene content only',
);
assert.match(
  styles,
  /\.chapter0-voicearrival\.chapter0-screen-fading\s*\{[^}]*opacity:\s*1/s,
  'voice-arrival fade must keep its black overlay opaque',
);
assert.match(
  styles,
  /\.chapter0-voicearrival\.chapter0-screen-fading\s*>\s*\*\s*\{[^}]*opacity:\s*0/s,
  'voice-arrival fade must target scene content only',
);
assert.match(
  nodeWrapper,
  /data-tutorial-target=\{nodeId\}/,
  'map nodes must expose a stable tutorial target marker',
);
assert.match(repl, /DeployTutorialGuide/, 'the tutorial guide must remain visible');
assert.match(repl, /HANDOFF_DISMISSAL_KEY = 'netcrawl-chapter-zero-handoff-dismissed'/, 'handoff acknowledgement must have durable storage');
assert.match(repl, /useState\(loadHandoffDismissal\)/, 'handoff acknowledgement must load when the game opens');
assert.match(repl, /state\.stage === 'handoff' && handoffDismissed/, 'an acknowledged handoff must not render its completion card again');
assert.match(repl, /localStorage\.setItem\(HANDOFF_DISMISSAL_KEY, 'true'\)/, 'continuing from the completion card must persist the acknowledgement');
for (const stage of [
  'hello_preview', 'hello_deploy_open', 'hello_deploy_confirm', 'hello_deploy_execute', 'hello_log',
  'miner_preview', 'miner_deploy_open', 'miner_edge_select', 'miner_pickaxe_equip',
  'miner_deploy_confirm', 'miner_deploy_execute',
]) {
  assert.match(repl, new RegExp(`'${stage}'`), `${stage} must be part of the v4 client stage order`);
}
assert.match(deployGuide, /helloworker\.py/, 'HelloWorker code preview must show its canonical filename');
assert.match(deployGuide, /class_id = "miner"/, 'Miner code preview must show the code-server class id');
assert.match(deployGuide, /minerCandidateWorkerId/, 'guide must poll the verified Miner candidate');
assert.match(deployGuide, /minerCompletedLoops/, 'guide must show completed on_loop cycles');
assert.match(deployGuide, /miner-retry/, 'guide must offer terminal Miner recovery');
assert.match(deployGuide, /hello_log/, 'guide must own the HelloWorker log checkpoint');
assert.match(deployGuide, /helloWorkerId/, 'guide must target the verified HelloWorker');
assert.doesNotMatch(deployDialog, /__hello_worker__|__no_equipment__/, 'tutorial deployment must not use sentinel values');
assert.match(deployDialog, /data-tutorial-dialog/, 'tutorial dialog must expose an allowlisted surface');
assert.match(deployDialog, /tutorial\?: TutorialDeployDescriptor/, 'tutorial dialog must use an explicit descriptor');
assert.doesNotMatch(deployDialog, /tutorialMode\?: boolean/, 'tutorial mode must not be a boolean contract');
assert.match(app, /ChapterZeroInteractionGuard/, 'application shell must install the tutorial interaction guard');
assert.match(app, /stopImmediatePropagation/, 'interaction guard must block unrelated state mutations');
assert.match(app, /focusin/, 'interaction guard must retain focus within the allowed surface');
assert.match(
  deployGuide,
  /wasSetupGate = useRef\(setupGate\)/,
  'setup gate transitions must remember the previous connection state',
);
assert.match(
  deployGuide,
  /const setupGateTransition = !setupGate && wasSetupGate\.current && \(questsOpen \|\| selectedQuestId === 'q_setup'\)/,
  'false-to-true connection transitions must identify the still-open setup surface',
);
assert.match(
  deployGuide,
  /setGameState\(\{ questsOpen: true, selectedQuestId: 'q_setup' \}\)/,
  'the disconnected refresh path must open q_setup atomically',
);
assert.match(
  deployGuide,
  /setGameState\(\{ questsOpen: false, selectedQuestId: null \}\)/,
  'connection must close the setup quest and quest panel together',
);
assert.match(
  deployGuide,
  /const codeServerUp = codeServerConnected \|\| workerClasses\.length > 0/,
  'a registered worker class must release the setup gate even before the boolean status push arrives',
);
assert.match(
  deployGuide,
  /const setupGate = stage === 'hello_preview' && !codeServerUp/,
  'the setup gate must use the live-server signal',
);
assert.match(questGuideDialog, /data-code-server-status=\{codeServerUp \? 'connected' : 'waiting'\}/, 'Dev Setup must expose live connection status');
assert.match(questGuideDialog, /quest\.q_setup\.connection_connected/, 'Dev Setup must render its connected status copy');
assert.doesNotMatch(
  connectDialog,
  /localStorage\.getItem\(['"]netcrawl-token['"]\)/,
  'Connect dialog must never copy the browser login token into Code Server configuration',
);
assert.doesNotMatch(
  questGuideDialog,
  /localStorage\.getItem\(['"]netcrawl-token['"]\)/,
  'setup guide must never copy the browser login token into Code Server configuration',
);
assert.match(
  connectDialog,
  /useCodeServerCredentials\(connectOpen\)/,
  'Connect dialog must request a dedicated Code Server credential when opened',
);
for (const previewStage of ['hello_preview', 'miner_preview']) {
  assert.match(
    styles,
    new RegExp(`\\[data-tutorial-stage="${previewStage}"\\] \\.chapter0-deploy-guide-inner[\\s\\S]{0,160}pointer-events:\\s*none`),
    `${previewStage} guide must not intercept clicks meant for its highlighted map target`,
  );
}
assert.match(
  deployGuide,
  /setupGate: setupGate \|\| setupGateTransition, setupGateTransition/,
  'setup cleanup must keep the guard on the transition allowlist until it finishes',
);
assert.match(
  app,
  /const setupSurfaceAllowed = tutorial\.setupGate \|\| tutorial\.setupGateTransition/,
  'guard must preserve setup-surface access during connection cleanup',
);
assert.match(
  app,
  /return !setupSurfaceAllowed && \(tutorial\.stage === 'hello_preview' \|\| tutorial\.stage === 'miner_preview'\)/,
  'hub and deploy targets must remain locked until setup cleanup completes',
);
assert.ok(
  app.includes("target.matches('.react-flow__pane')") &&
    app.includes("eventType === 'pointerdown'") &&
    app.includes("eventType === 'click'") &&
    app.includes('isAllowed(event.target, event.type)'),
  'tutorial interaction guard must allow map-pane panning events without allowlisting node descendants',
);
assert.match(nodePanel, /data-tutorial-target=\{chapterZeroDeploy \? 'deploy'/, 'Hub deploy must be a stable tutorial target');
assert.match(nodePanel, /!chapterZeroDeploy\.setupGate/, 'Hub deploy must stay locked during code-server setup');
assert.match(workerPanel, /data-tutorial-worker-log/, 'HelloWorker logs must be a stable tutorial target');
for (const locale of [en, zhTW, ja]) {
  assert.match(locale, /tutorial\.chapter_zero\.deploy\.hello_preview_title/, 'all locales need the Hello preview copy');
  assert.match(locale, /tutorial\.chapter_zero\.deploy\.miner_preview_title/, 'all locales need the miner preview copy');
  assert.match(locale, /tutorial\.chapter_zero\.deploy\.continue_to_miner/, 'all locales need the log checkpoint CTA');
  assert.match(locale, /quest\.q_setup\.connection_connected/, 'all locales need Dev Setup connection status copy');
}
assert.doesNotMatch(styles, /chapter0-deploy-blocker|chapter0-target-hub/, 'the dimming guide styles must be removed');
assert.doesNotMatch(
  styles,
  /\[data-chapter-zero-tutorial\]\s+\[data-tutorial-locked="true"\][^{]*\{[^}]*pointer-events:\s*none/s,
  'tutorial locked panels must not disable pointer events for their allowlisted controls',
);
assert.match(
  readFileSync('packages/ui/src/components/graph/nodes/HubNode.tsx', 'utf8'),
  /border:\s*['"]2px solid var\(--accent\)['"]/,
  'the Hub node must retain a slightly larger accent border',
);
assert.match(deployDialog, /if \(advancing \|\| !canGoNext\(\)\) return;/, 'stage advance must ignore duplicate clicks');
assert.match(deployDialog, /disabled=\{advancing \|\| !canGoNext\(\)\}/, 'stage advance control must lock while saving');
assert.match(tutorialOverlay, /skipToConnection/, 'the first tutorial step must expose a connection-step skip action');
assert.match(tutorialOverlay, /selectQuest\('q_setup'\)/, 'skipping the first tutorial step must open code server setup');
const deployCopy = zhTW.slice(
  zhTW.indexOf("'tutorial.chapter_zero.deploy.hub_prompt'"),
  zhTW.indexOf("'tutorial.chapter_zero.deploy.edge_selecting'"),
);
assert.match(deployCopy, /高亮的基地/,'zh-TW deploy prompt must use the localized map term');
assert.doesNotMatch(deployCopy, /Hub/, 'zh-TW deploy copy must not use the English Hub label');

console.log('Chapter Zero UI structure, highlight, transition, and playback contracts passed');
