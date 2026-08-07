import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useGameStore, type GameEdge, type InventoryItem } from '../../store/gameStore';
import { useT } from '../../hooks/useT';

type DeployStage =
  | 'edge_select'
  | 'pickaxe_equip'
  | 'deploy_confirm'
  | 'deploy_execute'
  | 'deploy_verified'
  | 'handoff';

interface DeployWorld {
  deployTutorial: {
    grantedItems: boolean;
    selectedEdgeId: string | null;
    selectedPickaxeType: string | null;
    workerId: string | null;
  };
}

interface Props {
  stage: DeployStage;
  world: DeployWorld;
  onSessionUpdate: (session: any) => void;
  onDismiss: () => void;
  reducedMotion: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DeployTutorialGuide({ stage, world, onSessionUpdate, onDismiss, reducedMotion }: Props) {
  const t = useT();
  const { edges: gameEdges, nodes: gameNodes, playerInventory, setEdgeSelectMode } = useGameStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectingEdge, setSelectingEdge] = useState(false);

  const dt = world.deployTutorial;

  // Hub edges — edges connected to hub node
  const hubEdges = useMemo(
    () => gameEdges.filter(e => e.source === 'hub' || e.target === 'hub'),
    [gameEdges],
  );

  // Pickaxes in player inventory
  const pickaxes = useMemo(
    () => playerInventory.filter(i => i.itemType.startsWith('pickaxe_') && i.count > 0),
    [playerInventory],
  );

  // Grant items on mount if not yet done
  useEffect(() => {
    if (dt?.grantedItems) return;
    axios
      .post('/api/tutorial/chapter-zero/stage', { action: 'grant-deploy-items' })
      .then(r => { if (r.data?.stage) onSessionUpdate(r.data); })
      .catch(() => {});
  }, []);

