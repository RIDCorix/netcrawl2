import crypto, { randomUUID } from 'crypto';
import type { SourceLocation } from './computeLab.js';

const DEFAULT_USER = '__default__';
const PAIRING_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 20_000;
const COMMAND_TTL_MS = 5 * 60_000;
const HANDOFF_TTL_MS = 60_000;
const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

type PairingTicket = {
  digest: string;
  userId: string;
  expiresAt: number;
  usedAt?: number;
};

type EditorHandoff = {
  digest: string;
  userId: string;
  sessionId: string;
  nodeId: string;
  taskId: string;
  expiresAt: number;
  usedAt?: number;
};

export type EditorKind = 'desktop' | 'codespaces' | 'web';

export type EditorSession = {
  id: string;
  userId: string;
  label: string;
  kind: EditorKind;
  workspaceFolders: string[];
  connectedAt: number;
  lastSeenAt: number;
  expiresAt: number;
};

export type EditorProblemBinding = {
  nodeId: string;
  taskId: string;
  relativePath: string;
};

type EditorCommandBase = EditorProblemBinding & {
  id: string;
  userId: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  acknowledgedAt?: number;
  outcome?: 'opened' | 'run_started' | 'failed';
  error?: string;
  runId?: string;
};

export type OpenProblemCommand = EditorCommandBase & {
  type: 'open_problem';
  source: string;
  revision: number;
  selection?: SourceLocation;
};

export type RunProblemCommand = EditorCommandBase & {
  type: 'run_problem';
};

export type EditorCommand = OpenProblemCommand | RunProblemCommand;

const pairingTickets = new Map<string, PairingTicket>();
const editorHandoffs = new Map<string, EditorHandoff>();
const sessions = new Map<string, Map<string, EditorSession>>();
const commands = new Map<string, Map<string, EditorCommand>>();
const bindings = new Map<string, Map<string, EditorProblemBinding>>();

function bindingKey(sessionId: string, relativePath: string) {
  return `${sessionId}\0${relativePath}`;
}

function pruneExpired(now: number) {
  for (const [digest, ticket] of pairingTickets) {
    // Retain a terminal ticket briefly so a replay receives a useful reason.
    if (ticket.expiresAt + PAIRING_TTL_MS <= now) pairingTickets.delete(digest);
  }
  for (const [digest, handoff] of editorHandoffs) {
    // Keep terminal handoffs for one extra TTL so replay and expiry remain
    // distinguishable from a token that never existed.
    if (handoff.expiresAt + HANDOFF_TTL_MS <= now) editorHandoffs.delete(digest);
  }
  for (const [userId, entries] of sessions) {
    for (const [sessionId, session] of entries) {
      if (session.expiresAt > now) continue;
      entries.delete(sessionId);
      const userBindings = bindings.get(userId);
      if (userBindings) {
        for (const key of userBindings.keys()) if (key.startsWith(`${sessionId}\0`)) userBindings.delete(key);
        if (userBindings.size === 0) bindings.delete(userId);
      }
    }
    if (entries.size === 0) sessions.delete(userId);
  }
  for (const [userId, entries] of commands) {
    for (const [commandId, command] of entries) if (command.expiresAt <= now) entries.delete(commandId);
    if (entries.size === 0) commands.delete(userId);
  }
}

