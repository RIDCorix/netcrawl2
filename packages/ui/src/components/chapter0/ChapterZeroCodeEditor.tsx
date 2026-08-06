import { useRef, useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import { useT } from '../../hooks/useT';

SyntaxHighlighter.registerLanguage('python', python);

const CODE_THEME: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  'pre[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', background: 'transparent' },
  comment: { color: 'var(--text-muted)' },
  string: { color: 'var(--color-positive, #4ade80)' },
  keyword: { color: 'var(--accent)' },
  function: { color: 'var(--color-warning, #fbbf24)' },
  number: { color: 'var(--color-warning, #f59e0b)' },
  operator: { color: 'var(--text-secondary)' },
  'class-name': { color: 'var(--accent)' },
  builtin: { color: 'var(--accent)' },
  punctuation: { color: 'var(--text-secondary)' },
};

const LOCKED_SHELL = `from netcrawl import WorkerClass, Edge

class MyWorker(WorkerClass):
    class_name = "Recovered"
    class_id   = "recovered"

    edge = Edge("hub ↔ mine")

    # ── locked ────────────────────────────
    def info(self):    ...  # read self state
    def move(self, e): ...  # walk one step along edge e
    def collect(self): ...  # pick up floor drops
    def deposit(self): ...  # bank held resources at hub`;

const DEFAULT_ON_STARTUP = `def on_startup(self):
    # this runs once
    pass`;

const DEFAULT_ON_LOOP = `def on_loop(self):
    # this runs forever
    pass`;

function stripHeader(text: string, header: string): string {
  // If the player kept the def line, strip it so we only ship the body to the sandbox.
  const trimmed = text.replace(/\r\n/g, '\n');
  if (trimmed.startsWith(header)) return trimmed.slice(header.length).replace(/^\n/, '');
  return trimmed;
}

function HighlightedEditor({
  value,
  onChange,
  rows,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  disabled: boolean;
  label: string;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);

  return (
    <div className="chapter0-editor-highlight-wrap">
      <div ref={highlightRef} className="chapter0-editor-highlight" aria-hidden="true">
        <SyntaxHighlighter language="python" style={CODE_THEME} PreTag="div" CodeTag="code">
          {`${value}\n`}
        </SyntaxHighlighter>
      </div>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        onScroll={event => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        rows={rows}
        spellCheck={false}
        disabled={disabled}
        className="chapter0-editor-textarea"
        aria-label={label}
      />
    </div>
  );
}

export function ChapterZeroCodeEditor({
  onRun,
  running,
  disabled,
}: {
  onRun: (onStartup: string, onLoop: string) => void;
  running: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const [startup, setStartup] = useState(DEFAULT_ON_STARTUP);
  const [loop, setLoop] = useState(DEFAULT_ON_LOOP);

  const submit = () => {
    if (running || disabled) return;
    const startupBody = stripHeader(startup, 'def on_startup(self):');
    const loopBody = stripHeader(loop, 'def on_loop(self):');
    onRun(startupBody || 'pass', loopBody || 'pass');
  };

  return (
    <div className="chapter0-editor">
      <div className="chapter0-editor-header">
        <span>worker.py // draft</span>
        <button type="button" className="chapter0-editor-run" onClick={submit} disabled={running || disabled}>
          <Play size={12} />
          <span>{t('tutorial.chapter_zero.editor_run')}</span>
        </button>
      </div>
      <div className="chapter0-editor-locked" aria-label={t('tutorial.chapter_zero.editor_locked_label')}>
        <span className="chapter0-editor-locked-icon">
          <Lock size={11} />
        </span>
        <SyntaxHighlighter language="python" style={CODE_THEME} PreTag="div" CodeTag="code">
          {LOCKED_SHELL}
        </SyntaxHighlighter>
      </div>
      <label className="chapter0-editor-block">
        <HighlightedEditor
          value={startup}
          onChange={setStartup}
          rows={5}
          disabled={running || disabled}
          label="on_startup"
        />
      </label>
      <label className="chapter0-editor-block">
        <HighlightedEditor
          value={loop}
          onChange={setLoop}
          rows={7}
          disabled={running || disabled}
          label="on_loop"
        />
      </label>
    </div>
  );
}
