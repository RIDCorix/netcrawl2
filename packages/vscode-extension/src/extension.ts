import * as vscode from 'vscode';
import { byteColumnToCodeUnit } from './pathSecurity';
import { assertProblemFileSafe, openProblemFile, type ProblemFileServices } from './problemFile';
import { latestLiveExecutionLocation } from './executionLocation';

const TOKEN_SECRET = 'netcrawl.editorToken';
const SERVER_KEY = 'netcrawl.serverUrl';
const GAME_URL_KEY = 'netcrawl.gameUrl';
const BINDINGS_KEY = 'netcrawl.problemBindings';
const TERMINAL_STATUSES = new Set(['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected']);

type SourceLocation = { lineno: number; col_offset: number; end_lineno: number; end_col_offset: number };
type OpenProblemCommand = {
  id: string;
  type: 'open_problem';
  nodeId: string;
  taskId: string;
  relativePath: string;
  source: string;
  revision: number;
  selection?: SourceLocation;
};
type RunProblemCommand = {
  id: string;
  type: 'run_problem';
  nodeId: string;
  taskId: string;
  relativePath: string;
};
type EditorCommand = OpenProblemCommand | RunProblemCommand;
type Binding = { serverUrl: string; sessionId: string; relativePath: string; nodeId: string; taskId: string };
type RunSnapshot = {
  id: string;
  status: string;
  frames?: Array<{ sequence?: number; location?: SourceLocation }>;
  returnValue?: unknown;
};

function normalizeServerUrl(value: string) {
  const parsed = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Use an http(s) server origin without credentials, query, or fragment');
  return parsed.origin;
}

function normalizeGameUrl(value: string) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('NetCrawl game URL must use http or https');
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

class ComputeNodeProvider implements vscode.TreeDataProvider<Binding> {
  private readonly changes = new vscode.EventEmitter<Binding | undefined | null | void>();
  readonly onDidChangeTreeData = this.changes.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sessionId: string,
  ) {}

  refresh() {
    this.changes.fire();
  }

  getChildren(): Binding[] {
    const bindings = Object.values(this.context.workspaceState.get<Record<string, Binding>>(BINDINGS_KEY, {}));
    const unique = new Map<string, Binding>();
    for (const binding of bindings) {
      if (binding.sessionId !== this.sessionId) continue;
      unique.set(`${binding.nodeId}\0${binding.taskId}`, binding);
    }
    return [...unique.values()];
  }

  getTreeItem(binding: Binding) {
    const item = new vscode.TreeItem(`Compute Node · ${binding.nodeId}`, vscode.TreeItemCollapsibleState.None);
    item.description = `Task ${binding.taskId}`;
    item.tooltip = `Open ${binding.nodeId} / ${binding.taskId} in NetCrawl with this exact editor session`;
    item.iconPath = new vscode.ThemeIcon('server-process');
    item.command = { command: 'netcrawl.openComputeNode', title: 'Open Compute Node', arguments: [binding] };
    return item;
  }

  dispose() {
    this.changes.dispose();
  }
}

async function request(serverUrl: string, path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${serverUrl}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    const error = new Error(String(body.error || `NetCrawl returned ${response.status}`));
    Object.assign(error, { reason: body.reason, status: response.status });
    throw error;
  }
  return body;
}

function editorKind(): 'desktop' | 'codespaces' | 'web' {
  if (vscode.env.remoteName === 'codespaces') return 'codespaces';
  return vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop';
}

function editorLabel() {
  if (vscode.env.remoteName === 'codespaces') return 'GitHub Codespaces';
  if (vscode.env.uiKind === vscode.UIKind.Web) return 'VS Code for Web';
  return 'Desktop VS Code';
}

function selectedWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  const preferred = vscode.workspace.getConfiguration('netcrawl').get<string>('workspaceFolder', '').trim();
  return (preferred && folders.find(folder => folder.name === preferred)) || folders[0];
}

