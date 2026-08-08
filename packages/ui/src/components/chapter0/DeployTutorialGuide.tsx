import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useT } from '../../hooks/useT';
import { useGameStore } from '../../store/gameStore';

type DeployStage =
  | 'edge_select'
  | 'pickaxe_equip'
  | 'deploy_confirm'
  | 'deploy_execute'
  | 'deploy_verified'
  | 'handoff';

interface Props {
  stage: DeployStage;
  onDismiss: () => void;
}

export function DeployTutorialGuide({ stage, onDismiss }: Props) {
  const t = useT();
  const selectedNodeId = useGameStore(s => s.selectedNodeId);
  const codeServerConnected = useGameStore(s => s.codeServerConnected);
  const questsOpen = useGameStore(s => s.questsOpen);
  const selectedQuestId = useGameStore(s => s.selectedQuestId);
  const toggleQuests = useGameStore(s => s.toggleQuests);
  const selectQuest = useGameStore(s => s.selectQuest);
  // q_setup's server-owned objective is code_server_connected. Do not keep
  // reopening the task while waiting for a separate worker-class payload;
  // the actual DeployDialog remains responsible for reporting missing classes.
  const codeReady = codeServerConnected;
  const setupGate = stage === 'edge_select' && !codeServerConnected;

  // q_setup is the first task in the quest tree. Keep it open until the code
  // server registers HelloWorker; the deployment map must not be reachable
  // before the player's own Codespace is running.
  useEffect(() => {
    if (!setupGate) return;
    if (!questsOpen) toggleQuests();
    if (selectedQuestId !== 'q_setup') selectQuest('q_setup');
  }, [setupGate, questsOpen, selectedQuestId, toggleQuests, selectQuest]);
  const [grantError, setGrantError] = useState(false);
  const grantItems = useCallback(() => {
    setGrantError(false);
    axios.post('/api/tutorial/chapter-zero/stage', { action: 'grant-deploy-items' }).catch(() => setGrantError(true));
  }, []);
  // Keep the normal node panel → deploy dialog flow. This guide only explains
  // the next control; it must never become a second deployment UI.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chapter-zero-deploy-mode', { detail: true }));
    grantItems();
    return () => {
      window.dispatchEvent(new CustomEvent('chapter-zero-deploy-mode', { detail: false }));
    };
  }, [grantItems]);

  // Chapter Zero's first deployment action is deliberately a real map click.
  // Capture and reject clicks elsewhere while the Hub target is active.
  useEffect(() => {
    if (stage !== 'edge_select' || !codeReady || selectedNodeId === 'hub') return;
    const blockOutsideHub = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-id="hub"]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', blockOutsideHub, true);
    return () => document.removeEventListener('click', blockOutsideHub, true);
  }, [stage, selectedNodeId, codeReady]);

  useEffect(() => {
    const targetingHub = stage === 'edge_select' && codeReady && selectedNodeId !== 'hub';
    document.body.classList.toggle('chapter0-target-hub', targetingHub);
    return () => document.body.classList.remove('chapter0-target-hub');
  }, [stage, selectedNodeId, codeReady]);

  const isHandoff = stage === 'handoff' || stage === 'deploy_verified';

  if (isHandoff) {
    return (
      <div className="chapter0-deploy-guide chapter0-deploy-guide--success" role="status">
        <div className="chapter0-deploy-guide-inner">
          <div className="chapter0-deploy-guide-title">
            {t('tutorial.chapter_zero.deploy.complete_title')}
          </div>
          <p className="chapter0-deploy-guide-body">
            {t('tutorial.chapter_zero.deploy.complete_body')}
          </p>
          <button
            className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary"
            onClick={onDismiss}
          >
            {t('tutorial.chapter_zero.continue')}
          </button>
        </div>
      </div>
    );
  }

  if (setupGate) return null;

  const copy = {
    edge_select: selectedNodeId === 'hub'
      ? ['tutorial.chapter_zero.deploy.hub_selected_prompt', 'tutorial.chapter_zero.deploy.hub_selected_hint']
      : ['tutorial.chapter_zero.deploy.hub_prompt', 'tutorial.chapter_zero.deploy.hub_hint'],
    pickaxe_equip: ['tutorial.chapter_zero.deploy.pickaxe_prompt', 'tutorial.chapter_zero.deploy.equipment_hint'],
    deploy_confirm: ['tutorial.chapter_zero.deploy.confirm_prompt', 'tutorial.chapter_zero.deploy.confirm_cta'],
    deploy_execute: ['tutorial.chapter_zero.deploy.execute_prompt', 'tutorial.chapter_zero.deploy.execute_cta'],
  }[stage];

  const forceHub = stage === 'edge_select' && codeReady && selectedNodeId !== 'hub';

  return (
    <>
      {forceHub && <div className="chapter0-deploy-blocker" aria-hidden="true" />}
      <div className={`chapter0-deploy-guide${forceHub ? ' chapter0-deploy-guide--targeting' : ''}`} role="complementary" aria-label={t('tutorial.chapter_zero.deploy.guide_label')}>

      <div className="chapter0-deploy-guide-inner">
        <StepIndicator stage={stage} t={t} />

        {grantError && (
          <div className="chapter0-deploy-error" role="alert">
            <span>{t('tutorial.chapter_zero.deploy.error_generic')}</span>
            <button onClick={grantItems} className="chapter0-deploy-error-retry">
              {t('tutorial.chapter_zero.deploy.retry')}
            </button>
          </div>
        )}

        <div className="chapter0-deploy-step">
          <p className="chapter0-deploy-guide-body">{t(copy[0])}</p>
          <p className="chapter0-deploy-guide-hint">{t(copy[1])}</p>
        </div>
      </div>
      </div>
    </>
  );
}

function StepIndicator({ stage, t }: { stage: DeployStage; t: (key: string) => string }) {
  const steps: DeployStage[] = ['edge_select', 'pickaxe_equip', 'deploy_confirm', 'deploy_execute'];
  const current = steps.indexOf(stage);

  return (
    <div className="chapter0-deploy-steps" aria-label={t('tutorial.chapter_zero.deploy.steps_label')}>
      {steps.map((s, i) => (
        <div
          key={s}
          className={`chapter0-deploy-step-dot${i <= current ? ' chapter0-deploy-step-dot--done' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="chapter0-deploy-step-label">{t(`tutorial.chapter_zero.deploy.step_${s}`)}</span>
        </div>
      ))}
    </div>
  );
}
