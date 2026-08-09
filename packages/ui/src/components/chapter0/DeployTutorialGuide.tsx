import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useT } from '../../hooks/useT';
import { useGameStore } from '../../store/gameStore';

type DeployStage =
  | 'hello_preview'
  | 'hello_deploy_open'
  | 'hello_deploy_confirm'
  | 'hello_deploy_execute'
  | 'hello_log'
  | 'miner_preview'
  | 'miner_deploy_open'
  | 'miner_edge_select'
  | 'miner_pickaxe_equip'
  | 'miner_deploy_confirm'
  | 'miner_deploy_execute'
  | 'handoff';

interface TutorialSession {
  stage: DeployStage;
  world: {
    deployTutorial: {
      grantedItems: boolean;
      selectedEdgeId: string | null;
      selectedPickaxeType: string | null;
      helloWorkerId: string | null;
      minerWorkerId: string | null;
    };
  };
}

interface Props {
  stage: DeployStage;
  session: TutorialSession;
  onDismiss: () => void;
}

const HELLO_WORKER_CODE = `class HelloWorker(WorkerClass):
    class_name = "HelloWorker"
    class_id = "helloworker"

    def on_startup(self):
        self.info("I just started!")

    def on_loop(self):
        self.info("Still running...")`;

const TUTORIAL_MINER_CODE = `class TutorialMiner(WorkerClass):
    class_name = "TutorialMiner"
    class_id = "tutorial_miner"

    route = self.edge          # movement path
    pickaxe = self.pickaxe     # mining equipment`;

const HELLO_STEPS: DeployStage[] = [
  'hello_preview',
  'hello_deploy_open',
  'hello_deploy_confirm',
  'hello_deploy_execute',
  'hello_log',
];

const MINER_STEPS: DeployStage[] = [
  'miner_preview',
  'miner_deploy_open',
  'miner_edge_select',
  'miner_pickaxe_equip',
  'miner_deploy_confirm',
  'miner_deploy_execute',
];

function isMinerStage(stage: DeployStage): boolean {
  return stage.startsWith('miner_');
}

function phaseForStage(stage: DeployStage): 'hello' | 'miner' {
  return isMinerStage(stage) ? 'miner' : 'hello';
}

function isPreviewStage(stage: DeployStage): boolean {
  return stage === 'hello_preview' || stage === 'miner_preview';
}