function problemFileServices(): ProblemFileServices<vscode.Uri, vscode.TextDocument> {
  return {
    joinPath: vscode.Uri.joinPath,
    stat: uri => vscode.workspace.fs.stat(uri),
    createDirectory: uri => vscode.workspace.fs.createDirectory(uri),
    readFile: uri => vscode.workspace.fs.readFile(uri),
    writeFile: (uri, content) => vscode.workspace.fs.writeFile(uri, content),
    openTextDocument: uri => vscode.workspace.openTextDocument(uri),
    isFileNotFound: error => error instanceof vscode.FileSystemError && error.code === 'FileNotFound',
    chooseSource: async () => {
      const choice = await vscode.window.showWarningMessage(
        'This NetCrawl problem already has workspace edits. Which source should open?',
        { modal: true },
        'Keep workspace file',
        'Replace with browser draft',
      );
      return choice === 'Keep workspace file' ? 'keep' : choice === 'Replace with browser draft' ? 'replace' : 'cancel';
    },
  };
}

function selectionFor(document: vscode.TextDocument, value: SourceLocation | undefined) {
  if (!value || value.lineno < 1 || value.end_lineno < value.lineno || value.end_lineno > document.lineCount)
    return undefined;
  const startLine = document.lineAt(value.lineno - 1).text;
  const endLine = document.lineAt(value.end_lineno - 1).text;
  const start = byteColumnToCodeUnit(startLine, value.col_offset);
  const end = byteColumnToCodeUnit(endLine, value.end_col_offset);
  if (start === undefined || end === undefined) return undefined;
  return new vscode.Selection(value.lineno - 1, start, value.end_lineno - 1, end);
}