function userKey(userId?: string) {
  return userId || DEFAULT_USER;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cleanPairingCode(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function randomPairingCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let index = 0; index < bytes.length; index += 1)
    code += PAIRING_ALPHABET[bytes[index] % PAIRING_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function sessionMap(userId?: string) {
  const key = userKey(userId);
  let entries = sessions.get(key);
  if (!entries) {
    entries = new Map();
    sessions.set(key, entries);
  }
  return entries;
}

function commandMap(userId?: string) {
  const key = userKey(userId);
  let entries = commands.get(key);
  if (!entries) {
    entries = new Map();
    commands.set(key, entries);
  }
  return entries;
}

export function resetEditorBridgeForTests() {
  pairingTickets.clear();
  editorHandoffs.clear();
  sessions.clear();
  commands.clear();
  bindings.clear();
}

export function createEditorHandoff(
  input: { sessionId: string; nodeId: string; taskId: string },
  userId?: string,
  now = Date.now(),
  suppliedToken?: string,
) {
  pruneExpired(now);
  const session = getEditorSession(input.sessionId, userId, now);
  const relativePath = problemRelativePath(input.nodeId, input.taskId);
  const binding = getEditorProblemBinding(input.sessionId, relativePath, userId, now);
  if (!session || !binding || binding.nodeId !== input.nodeId || binding.taskId !== input.taskId) return undefined;
  const token = suppliedToken || crypto.randomBytes(32).toString('base64url');
  const digest = sha256(token);
  const handoff: EditorHandoff = {
    digest,
    userId: userKey(userId),
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    taskId: input.taskId,
    expiresAt: now + HANDOFF_TTL_MS,
  };
  editorHandoffs.set(digest, handoff);
  return { handoff: token, expiresAt: handoff.expiresAt };
}

export function redeemEditorHandoff(
  value: unknown,
  userId?: string,
  expected?: Partial<Pick<EditorHandoff, 'sessionId' | 'nodeId' | 'taskId'>>,
  now = Date.now(),
):
  | { ok: true; sessionId: string; nodeId: string; taskId: string }
  | {
      ok: false;
      reason: 'handoff_invalid' | 'handoff_expired' | 'handoff_used' | 'handoff_wrong_user' | 'handoff_wrong_session';
    } {
  pruneExpired(now);
  if (typeof value !== 'string' || value.length < 32 || value.length > 128)
    return { ok: false, reason: 'handoff_invalid' };
  const handoff = editorHandoffs.get(sha256(value));
  if (!handoff) return { ok: false, reason: 'handoff_invalid' };
  if (handoff.usedAt !== undefined) return { ok: false, reason: 'handoff_used' };
  if (handoff.expiresAt <= now) return { ok: false, reason: 'handoff_expired' };
  if (handoff.userId !== userKey(userId)) return { ok: false, reason: 'handoff_wrong_user' };
  if (
    (expected?.sessionId !== undefined && expected.sessionId !== handoff.sessionId) ||
    (expected?.nodeId !== undefined && expected.nodeId !== handoff.nodeId) ||
    (expected?.taskId !== undefined && expected.taskId !== handoff.taskId) ||
    !getEditorSession(handoff.sessionId, userId, now)
  )
    return { ok: false, reason: 'handoff_wrong_session' };
  const relativePath = problemRelativePath(handoff.nodeId, handoff.taskId);
  const binding = getEditorProblemBinding(handoff.sessionId, relativePath, userId, now);
  if (!binding || binding.nodeId !== handoff.nodeId || binding.taskId !== handoff.taskId)
    return { ok: false, reason: 'handoff_wrong_session' };
  handoff.usedAt = now;
  return { ok: true, sessionId: handoff.sessionId, nodeId: handoff.nodeId, taskId: handoff.taskId };
}

export function createEditorPairingTicket(userId?: string, now = Date.now(), suppliedCode?: string) {
  pruneExpired(now);
  const code = suppliedCode || randomPairingCode();
  const normalized = cleanPairingCode(code);
  if (normalized.length !== 8) throw new Error('Pairing codes must contain eight letters or digits');
  const digest = sha256(normalized);
  const ticket: PairingTicket = { digest, userId: userKey(userId), expiresAt: now + PAIRING_TTL_MS };
  pairingTickets.set(digest, ticket);
  return { code: `${normalized.slice(0, 4)}-${normalized.slice(4)}`, expiresAt: ticket.expiresAt };
}

export function consumeEditorPairingTicket(
  value: unknown,
  now = Date.now(),
): { ok: true; userId: string } | { ok: false; reason: 'pairing_invalid' | 'pairing_expired' | 'pairing_used' } {
  pruneExpired(now);
  const normalized = cleanPairingCode(value);
  if (normalized.length !== 8) return { ok: false, reason: 'pairing_invalid' };
  const ticket = pairingTickets.get(sha256(normalized));
  if (!ticket) return { ok: false, reason: 'pairing_invalid' };
  if (ticket.usedAt !== undefined) return { ok: false, reason: 'pairing_used' };
  if (ticket.expiresAt <= now) return { ok: false, reason: 'pairing_expired' };
  ticket.usedAt = now;
  return { ok: true, userId: ticket.userId };
}

export function registerEditorSession(
  input: { sessionId?: unknown; label?: unknown; kind?: unknown; workspaceFolders?: unknown },
  userId?: string,
  now = Date.now(),
): EditorSession {
  pruneExpired(now);
  const entries = sessionMap(userId);
  const requestedId =
    typeof input.sessionId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(input.sessionId)
      ? input.sessionId
      : randomUUID();
  const existing = entries.get(requestedId);
  const kind: EditorKind = ['desktop', 'codespaces', 'web'].includes(String(input.kind))
    ? (input.kind as EditorKind)
    : 'desktop';
  const workspaceFolders = Array.isArray(input.workspaceFolders)
    ? input.workspaceFolders
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const session: EditorSession = {
    id: requestedId,
    userId: userKey(userId),
    label: boundedText(input.label, kind === 'codespaces' ? 'GitHub Codespaces' : 'VS Code', 80),
    kind,
    workspaceFolders,
    connectedAt: existing?.connectedAt || now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  entries.set(session.id, session);
  return session;
}

export function getEditorSession(sessionId: string, userId?: string, now = Date.now()) {
  pruneExpired(now);
  const session = sessionMap(userId).get(sessionId);
  return session && session.expiresAt > now ? session : undefined;
}

export function touchEditorSession(sessionId: string, userId?: string, now = Date.now()) {
  const session = getEditorSession(sessionId, userId, now);
  if (!session) return undefined;
  session.lastSeenAt = now;
  session.expiresAt = now + SESSION_TTL_MS;
  return session;
}

export function listEditorSessions(userId?: string, now = Date.now()) {
  pruneExpired(now);
  return Array.from(sessionMap(userId).values())
    .filter(session => session.expiresAt > now)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .map(({ userId: _userId, ...session }) => session);
}

export function disconnectEditorSession(sessionId: string, userId?: string) {
  const deleted = sessionMap(userId).delete(sessionId);
  const entries = bindings.get(userKey(userId));
  if (entries) {
    for (const key of entries.keys()) if (key.startsWith(`${sessionId}\0`)) entries.delete(key);
    if (entries.size === 0) bindings.delete(userKey(userId));
  }
  return deleted;
}

export function problemRelativePath(nodeId: string, taskId: string) {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `netcrawl/problems/${safe(nodeId)}/${safe(taskId)}.py`;
}

/** Defense in depth for every server-generated path before it crosses the bridge. */
export function isSafeProblemRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 260) return false;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  return (
    segments.length >= 3 &&
    segments[0] === 'netcrawl' &&
    segments[1] === 'problems' &&
    segments.every(
      segment => segment !== '' && segment !== '.' && segment !== '..' && /^[a-zA-Z0-9._-]+$/.test(segment),
    ) &&
    value.endsWith('.py')
  );
}

export function normalizeEditorSelection(source: string, value: unknown): SourceLocation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (!keys.every(key => ['lineno', 'col_offset', 'end_lineno', 'end_col_offset'].includes(key))) return undefined;
  const { lineno, col_offset, end_lineno, end_col_offset } = candidate;
  if (![lineno, col_offset, end_lineno, end_col_offset].every(Number.isInteger)) return undefined;
  const lines = source.split('\n');
  const lineCount = lines.length;
  if (
    (lineno as number) < 1 ||
    (end_lineno as number) < (lineno as number) ||
    (end_lineno as number) > lineCount ||
    (col_offset as number) < 0 ||
    (end_col_offset as number) < 0 ||
    ((end_lineno as number) === (lineno as number) && (end_col_offset as number) < (col_offset as number))
  )
    return undefined;
  if (
    (col_offset as number) > Buffer.byteLength(lines[(lineno as number) - 1]) ||
    (end_col_offset as number) > Buffer.byteLength(lines[(end_lineno as number) - 1])
  )
    return undefined;
  return { lineno, col_offset, end_lineno, end_col_offset } as SourceLocation;
}

