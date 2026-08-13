import type { GuideSkeleton } from '../../i18n/guides/types';

type Props = {
  variant?: GuideSkeleton;
  connection?: { serverUrl: string; apiKey: string; requiresApiKey: boolean };
};

const targetLabels: Record<GuideSkeleton, string> = {
  'codespace-create': 'Resume 或 Create codespace',
  'codespace-editor': '在 main.py 設定連線值',
  'codespace-terminal': '點擊下方 terminal',
  'codespace-run': '執行 uv run main.py',
  'codespace-stop': '在 terminal 按 Ctrl+C',
};

function EditorChrome({
  variant,
  connection,
}: {
  variant: Exclude<GuideSkeleton, 'codespace-create'>;
  connection?: Props['connection'];
}) {
  const highlightTerminal = variant === 'codespace-terminal';
  const terminalText =
    variant === 'codespace-run'
      ? 'uv run main.py'
      : variant === 'codespace-stop'
        ? 'uv run main.py  (running)  Ctrl+C'
        : 'click here to type';
  const connectionLine = `app = NetCrawl(server="${connection?.serverUrl || 'SERVER_URL'}"${connection?.requiresApiKey ? `, api_key="${connection.apiKey}"` : ''})`;

  return (
    <div className="codespace-skeleton-ide">
      <div className="codespace-skeleton-activity">
        <span className="codespace-skeleton-activity-active">▤</span>
        <span>⌕</span>
        <span>⑂</span>
        <span>◫</span>
      </div>
      <aside className="codespace-skeleton-sidebar">
        <div className="codespace-skeleton-sidebar-title">
          EXPLORER <span>···</span>
        </div>
        <span className="codespace-skeleton-tree-root">▾ NETCRAWL-WORKSPACE</span>
        <span className="codespace-skeleton-tree-indent">▾ workers</span>
        <span className="codespace-skeleton-tree-indent">▸ __pycache__</span>
        <span className="codespace-skeleton-tree-file">▣ helloworker.py</span>
        <span className="codespace-skeleton-tree-file codespace-skeleton-file-active">▣ main.py</span>
        <span className="codespace-skeleton-tree-file">▣ pyproject.toml</span>
        <span className="codespace-skeleton-tree-file">▣ README.md</span>
      </aside>
      <div className="codespace-skeleton-workbench">
        <div className="codespace-skeleton-tabs">
          <span className="codespace-skeleton-tab-active">▣ main.py</span>
          <span>×</span>
          <span className="codespace-skeleton-tab-muted">README.md</span>
        </div>
        <div className="codespace-skeleton-editor-pane">
          <div className="codespace-skeleton-code-line">
            <span className="codespace-skeleton-line-number">1</span> from netcrawl import NetCrawl
          </div>
          <div className="codespace-skeleton-code-line">
            <span className="codespace-skeleton-line-number">2</span>{' '}
          </div>
          <div
            className={`codespace-skeleton-code-line ${variant === 'codespace-editor' ? 'codespace-skeleton-highlight' : ''}`}
          >
            <span className="codespace-skeleton-line-number">3</span> {connectionLine}
          </div>
          <div className="codespace-skeleton-code-line">
            <span className="codespace-skeleton-line-number">4</span> app.register(HelloWorker)
          </div>
          <div className="codespace-skeleton-code-line">
            <span className="codespace-skeleton-line-number">5</span> app.run()
          </div>
        </div>
        <div className="codespace-skeleton-panel">
          <div className="codespace-skeleton-panel-tabs">
            <span className="codespace-skeleton-panel-tab-active">TERMINAL</span>
            <span>PROBLEMS</span>
            <span>OUTPUT</span>
            <span>DEBUG CONSOLE</span>
            <span className="codespace-skeleton-panel-close">×</span>
          </div>
          <div className={`codespace-skeleton-terminal ${highlightTerminal ? 'codespace-skeleton-highlight' : ''}`}>
            <span className="codespace-skeleton-terminal-path">~/netcrawl-workspace</span>
            <span>
              <b>$</b> {terminalText}
            </span>
            <span className="codespace-skeleton-terminal-caret">▌</span>
          </div>
        </div>
      </div>
      <div className="codespace-skeleton-statusbar">
        <span>⎇ main</span>
        <span>Python 3.12</span>
        <span>✓ 0 errors</span>
        <span>◉ Codespaces</span>
      </div>
    </div>
  );
}

function CodespaceCreation() {
  return (
    <div className="codespace-skeleton-github">
      <div className="codespace-skeleton-github-nav">
        <span className="codespace-skeleton-github-mark">●</span>
        <span>GitHub</span>
        <span>Product</span>
        <span>Solutions</span>
        <span>Resources</span>
        <span>Open Source</span>
        <span className="codespace-skeleton-search">⌕ Search or jump to...</span>
        <span>Sign in</span>
      </div>
      <div className="codespace-skeleton-breadcrumb">
        GitHub / Codespaces / <b>New codespace</b>
      </div>
      <div className="codespace-skeleton-create-body">
        <div className="codespace-skeleton-create-title">Create a codespace</div>
        <div className="codespace-skeleton-create-subtitle">Create a development environment for your repository.</div>
        <div className="codespace-skeleton-create-card">
          <div className="codespace-skeleton-create-card-title">Repository</div>
          <div className="codespace-skeleton-repo-select">
            Starscribers / netcrawl-workspace <span>⌄</span>
          </div>
          <div className="codespace-skeleton-create-card-title">Branch</div>
          <div className="codespace-skeleton-repo-select">
            main <span>⌄</span>
          </div>
          <div className="codespace-skeleton-create-card-title">Machine type</div>
          <div className="codespace-skeleton-repo-select">
            2-core <span>⌄</span>
          </div>
          <div className="codespace-skeleton-actions">
            <button type="button" className="codespace-skeleton-button">
              Resume
            </button>
            <button type="button" className="codespace-skeleton-button codespace-skeleton-highlight">
              Create codespace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CodespaceSkeleton({ variant, connection }: Props) {
  if (!variant) return null;
  if (connection?.requiresApiKey && !connection.apiKey) return null;
  return (
    <div className="codespace-skeleton" role="img" aria-label={targetLabels[variant]}>
      <div className="codespace-skeleton-window">
        <div className="codespace-skeleton-titlebar">
          <span className="codespace-skeleton-dots">● ● ●</span>
          <span className="codespace-skeleton-window-title">github.com/codespaces</span>
          <span className="codespace-skeleton-window-actions">— □ ×</span>
        </div>
        {variant === 'codespace-create' ? (
          <CodespaceCreation />
        ) : (
          <EditorChrome variant={variant} connection={connection} />
        )}
      </div>
      <div className="codespace-skeleton-target-label">↗ {targetLabels[variant]}</div>
    </div>
  );
}
