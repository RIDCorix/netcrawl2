import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useT } from '../../hooks/useT';

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

  const copy = {
    edge_select: ['tutorial.chapter_zero.deploy.edge_prompt', 'tutorial.chapter_zero.deploy.edge_cta'],
    pickaxe_equip: ['tutorial.chapter_zero.deploy.pickaxe_prompt', 'tutorial.chapter_zero.deploy.equipment_hint'],
    deploy_confirm: ['tutorial.chapter_zero.deploy.confirm_prompt', 'tutorial.chapter_zero.deploy.confirm_cta'],
    deploy_execute: ['tutorial.chapter_zero.deploy.execute_prompt', 'tutorial.chapter_zero.deploy.execute_cta'],
  }[stage];

  return (
    <div className="chapter0-deploy-guide" role="complementary" aria-label={t('tutorial.chapter_zero.deploy.guide_label')}>

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