export function enqueueOpenProblem(
  input: EditorProblemBinding & { sessionId: string; source: string; revision: number; selection?: SourceLocation },
  userId?: string,
  now = Date.now(),
): OpenProblemCommand | undefined {
  pruneExpired(now);
  if (!getEditorSession(input.sessionId, userId, now) || !isSafeProblemRelativePath(input.relativePath))
    return undefined;
  const userBindings = bindings.get(userKey(userId));
  userBindings?.delete(bindingKey(input.sessionId, input.relativePath));
  const command: EditorCommand = {
    id: randomUUID(),
    userId: userKey(userId),
    sessionId: input.sessionId,
    type: 'open_problem',
    nodeId: input.nodeId,
    taskId: input.taskId,
    relativePath: input.relativePath,
    source: input.source,
    revision: input.revision,
    ...(input.selection ? { selection: input.selection } : {}),
    createdAt: now,
    expiresAt: now + COMMAND_TTL_MS,
  };
  commandMap(userId).set(command.id, command);
  return command;
}

export function enqueueRunProblem(
  input: EditorProblemBinding & { sessionId: string },
  userId?: string,
  now = Date.now(),
): RunProblemCommand | undefined {
  pruneExpired(now);
  if (!getEditorSession(input.sessionId, userId, now) || !isSafeProblemRelativePath(input.relativePath))
    return undefined;
  const binding = bindings.get(userKey(userId))?.get(bindingKey(input.sessionId, input.relativePath));
  if (!binding || binding.nodeId !== input.nodeId || binding.taskId !== input.taskId) return undefined;
  const duplicate = Array.from(commandMap(userId).values()).find(
    command =>
      command.type === 'run_problem' &&
      command.sessionId === input.sessionId &&
      command.nodeId === input.nodeId &&
      command.taskId === input.taskId &&
      command.relativePath === input.relativePath &&
      command.expiresAt > now &&
      !command.acknowledgedAt,
  );
  if (duplicate) return duplicate as RunProblemCommand;
  const command: RunProblemCommand = {
    id: randomUUID(),
    userId: userKey(userId),
    sessionId: input.sessionId,
    type: 'run_problem',
    nodeId: input.nodeId,
    taskId: input.taskId,
    relativePath: input.relativePath,
    createdAt: now,
    expiresAt: now + COMMAND_TTL_MS,
  };
  commandMap(userId).set(command.id, command);
  return command;
}