  const setEdge = useCallback(
    async (edge: GameEdge) => {
      setSelectingEdge(false);
      setEdgeSelectMode(null);
      setError(null);
      setBusy(true);
      try {
        // Set edge selection
        await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'set-deploy-edge',
          edgeId: edge.id,
        });
        // Advance to pickaxe_equip
        const r = await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'advance',
          to: 'pickaxe_equip',
        });
        onSessionUpdate(r.data);
      } catch (e: any) {
        setError(t('tutorial.chapter_zero.deploy.error_generic'));
      } finally {
        setBusy(false);
      }
    },
    [onSessionUpdate, setEdgeSelectMode, t],
  );

  const activateEdgeSelect = useCallback(() => {
    setSelectingEdge(true);
    setEdgeSelectMode({
      fieldName: 'route',
      onSelect: edge => setEdge(edge),
    });
  }, [setEdge, setEdgeSelectMode]);

  // Deactivate edge select if stage changes away
  useEffect(() => {
    if (stage !== 'edge_select') {
      setSelectingEdge(false);
      setEdgeSelectMode(null);
    }
    return () => {
      setEdgeSelectMode(null);
    };
  }, [stage, setEdgeSelectMode]);

  const selectPickaxe = useCallback(
    async (item: InventoryItem) => {
      setError(null);
      setBusy(true);
      try {
        await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'set-deploy-pickaxe',
          pickaxeType: item.itemType,
        });
        const r = await axios.post('/api/tutorial/chapter-zero/stage', {
          action: 'advance',
          to: 'deploy_confirm',
        });
        onSessionUpdate(r.data);
      } catch (e: any) {
        setError(t('tutorial.chapter_zero.deploy.error_generic'));
      } finally {
        setBusy(false);
      }
    },
    [onSessionUpdate, t],
  );

  const confirmDeploy = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await axios.post('/api/tutorial/chapter-zero/stage', {
        action: 'advance',
        to: 'deploy_execute',
      });
      onSessionUpdate(r.data);
    } catch {
      setError(t('tutorial.chapter_zero.deploy.error_generic'));
    } finally {
      setBusy(false);
    }
  }, [onSessionUpdate, t]);

  const executeDeploy = useCallback(async () => {
    if (!dt?.selectedEdgeId || !dt?.selectedPickaxeType) {
      setError(t('tutorial.chapter_zero.deploy.error_missing'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const deployRes = await axios.post('/api/deploy', {
        nodeId: 'hub',
        classId: 'tutorial_miner',
        equippedItems: { pickaxe: dt.selectedPickaxeType },
        routes: { route: [dt.selectedEdgeId] },
      });
      if (!deployRes.data?.workerId) throw new Error('no workerId');

      const r = await axios.post('/api/tutorial/chapter-zero/stage', {
        action: 'verify-deploy',
        workerId: deployRes.data.workerId,
      });
      onSessionUpdate(r.data);
    } catch (e: any) {
      const msg = e?.response?.data?.error;
      if (msg) {
        setError(t('tutorial.chapter_zero.deploy.error_api', { reason: msg }));
      } else {
        setError(t('tutorial.chapter_zero.deploy.error_generic'));
      }
    } finally {
      setBusy(false);
    }
  }, [dt, onSessionUpdate, t]);

  const retry = useCallback(() => {
    setError(null);
  }, []);

  // Look up selected edge label for display
  const selectedEdge = useMemo(
    () => (dt?.selectedEdgeId ? gameEdges.find(e => e.id === dt.selectedEdgeId) : null),
    [dt?.selectedEdgeId, gameEdges],
  );
  const edgeLabel = selectedEdge
    ? `${selectedEdge.source} → ${selectedEdge.target}`
    : null;

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

  return (
    <div className="chapter0-deploy-guide" role="complementary" aria-label={t('tutorial.chapter_zero.deploy.guide_label')}>
      {/* Dim overlay — pointer-events none so player can interact with map */}
      <div className="chapter0-deploy-dim" aria-hidden="true" />

      <div className="chapter0-deploy-guide-inner">
        <StepIndicator stage={stage} t={t} />

        {/* Error banner */}
        {error && (
          <div className="chapter0-deploy-error" role="alert">
            <span>{error}</span>
            <button onClick={retry} className="chapter0-deploy-error-retry">
              {t('tutorial.chapter_zero.deploy.retry')}
            </button>
          </div>
        )}

        {/* Stage: edge_select */}
        {stage === 'edge_select' && (
          <div className="chapter0-deploy-step">
            <p className="chapter0-deploy-guide-body">
              {selectingEdge
                ? t('tutorial.chapter_zero.deploy.edge_selecting')
                : t('tutorial.chapter_zero.deploy.edge_prompt')}
            </p>
            {!selectingEdge ? (
              <button
                className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary"
                onClick={activateEdgeSelect}
                disabled={busy}
              >
                {t('tutorial.chapter_zero.deploy.edge_cta')}
              </button>
            ) : (
              <div className="chapter0-deploy-edge-list">
                <p className="chapter0-deploy-guide-hint">{t('tutorial.chapter_zero.deploy.edge_click_hint')}</p>
                {hubEdges.map(edge => (
                  <button
                    key={edge.id}
                    className="chapter0-deploy-edge-item"
                    onClick={() => setEdge(edge)}
                  >
                    {edge.source} → {edge.target}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stage: pickaxe_equip */}
        {stage === 'pickaxe_equip' && (
          <div className="chapter0-deploy-step">
            {edgeLabel && (
              <p className="chapter0-deploy-guide-hint">
                {t('tutorial.chapter_zero.deploy.edge_selected', { edge: edgeLabel })}
              </p>
            )}
            <p className="chapter0-deploy-guide-body">
              {t('tutorial.chapter_zero.deploy.pickaxe_prompt')}
            </p>
            {pickaxes.length === 0 ? (
              <p className="chapter0-deploy-error" role="alert">
                {t('tutorial.chapter_zero.deploy.error_no_pickaxe')}
              </p>
            ) : (
              <div className="chapter0-deploy-pickaxe-list">
                {pickaxes.map(item => (
                  <button
                    key={item.itemType}
                    className="chapter0-deploy-pickaxe-item"
                    onClick={() => selectPickaxe(item)}
                    disabled={busy}
                  >
                    {t(`item.${item.itemType}.name`)} ×{item.count}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stage: deploy_confirm */}
        {stage === 'deploy_confirm' && (
          <div className="chapter0-deploy-step">
            <p className="chapter0-deploy-guide-body">
              {t('tutorial.chapter_zero.deploy.confirm_prompt')}
            </p>
            <ul className="chapter0-deploy-summary">
              <li>{t('tutorial.chapter_zero.deploy.summary_class')}: TutorialMiner</li>
              <li>{t('tutorial.chapter_zero.deploy.summary_node')}: Hub</li>
              {edgeLabel && <li>{t('tutorial.chapter_zero.deploy.summary_edge')}: {edgeLabel}</li>}
              {dt?.selectedPickaxeType && (
                <li>{t('tutorial.chapter_zero.deploy.summary_pickaxe')}: {t(`item.${dt.selectedPickaxeType}.name`)}</li>
              )}
            </ul>
            <button
              className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary"
              onClick={confirmDeploy}
              disabled={busy}
            >
              {t('tutorial.chapter_zero.deploy.confirm_cta')}
            </button>
          </div>
        )}

        {/* Stage: deploy_execute */}
        {stage === 'deploy_execute' && (
          <div className="chapter0-deploy-step">
            <p className="chapter0-deploy-guide-body">
              {t('tutorial.chapter_zero.deploy.execute_prompt')}
            </p>
            <button
              className="chapter0-deploy-guide-btn chapter0-deploy-guide-btn--primary"
              onClick={executeDeploy}
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? t('tutorial.chapter_zero.deploy.executing')
                : t('tutorial.chapter_zero.deploy.execute_cta')}
            </button>
          </div>
        )}
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
