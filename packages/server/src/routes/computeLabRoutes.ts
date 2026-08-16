import { Router, Request, Response } from 'express';
import { getGameState } from '../domain/gameState.js';
import { getActiveComputeLabTask, getComputeTask, submitComputeAnswer } from '../actions/computeActions.js';
import { getUserId, sendError } from './helpers.js';
import { isCodeServerConnected, isValidCodeServerLease } from '../codeServerTracker.js';
import { enqueueComputeLabRun } from '../workerRegistry.js';
import {
  TRACE_LIMITS,
  acceptComputeLabFrame,
  createComputeLabRun,
  finishComputeLabRun,
  getComputeLabRun,
  publicRun,
} from '../computeLab.js';

export const computeLabRoutes: Router = Router();

function unlockedCompute(nodeId: string, userId?: string) {
  const node = getGameState(userId).nodes.find(node => node.id === nodeId);
  return node?.type === 'compute' && node.data?.unlocked ? node : undefined;
}

computeLabRoutes.post('/compute-lab/tasks', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const nodeId = String(req.body?.nodeId || '');
  const node = unlockedCompute(nodeId, uid);
  if (!node) return sendError(res, 403, 'Compute node is locked or unavailable', 'locked_node');
  const task = await getComputeTask(nodeId, node, uid);
  if (!task.ok) return res.status(task.reason === 'cooldown' ? 429 : 400).json(task);
  const labTask = getActiveComputeLabTask(nodeId, task.taskId, uid);
  if (!labTask) return sendError(res, 409, 'Task expired; get a new task before running', 'invalid_task');
  const { hint: _hint, params: _params, ...publicTask } = task;
  res.json({ ...publicTask, ...labTask, limits: TRACE_LIMITS });
});

computeLabRoutes.post('/compute-lab/runs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { taskId, source, revision, nodeId } = req.body || {};
  const node = unlockedCompute(String(nodeId || ''), uid);
  if (!node) return sendError(res, 403, 'Compute node is locked or unavailable', 'locked_node');
  if (!taskId || typeof source !== 'string' || !Number.isInteger(revision))
    return sendError(res, 400, 'taskId, source, and integer revision required', 'invalid_run');
  if (!isCodeServerConnected(uid))
    return sendError(res, 409, 'Connect a Code Server before running code', 'disconnected');
  const task = getActiveComputeLabTask(String(nodeId), String(taskId), uid);
  if (!task) return sendError(res, 409, 'Task expired; get a new task before running', 'invalid_task');
  const run = createComputeLabRun({
    userId: uid,
    nodeId: String(nodeId),
    taskId: String(taskId),
    source,
    revision,
    sessionId: '',
  });
  enqueueComputeLabRun({ runId: run.id, source, ...task, limits: TRACE_LIMITS }, uid);
  res.status(202).json({ ok: true, runId: run.id, status: run.status });
});

computeLabRoutes.get('/compute-lab/runs/:runId', (req: Request, res: Response) => {
  const run = getComputeLabRun(String(req.params.runId), getUserId(req));
  if (!run) return sendError(res, 404, 'Run not found', 'invalid_run');
  res.json({ ok: true, run: publicRun(run) });
});

computeLabRoutes.post('/runtime/compute-lab-runs/:runId/events', (req: Request, res: Response) => {
  const uid = getUserId(req);
  if (!isValidCodeServerLease(req.body?.sessionId, uid))
    return sendError(res, 409, 'Code Server lease expired', 'stale_execution');
  const accepted = acceptComputeLabFrame(String(req.params.runId), req.body?.frame, uid);
  if (!accepted.ok) {
    if (accepted.reason === 'invalid_trace_frame')
      return sendError(res, 400, 'Unsupported trace frame', 'invalid_trace_frame');
    return sendError(res, 409, 'Run is stale or frame is out of sequence', 'stale_execution');
  }
  res.json({ ok: true, status: accepted.run.status });
});

computeLabRoutes.post('/runtime/compute-lab-runs/:runId/complete', (req: Request, res: Response) => {
  const uid = getUserId(req);
  if (!isValidCodeServerLease(req.body?.sessionId, uid))
    return sendError(res, 409, 'Code Server lease expired', 'stale_execution');
  const status = req.body?.status;
  if (!['trace_ready', 'syntax', 'runtime', 'timeout', 'limit'].includes(status))
    return sendError(res, 400, 'Invalid run status', 'invalid_run');
  const finished = finishComputeLabRun(
    String(req.params.runId),
    { status, returnValue: req.body?.returnValue, frame: req.body?.frame },
    uid,
  );
  if (!finished.ok) {
    if (finished.reason === 'invalid_trace_frame')
      return sendError(res, 400, 'Unsupported trace frame', 'invalid_trace_frame');
    return sendError(res, 409, 'Run is stale', 'stale_execution');
  }
  res.json({ ok: true, run: publicRun(finished.run) });
});

computeLabRoutes.post('/compute-lab/submissions', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { taskId, runId } = req.body || {};
  const run = getComputeLabRun(String(runId || ''), uid);
  if (!run || run.taskId !== taskId || run.status !== 'trace_ready')
    return sendError(res, 409, 'Run is not ready to submit', 'invalid_run');
  const node = unlockedCompute(run.nodeId, uid);
  if (!node) return sendError(res, 403, 'Compute node is locked or unavailable', 'locked_node');
  const result = await submitComputeAnswer(run.nodeId, node, String(taskId), run.returnValue, uid);
  res.json(result);
});