export function leaseEditorCommands(sessionId: string, userId?: string, now = Date.now()) {
  pruneExpired(now);
  if (!touchEditorSession(sessionId, userId, now)) return undefined;
  return Array.from(commandMap(userId).values())
    .filter(command => command.sessionId === sessionId && !command.acknowledgedAt && command.expiresAt > now)
    .map(({ userId: _userId, ...command }) => command);
}

export function acknowledgeEditorCommand(
  commandId: string,
  sessionId: string,
  outcome: unknown,
  error: unknown,
  userId?: string,
  now = Date.now(),
) {
  pruneExpired(now);
  const command = commandMap(userId).get(commandId);
  if (!command || command.sessionId !== sessionId || command.expiresAt <= now) return undefined;
  const duplicate = command.acknowledgedAt !== undefined;
  if (!command.acknowledgedAt) {
    command.acknowledgedAt = now;
    command.outcome = command.type === 'open_problem' && outcome === 'opened' ? 'opened' : 'failed';
    if (command.outcome === 'failed')
      command.error = boundedText(
        error,
        command.type === 'open_problem' ? 'Editor could not open the problem' : 'Editor could not run the problem',
        240,
      );
    else {
      let entries = bindings.get(userKey(userId));
      if (!entries) {
        entries = new Map();
        bindings.set(userKey(userId), entries);
      }
      entries.set(bindingKey(sessionId, command.relativePath), {
        nodeId: command.nodeId,
        taskId: command.taskId,
        relativePath: command.relativePath,
      });
    }
  }
  return { command, duplicate };
}

export function markEditorRunStarted(
  commandId: string,
  sessionId: string,
  runId: string,
  userId?: string,
  now = Date.now(),
) {
  pruneExpired(now);
  const command = commandMap(userId).get(commandId);
  if (
    !command ||
    command.type !== 'run_problem' ||
    command.sessionId !== sessionId ||
    command.expiresAt <= now ||
    command.outcome === 'failed'
  )
    return undefined;
  const duplicate = command.outcome === 'run_started';
  if (!duplicate) {
    command.acknowledgedAt = now;
    command.outcome = 'run_started';
    command.runId = runId;
  }
  return { command, duplicate };
}

export function getPublicEditorCommand(commandId: string, userId?: string) {
  const command = commandMap(userId).get(commandId);
  if (!command) return undefined;
  if (command.type === 'open_problem') {
    const { userId: _userId, source: _source, ...safe } = command;
    return safe;
  }
  const { userId: _userId, ...safe } = command;
  return safe;
}

export function findEditorRunCommand(
  sessionId: string,
  nodeId: string,
  taskId: string,
  userId?: string,
  now = Date.now(),
) {
  pruneExpired(now);
  return Array.from(commandMap(userId).values())
    .filter(
      (command): command is RunProblemCommand =>
        command.type === 'run_problem' &&
        command.sessionId === sessionId &&
        command.nodeId === nodeId &&
        command.taskId === taskId &&
        command.expiresAt > now &&
        command.outcome !== 'failed',
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

export function getEditorProblemStatus(
  sessionId: string,
  nodeId: string,
  taskId: string,
  userId?: string,
  now = Date.now(),
) {
  const relativePath = problemRelativePath(nodeId, taskId);
  const binding = getEditorProblemBinding(sessionId, relativePath, userId, now);
  return {
    relativePath,
    bound: Boolean(binding && binding.nodeId === nodeId && binding.taskId === taskId),
  };
}

export function getEditorProblemBinding(
  sessionId: string,
  relativePath: unknown,
  userId?: string,
  now = Date.now(),
): EditorProblemBinding | undefined {
  pruneExpired(now);
  if (!getEditorSession(sessionId, userId, now) || !isSafeProblemRelativePath(relativePath)) return undefined;
  return bindings.get(userKey(userId))?.get(bindingKey(sessionId, relativePath));
}
