import { Router, Request, Response } from 'express';
import { getUserById, generateEditorToken } from '../auth.js';
import { getGameState } from '../domain/gameState.js';
import { getActiveComputeLabTask } from '../actions/computeActions.js';
import { isCodeServerConnected } from '../codeServerTracker.js';
import { createComputeLabRun, getComputeLabRun, publicRun } from '../computeLab.js';
import { enqueueComputeLabRun } from '../workerRegistry.js';
import { TRACE_LIMITS } from '../computeLab.js';
import { broadcast } from '../websocket.js';
import { getUserId, sendError } from './helpers.js';
import {
  acknowledgeEditorCommand,
  consumeEditorPairingTicket,
  createEditorPairingTicket,
  disconnectEditorSession,
  enqueueOpenProblem,
  getEditorProblemBinding,
  getEditorSession,
  getPublicEditorCommand,
  leaseEditorCommands,
  listEditorSessions,
  normalizeEditorSelection,
  problemRelativePath,
  registerEditorSession,
} from '../editorBridge.js';

export const editorRoutes = Router();

function unlockedCompute(nodeId: string, userId?: string) {
  const node = getGameState(userId).nodes.find(candidate => candidate.id === nodeId);
  return node?.type === 'compute' && node.data?.unlocked ? node : undefined;
}

editorRoutes.post('/editor/pairing-tickets', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json(createEditorPairingTicket(getUserId(req)));
});

editorRoutes.post('/editor/pairing-tickets/consume', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const result = consumeEditorPairingTicket(req.body?.code);
  if (!result.ok)
    return sendError(res, result.reason === 'pairing_invalid' ? 404 : 410, 'Pairing code is not usable', result.reason);
  const user =
    result.userId === '__default__' ? { id: '__default__', email: 'local@netcrawl' } : getUserById(result.userId);
  if (!user) return sendError(res, 404, 'Pairing account no longer exists', 'pairing_invalid');
  res.json(generateEditorToken(user));
});

editorRoutes.get('/editor/sessions', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ sessions: listEditorSessions(getUserId(req)) });
});

editorRoutes.post('/editor/sessions/register', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = registerEditorSession(req.body || {}, getUserId(req));
  res.json({ ok: true, session: { ...session, userId: undefined } });
});

editorRoutes.post('/editor/sessions/:sessionId/disconnect', (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId || '');
  if (!getEditorSession(sessionId, getUserId(req)))
    return sendError(res, 409, 'Editor session is stale', 'editor_disconnected');
  disconnectEditorSession(sessionId, getUserId(req));
  res.json({ ok: true });
});

editorRoutes.get('/editor/commands', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const sessionId = String(req.query.sessionId || '');
  const commands = leaseEditorCommands(sessionId, getUserId(req));
  if (!commands) return sendError(res, 409, 'Editor session is stale', 'editor_disconnected');
  res.json({ commands });
});

editorRoutes.post('/editor/commands/open', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const sessionId = String(req.body?.sessionId || '');
  const nodeId = String(req.body?.nodeId || '');
  const taskId = String(req.body?.taskId || '');
  const source = req.body?.source;
  const revision = req.body?.revision;
  if (!getEditorSession(sessionId, uid))
    return sendError(res, 409, 'Choose an online editor and retry', 'editor_disconnected');
  if (!unlockedCompute(nodeId, uid)) return sendError(res, 403, 'Compute node is locked or unavailable', 'locked_node');
  if (!getActiveComputeLabTask(nodeId, taskId, uid))
    return sendError(res, 409, 'Task expired; reload the Compute Lab', 'invalid_task');
  if (typeof source !== 'string' || !Number.isInteger(revision))
    return sendError(res, 400, 'source and integer revision required', 'invalid_editor_command');
  const selection =
    req.body?.selection === undefined ? undefined : normalizeEditorSelection(source, req.body.selection);
  if (req.body?.selection !== undefined && !selection)
    return sendError(res, 400, 'Source selection is outside this problem', 'invalid_editor_command');
  const command = enqueueOpenProblem(
    { sessionId, nodeId, taskId, source, revision, relativePath: problemRelativePath(nodeId, taskId), selection },
    uid,
  );
  if (!command) return sendError(res, 409, 'Editor disconnected before the command was queued', 'editor_disconnected');
  res.status(202).json({ ok: true, command: getPublicEditorCommand(command.id, uid) });
});

editorRoutes.post('/editor/commands/:commandId/ack', (req: Request, res: Response) => {
  const result = acknowledgeEditorCommand(
    String(req.params.commandId || ''),
    String(req.body?.sessionId || ''),
    req.body?.outcome,
    req.body?.error,
    getUserId(req),
  );
  if (!result) return sendError(res, 409, 'Editor command is stale', 'stale_editor_command');
  res.json({ ok: true, duplicate: result.duplicate });
});

editorRoutes.get('/editor/commands/:commandId', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const command = getPublicEditorCommand(String(req.params.commandId || ''), getUserId(req));
  if (!command) return sendError(res, 404, 'Editor command not found', 'stale_editor_command');
  res.json({ ok: true, command });
});

editorRoutes.post('/editor/runs', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const sessionId = String(req.body?.sessionId || '');
  const relativePath = req.body?.relativePath;
  const source = req.body?.source;
  const revision = req.body?.revision;
  const binding = getEditorProblemBinding(sessionId, relativePath, uid);
  if (!binding)
    return sendError(res, 403, 'This file was not opened by NetCrawl in this editor', 'invalid_editor_file');
  if (typeof source !== 'string' || !Number.isInteger(revision))
    return sendError(res, 400, 'source and integer revision required', 'invalid_run');
  if (!unlockedCompute(binding.nodeId, uid))
    return sendError(res, 403, 'Compute node is locked or unavailable', 'locked_node');
  const task = getActiveComputeLabTask(binding.nodeId, binding.taskId, uid);
  if (!task) return sendError(res, 409, 'Task expired; reopen it from NetCrawl', 'invalid_task');
  if (!isCodeServerConnected(uid))
    return sendError(res, 409, 'Connect a Code Server before running code', 'disconnected');
  const run = createComputeLabRun({
    userId: uid,
    nodeId: binding.nodeId,
    taskId: binding.taskId,
    source,
    revision,
    sessionId: '',
  });
  enqueueComputeLabRun({ runId: run.id, source, ...task, limits: TRACE_LIMITS }, uid);
  broadcast(
    {
      type: 'EDITOR_RUN_STARTED',
      payload: { run: publicRun(run), source, relativePath: binding.relativePath, editorSessionId: sessionId },
    },
    uid,
  );
  res.status(202).json({ ok: true, runId: run.id, status: run.status });
});

editorRoutes.get('/editor/runs/:runId', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const run = getComputeLabRun(String(req.params.runId || ''), getUserId(req));
  if (!run) return sendError(res, 404, 'Run not found', 'invalid_run');
  res.json({ ok: true, run: publicRun(run) });
});