export function activate(context: vscode.ExtensionContext) {
  // One activation is one editor host/window. A persisted global ID makes two
  // simultaneous desktop windows overwrite each other on the server.
  const sessionId = crypto.randomUUID();
  const computeNodes = new ComputeNodeProvider(context, sessionId);
  context.subscriptions.push(
    computeNodes,
    vscode.window.registerTreeDataProvider('netcrawl.computeNodes', computeNodes),
  );
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let polling = false;
  let warnedAuth = false;
  const executingCommands = new Set<string>();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.command = 'netcrawl.pairEditor';
  status.text = '$(plug) NetCrawl: not paired';
  status.tooltip = 'Pair this editor with NetCrawl';
  status.show();
  context.subscriptions.push(status);
  const executionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    borderStyle: 'solid',
    borderWidth: '0 0 0 2px',
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  context.subscriptions.push(executionDecoration);
  let highlightedEditor: vscode.TextEditor | undefined;
  let activeExecutionRunId: string | undefined;

  const clearExecutionHighlight = () => {
    highlightedEditor?.setDecorations(executionDecoration, []);
    highlightedEditor = undefined;
  };

  const showExecutionLocation = (editor: vscode.TextEditor, run: RunSnapshot) => {
    const location = latestLiveExecutionLocation(run.status, run.frames);
    const selection = selectionFor(editor.document, location);
    if (!selection) {
      clearExecutionHighlight();
      return;
    }
    if (highlightedEditor && highlightedEditor !== editor) highlightedEditor.setDecorations(executionDecoration, []);
    editor.setDecorations(executionDecoration, [
      { range: selection, hoverMessage: `NetCrawl is executing line ${selection.start.line + 1}` },
    ]);
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    highlightedEditor = editor;
    status.text = `$(sync~spin) NetCrawl: line ${selection.start.line + 1}`;
  };

  const getConnection = async () => {
    const token = await context.secrets.get(TOKEN_SECRET);
    const configured = vscode.workspace.getConfiguration('netcrawl').get<string>('serverUrl', '');
    const stored = context.globalState.get<string>(SERVER_KEY, '');
    if (!token || !(stored || configured)) return undefined;
    return { token, serverUrl: normalizeServerUrl(stored || configured) };
  };

  const acknowledge = async (
    connection: { token: string; serverUrl: string },
    sessionId: string,
    commandId: string,
    outcome: 'opened' | 'failed',
    error?: string,
  ) => {
    await request(connection.serverUrl, `/api/editor/commands/${encodeURIComponent(commandId)}/ack`, connection.token, {
      method: 'POST',
      body: JSON.stringify({ sessionId, outcome, ...(error ? { error } : {}) }),
    });
  };

  const openProblem = async (
    connection: { token: string; serverUrl: string },
    sessionId: string,
    command: OpenProblemCommand,
  ) => {
    try {
      const root = selectedWorkspaceFolder();
      if (!root) throw new Error('Open a workspace folder before opening a NetCrawl problem');
      const { candidate, document, wroteBrowserSource } = await openProblemFile(
        root.uri,
        command.relativePath,
        command.source,
        problemFileServices(),
      );
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      const selection = wroteBrowserSource ? selectionFor(document, command.selection) : undefined;
      if (selection) {
        editor.selection = selection;
        editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
      const bindings = context.workspaceState.get<Record<string, Binding>>(BINDINGS_KEY, {});
      bindings[candidate.toString()] = {
        serverUrl: connection.serverUrl,
        sessionId,
        relativePath: command.relativePath,
        nodeId: command.nodeId,
        taskId: command.taskId,
      };
      await context.workspaceState.update(BINDINGS_KEY, bindings);
      computeNodes.refresh();
      await acknowledge(connection, sessionId, command.id, 'opened');
      if (!activeExecutionRunId) status.text = `$(plug) NetCrawl: ${editorLabel()}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await acknowledge(connection, sessionId, command.id, 'failed', message).catch(() => undefined);
      void vscode.window.showErrorMessage(`NetCrawl could not open the problem: ${message}`);
    }
  };

  const runBoundProblem = async (
    connection: { token: string; serverUrl: string },
    binding: Binding,
    commandId?: string,
  ) => {
    const root = selectedWorkspaceFolder();
    if (!root) throw new Error('Open a workspace folder before running a NetCrawl problem');
    const candidate = await assertProblemFileSafe(root.uri, binding.relativePath, problemFileServices());
    const document = await vscode.workspace.openTextDocument(candidate);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    if (!(await document.save())) throw new Error('Save the problem file before running it');
    if (connection.serverUrl !== binding.serverUrl) throw new Error('Pair this editor with the problem server again');
    const start = await request(connection.serverUrl, '/api/editor/runs', connection.token, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: binding.sessionId,
        relativePath: binding.relativePath,
        source: document.getText(),
        revision: document.version,
        ...(commandId ? { commandId } : {}),
      }),
    });
    const runId = String(start.runId);
    activeExecutionRunId = runId;
    status.text = '$(sync~spin) NetCrawl: running';
    clearExecutionHighlight();
    let run: RunSnapshot | undefined;
    let ownedVisualization = false;
    try {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const result = await request(
          connection.serverUrl,
          `/api/editor/runs/${encodeURIComponent(runId)}`,
          connection.token,
        );
        run = result.run as RunSnapshot | undefined;
        if (activeExecutionRunId === runId && run && !TERMINAL_STATUSES.has(String(run.status)))
          showExecutionLocation(editor, run);
        if (TERMINAL_STATUSES.has(String(run?.status))) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!run || !TERMINAL_STATUSES.has(String(run.status)))
        throw new Error('Run is still pending; check the Compute Lab');
    } finally {
      ownedVisualization = activeExecutionRunId === runId;
      if (ownedVisualization) {
        clearExecutionHighlight();
        activeExecutionRunId = undefined;
      }
    }
    if (ownedVisualization) status.text = `$(plug) NetCrawl: ${editorLabel()}`;
    const result = Object.prototype.hasOwnProperty.call(run, 'returnValue')
      ? ` · ${JSON.stringify(run.returnValue)}`
      : '';
    const show = run.status === 'trace_ready' ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
    void show(`NetCrawl run: ${run.status}${result}. Full trace is in the game.`);
  };

  const runProblemCommand = async (connection: { token: string; serverUrl: string }, command: RunProblemCommand) => {
    if (executingCommands.has(command.id)) return;
    executingCommands.add(command.id);
    try {
      const root = selectedWorkspaceFolder();
      if (!root) throw new Error('Open a workspace folder before running a NetCrawl problem');
      const candidate = await assertProblemFileSafe(root.uri, command.relativePath, problemFileServices());
      const bindings = context.workspaceState.get<Record<string, Binding>>(BINDINGS_KEY, {});
      const binding = bindings[candidate.toString()];
      if (
        !binding ||
        binding.serverUrl !== connection.serverUrl ||
        binding.sessionId !== sessionId ||
        binding.nodeId !== command.nodeId ||
        binding.taskId !== command.taskId ||
        binding.relativePath !== command.relativePath
      )
        throw new Error('This problem is not bound to the selected editor session');
      await runBoundProblem(connection, binding, command.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await acknowledge(connection, sessionId, command.id, 'failed', message).catch(() => undefined);
      if (!activeExecutionRunId) status.text = '$(warning) NetCrawl: run failed';
      void vscode.window.showErrorMessage(`NetCrawl could not run this problem: ${message}`);
    } finally {
      executingCommands.delete(command.id);
    }
  };

  const poll = async () => {
    if (polling) return;
    const connection = await getConnection().catch(() => undefined);
    if (!connection) return;
    polling = true;
    try {
      await request(connection.serverUrl, '/api/editor/sessions/register', connection.token, {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          label: `${editorLabel()} · ${sessionId.slice(0, 4).toUpperCase()}`,
          kind: editorKind(),
          workspaceFolders: (vscode.workspace.workspaceFolders || []).map(folder => folder.name),
        }),
      });
      const body = await request(
        connection.serverUrl,
        `/api/editor/commands?sessionId=${encodeURIComponent(sessionId)}`,
        connection.token,
      );
      if (!activeExecutionRunId) status.text = `$(plug) NetCrawl: ${editorLabel()}`;
      status.tooltip = `Connected to ${connection.serverUrl}`;
      warnedAuth = false;
      for (const command of (body.commands || []) as EditorCommand[]) {
        if (command.type === 'open_problem') await openProblem(connection, sessionId, command);
        if (command.type === 'run_problem') void runProblemCommand(connection, command);
      }
    } catch (error) {
      const statusCode = Number((error as any)?.status || 0);
      status.text = statusCode === 401 ? '$(warning) NetCrawl: pair again' : '$(debug-disconnect) NetCrawl: retrying';
      if (statusCode === 401 && !warnedAuth) {
        warnedAuth = true;
        void vscode.window.showWarningMessage('NetCrawl pairing expired. Run “NetCrawl: Pair Editor” to reconnect.');
      }
    } finally {
      polling = false;
    }
  };

  const ensurePolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    void poll();
    pollTimer = setInterval(() => void poll(), 2_500);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('netcrawl.openComputeNode', async (binding?: Binding) => {
      if (!binding || binding.sessionId !== sessionId)
        return void vscode.window.showWarningMessage('Open a Compute Node problem from NetCrawl in this editor first.');
      try {
        const connection = await getConnection();
        if (!connection || connection.serverUrl !== binding.serverUrl)
          throw new Error('Pair this editor with NetCrawl again');
        const created = await request(connection.serverUrl, '/api/editor/handoffs', connection.token, {
          method: 'POST',
          body: JSON.stringify({ sessionId, nodeId: binding.nodeId, taskId: binding.taskId }),
        });
        const configuredGameUrl = vscode.workspace.getConfiguration('netcrawl').get<string>(GAME_URL_KEY, '');
        const gameUrl = normalizeGameUrl(configuredGameUrl || 'https://netcrawl-ui.vercel.app');
        const target = new URL(gameUrl);
        target.hash = new URLSearchParams({
          'editor-handoff': String(created.handoff),
          node: binding.nodeId,
          task: binding.taskId,
        }).toString();
        await vscode.env.openExternal(vscode.Uri.parse(target.toString()));
      } catch (error) {
        void vscode.window.showWarningMessage(
          `NetCrawl could not open this Compute Node automatically: ${
            error instanceof Error ? error.message : String(error)
          }. Open the game and use Pair Code Server instead.`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('netcrawl.pairEditor', async () => {
      const configured = vscode.workspace.getConfiguration('netcrawl').get<string>('serverUrl', '');
      const stored = context.globalState.get<string>(SERVER_KEY, '');
      const serverInput = await vscode.window.showInputBox({
        title: 'Pair NetCrawl editor',
        prompt: 'NetCrawl server URL shown in the Compute Lab',
        value: stored || configured,
        ignoreFocusOut: true,
      });
      if (!serverInput) return;
      let serverUrl: string;
      try {
        serverUrl = normalizeServerUrl(serverInput);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return;
      }
      const code = await vscode.window.showInputBox({
        title: 'Pair NetCrawl editor',
        prompt: 'One-time pairing code from the Compute Lab',
        password: true,
        ignoreFocusOut: true,
      });
      if (!code) return;
      try {
        const response = await fetch(`${serverUrl}/api/editor/pairing-tickets/consume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, any>;
        if (!response.ok || typeof body.token !== 'string') throw new Error(String(body.error || 'Pairing failed'));
        await context.secrets.store(TOKEN_SECRET, body.token);
        await context.globalState.update(SERVER_KEY, serverUrl);
        status.text = `$(plug) NetCrawl: ${editorLabel()}`;
        ensurePolling();
        void vscode.window.showInformationMessage(
          'NetCrawl editor paired. Return to the Compute Lab and choose this editor.',
        );
      } catch (error) {
        void vscode.window.showErrorMessage(
          `NetCrawl pairing failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('netcrawl.runProblem', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return void vscode.window.showWarningMessage('Open a NetCrawl problem file first.');
      const bindings = context.workspaceState.get<Record<string, Binding>>(BINDINGS_KEY, {});
      const binding = bindings[editor.document.uri.toString()];
      if (!binding)
        return void vscode.window.showWarningMessage('Open this problem from the NetCrawl Compute Lab first.');
      try {
        const root = selectedWorkspaceFolder();
        if (!root) throw new Error('Open a workspace folder before running a NetCrawl problem');
        const candidate = await assertProblemFileSafe(root.uri, binding.relativePath, problemFileServices());
        if (candidate.toString() !== editor.document.uri.toString())
          throw new Error('The active file is outside the paired workspace');
        const connection = await getConnection();
        if (!connection) throw new Error('Pair this editor with the problem server again');
        await runBoundProblem(connection, binding);
      } catch (error) {
        if (!activeExecutionRunId) status.text = '$(warning) NetCrawl: run failed';
        const reason = String((error as any)?.reason || '');
        const message =
          reason === 'disconnected'
            ? 'Start or reconnect the NetCrawl Code Server, then run again.'
            : error instanceof Error
              ? error.message
              : String(error);
        void vscode.window.showErrorMessage(`NetCrawl could not run this problem: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('netcrawl.disconnectEditor', async () => {
      const connection = await getConnection().catch(() => undefined);
      if (connection) {
        await request(
          connection.serverUrl,
          `/api/editor/sessions/${encodeURIComponent(sessionId)}/disconnect`,
          connection.token,
          { method: 'POST' },
        ).catch(() => undefined);
      }
      await context.secrets.delete(TOKEN_SECRET);
      await context.workspaceState.update(BINDINGS_KEY, {});
      computeNodes.refresh();
      clearExecutionHighlight();
      activeExecutionRunId = undefined;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
      status.text = '$(plug) NetCrawl: not paired';
      status.tooltip = 'Pair this editor with NetCrawl';
      void vscode.window.showInformationMessage('NetCrawl editor disconnected.');
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      if (pollTimer) clearInterval(pollTimer);
      clearExecutionHighlight();
      activeExecutionRunId = undefined;
    },
  });
  void getConnection().then(connection => connection && ensurePolling());
}

export function deactivate() {}