export function DeployTutorialGuide({ stage, session, onDismiss }: Props) {
  const t = useT();
  const selectedNodeId = useGameStore(s => s.selectedNodeId);
  const codeServerConnected = useGameStore(s => s.codeServerConnected);
  const questsOpen = useGameStore(s => s.questsOpen);
  const selectedQuestId = useGameStore(s => s.selectedQuestId);
  const setGameState = useGameStore(s => s.setState);
  const selectWorker = useGameStore(s => s.selectWorker);
  const workerLogs = useGameStore(s => s.workerLogs);
  const setWorkerLogs = useGameStore(s => s.setWorkerLogs);
  const phase = phaseForStage(stage);
  const setupGate = stage === 'hello_preview' && !codeServerConnected;
  const wasSetupGate = useRef(setupGate);
  const setupGateTransition = !setupGate && wasSetupGate.current && (questsOpen || selectedQuestId === 'q_setup');
  const helloWorkerId = session.world.deployTutorial.helloWorkerId;
  const logs = helloWorkerId ? workerLogs[helloWorkerId] || [] : [];
  const [grantError, setGrantError] = useState(false);
  const [logError, setLogError] = useState(false);
  const [advanceError, setAdvanceError] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (setupGate) {
      // Set both fields together so a refresh cannot reopen the panel with a
      // stale quest selection, and repeated effects remain idempotent.
      if (!questsOpen || selectedQuestId !== 'q_setup') {
        setGameState({ questsOpen: true, selectedQuestId: 'q_setup' });
      }
    } else if (wasSetupGate.current && (questsOpen || selectedQuestId === 'q_setup')) {
      // The setup modal is allowed to finish closing while the guard is still
      // in its transition state. Clear both fields in one update so the modal
      // cannot remain visible after code-server connection.
      setGameState({ questsOpen: false, selectedQuestId: null });
    }
    wasSetupGate.current = setupGate;
  }, [setupGate, questsOpen, selectedQuestId, setGameState]);

  // The shell guard consumes an authoritative descriptor, never a boolean.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chapter-zero-deploy-mode', {
      detail: { active: true, phase, stage, setupGate: setupGate || setupGateTransition, setupGateTransition },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('chapter-zero-deploy-mode', {
        detail: { active: false, phase, stage, setupGate: setupGate || setupGateTransition, setupGateTransition },
      }));
    };
  }, [phase, setupGate, setupGateTransition, stage]);

  const publishSession = useCallback((nextSession: TutorialSession) => {
    window.dispatchEvent(new CustomEvent('chapter-zero-deploy-session', { detail: nextSession }));
  }, []);

  const grantItems = useCallback(() => {
    if (!isMinerStage(stage)) return;
    setGrantError(false);
    axios
      .post('/api/tutorial/chapter-zero/stage', { action: 'grant-deploy-items' })
      .then(response => publishSession(response.data))
      .catch(() => setGrantError(true));
  }, [publishSession, stage]);

  useEffect(() => {
    if (stage === 'miner_preview' && !session.world.deployTutorial.grantedItems) grantItems();
  }, [grantItems, session.world.deployTutorial.grantedItems, stage]);

  const fetchHelloLogs = useCallback(() => {
    if (stage !== 'hello_log' || !helloWorkerId) return;
    setLogError(false);
    axios
      .get(`/api/worker/${helloWorkerId}/logs`)
      .then(response => setWorkerLogs(helloWorkerId, response.data.logs || []))
      .catch(() => setLogError(true));
  }, [helloWorkerId, setWorkerLogs, stage]);

  useEffect(() => {
    if (stage !== 'hello_log' || !helloWorkerId) return;
    selectWorker(helloWorkerId);
    if (logs.length === 0) fetchHelloLogs();
  }, [fetchHelloLogs, helloWorkerId, logs.length, selectWorker, stage]);

  const continueToMiner = useCallback(async () => {
    if (advancing || logs.length === 0) return;
    setAdvanceError(false);
    setAdvancing(true);
    try {
      const response = await axios.post('/api/tutorial/chapter-zero/stage', {
        action: 'advance',
        to: 'miner_preview',
      });
      publishSession(response.data);
    } catch {
      setAdvanceError(true);
      fetchHelloLogs();
    } finally {
      setAdvancing(false);
    }
  }, [advancing, fetchHelloLogs, logs.length, publishSession]);

  const isHandoff = stage === 'handoff';
  const copy = useMemo(() => {
    if (stage === 'hello_preview') {
      return selectedNodeId === 'hub'
        ? ['tutorial.chapter_zero.deploy.hello_hub_selected_prompt', 'tutorial.chapter_zero.deploy.hello_hub_selected_hint']
        : ['tutorial.chapter_zero.deploy.hello_hub_prompt', 'tutorial.chapter_zero.deploy.hello_hub_hint'];
    }
    if (stage === 'miner_preview') {
      return selectedNodeId === 'hub'
        ? ['tutorial.chapter_zero.deploy.miner_hub_selected_prompt', 'tutorial.chapter_zero.deploy.miner_hub_selected_hint']
        : ['tutorial.chapter_zero.deploy.miner_hub_prompt', 'tutorial.chapter_zero.deploy.miner_hub_hint'];
    }
    const copyByStage: Record<DeployStage, [string, string]> = {
      hello_preview: ['', ''],
      hello_deploy_open: ['tutorial.chapter_zero.deploy.hello_class_prompt', 'tutorial.chapter_zero.deploy.hello_class_hint'],
      hello_deploy_confirm: ['tutorial.chapter_zero.deploy.hello_confirm_prompt', 'tutorial.chapter_zero.deploy.hello_confirm_hint'],
      hello_deploy_execute: ['tutorial.chapter_zero.deploy.hello_execute_prompt', 'tutorial.chapter_zero.deploy.hello_execute_hint'],
      hello_log: ['tutorial.chapter_zero.deploy.hello_log_prompt', 'tutorial.chapter_zero.deploy.hello_log_hint'],
      miner_preview: ['', ''],
      miner_deploy_open: ['tutorial.chapter_zero.deploy.miner_class_prompt', 'tutorial.chapter_zero.deploy.miner_class_hint'],
      miner_edge_select: ['tutorial.chapter_zero.deploy.miner_edge_prompt', 'tutorial.chapter_zero.deploy.miner_edge_hint'],
      miner_pickaxe_equip: ['tutorial.chapter_zero.deploy.miner_pickaxe_prompt', 'tutorial.chapter_zero.deploy.miner_pickaxe_hint'],
      miner_deploy_confirm: ['tutorial.chapter_zero.deploy.miner_confirm_prompt', 'tutorial.chapter_zero.deploy.miner_confirm_hint'],
      miner_deploy_execute: ['tutorial.chapter_zero.deploy.miner_execute_prompt', 'tutorial.chapter_zero.deploy.miner_execute_hint'],
      handoff: ['', ''],
    };
    return copyByStage[stage];
  }, [selectedNodeId, stage]);

  if (setupGate || questsOpen) return null;

  return (
    <div
      className={`chapter0-deploy-guide${isHandoff ? ' chapter0-deploy-guide--success' : ''}`}
      role="complementary"
      aria-label={t('tutorial.chapter_zero.deploy.guide_label')}
      data-tutorial-surface="guide"
      data-tutorial-stage={stage}
    >
      <div className="chapter0-deploy-guide-inner" data-tutorial-allowed>
        {isHandoff ? (
          <>
            <div className="chapter0-deploy-guide-title">{t('tutorial.chapter_zero.deploy.complete_title')}</div>
            <p className="chapter0-deploy-guide-body">{t('tutorial.chapter_zero.deploy.complete_body')}</p>
            <button className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary" onClick={onDismiss} data-tutorial-allowed>
              {t('tutorial.chapter_zero.continue')}
            </button>
          </>
        ) : (
          <>
            <div className="chapter0-deploy-guide-phase">{t(`tutorial.chapter_zero.deploy.phase_${phase}`)}</div>
            <StepIndicator stage={stage} t={t} />

            {isPreviewStage(stage) && (
              <CodePreview
                fileName={phase === 'hello' ? 'helloworker.py' : 'tutorial_miner'}
                code={phase === 'hello' ? HELLO_WORKER_CODE : TUTORIAL_MINER_CODE}
                title={t(`tutorial.chapter_zero.deploy.${phase}_preview_title`)}
                body={t(`tutorial.chapter_zero.deploy.${phase}_preview_body`)}
              />
            )}

            {stage === 'hello_log' && (
              <div className="chapter0-deploy-log-checkpoint" data-tutorial-worker-log>
                <div className="chapter0-deploy-log-title">{t('tutorial.chapter_zero.deploy.hello_log_title')}</div>
                <div className="chapter0-deploy-log-worker">{helloWorkerId}</div>
                {logs.length > 0 ? (
                  <div className="chapter0-deploy-log-list" aria-live="polite">
                    {logs.slice(-5).map((log, index) => <div key={`${log.created_at}-${index}`}>{log.message}</div>)}
                  </div>
                ) : (
                  <p className="chapter0-deploy-guide-hint">{t('tutorial.chapter_zero.deploy.hello_log_waiting')}</p>
                )}
                {logError && (
                  <button onClick={fetchHelloLogs} className="chapter0-deploy-error-retry" data-tutorial-allowed>
                    {t('tutorial.chapter_zero.deploy.retry')}
                  </button>
                )}
                {advanceError && (
                  <div className="chapter0-deploy-error" role="alert">
                    <span>{t('tutorial.chapter_zero.deploy.error_stage_advance')}</span>
                    <button onClick={continueToMiner} className="chapter0-deploy-error-retry" data-tutorial-allowed>
                      {t('tutorial.chapter_zero.deploy.retry')}
                    </button>
                  </div>
                )}
                <button
                  className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary"
                  onClick={continueToMiner}
                  disabled={advancing || logs.length === 0}
                  data-tutorial-allowed
                >
                  {t('tutorial.chapter_zero.deploy.continue_to_miner')}
                </button>
              </div>
            )}

            {grantError && (
              <div className="chapter0-deploy-error" role="alert">
                <span>{t('tutorial.chapter_zero.deploy.error_generic')}</span>
                <button onClick={grantItems} className="chapter0-deploy-error-retry" data-tutorial-allowed>
                  {t('tutorial.chapter_zero.deploy.retry')}
                </button>
              </div>
            )}

            {!isPreviewStage(stage) && stage !== 'hello_log' && (
              <div className="chapter0-deploy-step">
                <p className="chapter0-deploy-guide-body">{t(copy[0])}</p>
                <p className="chapter0-deploy-guide-hint">{t(copy[1])}</p>
              </div>
            )}
            {isPreviewStage(stage) && (
              <div className="chapter0-deploy-step">
                <p className="chapter0-deploy-guide-body">{t(copy[0])}</p>
                <p className="chapter0-deploy-guide-hint">{t(copy[1])}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CodePreview({ fileName, code, title, body }: { fileName: string; code: string; title: string; body: string }) {
  return (
    <section className="chapter0-deploy-code-preview" data-tutorial-allowed aria-label={title}>
      <div className="chapter0-deploy-code-preview-title">{title}</div>
      <p className="chapter0-deploy-guide-hint">{body}</p>
      <div className="chapter0-deploy-code-file">{fileName}</div>
      <pre><code>{code}</code></pre>
    </section>
  );
}

function StepIndicator({ stage, t }: { stage: DeployStage; t: (key: string) => string }) {
  const steps = stage.startsWith('miner_') ? MINER_STEPS : HELLO_STEPS;
  const current = steps.indexOf(stage);
  return (
    <div className="chapter0-deploy-steps" aria-label={t('tutorial.chapter_zero.deploy.steps_label')}>
      {steps.map((step, index) => (
        <div
          key={step}
          className={`chapter0-deploy-step-dot${index <= current ? ' chapter0-deploy-step-dot--done' : ''}`}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="chapter0-deploy-step-label">{t(`tutorial.chapter_zero.deploy.step_${step}`)}</span>
        </div>
      ))}
    </div>
  );
}
