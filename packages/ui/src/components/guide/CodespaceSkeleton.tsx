import type { GuideSkeleton } from '../../i18n/guides/types';

type Props = { variant?: GuideSkeleton };

const targetLabels: Record<GuideSkeleton, string> = {
  'codespace-create': 'Resume 或 Create codespace',
  'codespace-editor': '在 main.py 設定連線值',
  'codespace-terminal': '點擊下方 terminal',
  'codespace-run': '執行 uv run main.py',
  'codespace-stop': '在 terminal 按 Ctrl+C',
};

export function CodespaceSkeleton({ variant }: Props) {
  if (!variant) return null;

  return (
    <div className="codespace-skeleton" role="img" aria-label={targetLabels[variant]}>
      <div className="codespace-skeleton-window">
        <div className="codespace-skeleton-titlebar">
          <span className="codespace-skeleton-dots">● ● ●</span>
          <span>github.com/codespaces</span>
        </div>

        {variant === 'codespace-create' && (
          <div className="codespace-skeleton-create">
            <div className="codespace-skeleton-brand">GitHub Codespaces</div>
            <div className="codespace-skeleton-repository">Starscribers / netcrawl-workspace</div>
            <div className="codespace-skeleton-actions">
              <button type="button" className="codespace-skeleton-button">Resume</button>
              <button type="button" className="codespace-skeleton-button codespace-skeleton-highlight">Create codespace</button>
            </div>
          </div>
        )}

        {variant === 'codespace-editor' && (
          <div className="codespace-skeleton-editor-layout">
            <aside className="codespace-skeleton-sidebar"><b>EXPLORER</b><span>▾ netcrawl-workspace</span><span>▸ workers</span><span className="codespace-skeleton-highlight">▣ main.py</span></aside>
            <pre className="codespace-skeleton-code"><span className="codespace-skeleton-muted">1</span> from netcrawl import NetCrawl{`\n`}<span className="codespace-skeleton-muted">2</span>{`\n`}<span className="codespace-skeleton-highlight">3  app = NetCrawl(server=&quot;SERVER_URL&quot;, api_key=&quot;API_KEY&quot;)</span>{`\n`}<span className="codespace-skeleton-muted">4</span> app.register(HelloWorker)</pre>
          </div>
        )}

        {(variant === 'codespace-terminal' || variant === 'codespace-run' || variant === 'codespace-stop') && (
          <div className="codespace-skeleton-editor-layout">
            <aside className="codespace-skeleton-sidebar"><b>EXPLORER</b><span>▾ netcrawl-workspace</span><span>▸ workers</span><span>▣ main.py</span></aside>
            <div className="codespace-skeleton-editor-pane"><div className="codespace-skeleton-code-line">app = NetCrawl(...)</div><div className="codespace-skeleton-terminal"><b>TERMINAL</b><span className={variant === 'codespace-terminal' ? 'codespace-skeleton-highlight' : ''}>$ {variant === 'codespace-run' ? 'uv run main.py' : variant === 'codespace-stop' ? 'uv run main.py  (running)  Ctrl+C' : 'click here to type'}</span></div></div>
          </div>
        )}
      </div>
      <div className="codespace-skeleton-target-label">↗ {targetLabels[variant]}</div>
    </div>
  );
}
