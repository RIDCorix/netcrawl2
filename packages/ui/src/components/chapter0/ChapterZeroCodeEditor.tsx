import { useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import { useT } from '../../hooks/useT';

SyntaxHighlighter.registerLanguage('python', python);

const CODE_THEME: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  'pre[class*="language-"]': {
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    background: 'transparent',
  },
  comment: { color: 'var(--text-muted)' },
  string: { color: 'var(--color-positive, #4ade80)' },
  keyword: { color: 'var(--accent)' },
  function: { color: 'var(--color-warning, #fbbf24)' },
  operator: { color: 'var(--text-secondary)' },
  'class-name': { color: 'var(--accent)' },
  punctuation: { color: 'var(--text-secondary)' },
};

type Highlight = 'class' | 'identity' | 'edge' | 'startup' | 'loop';

function LockedCode({ code, range, active }: { code: string; range?: Highlight; active?: Highlight }) {
  return (
    <div
      className={`chapter0-code-range${range && range === active ? ' chapter0-code-range-active' : ''}`}
      data-code-range={range}
    >
      <SyntaxHighlighter language="python" style={CODE_THEME} PreTag="div" CodeTag="code">
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MethodBody({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <textarea
      value={value}
      onChange={event => onChange(event.target.value)}
      rows={Math.max(2, value.split('\n').length)}
      spellCheck={false}
      disabled={disabled}
      className="chapter0-method-body"
      aria-label={label}
    />
  );
}

export function ChapterZeroCodeEditor({
  onRun,
  running,
  disabled,
  loopUnlocked,
  highlight,
}: {
  onRun: (onStartup: string, onLoop: string) => void;
  running: boolean;
  disabled: boolean;
  loopUnlocked: boolean;
  highlight?: Highlight;
}) {
  const t = useT();
  const [startup, setStartup] = useState('        # this runs once\n        pass');
  const [loop, setLoop] = useState('        # this runs forever\n        pass');

  const body = (value: string) =>
    value
      .split('\n')
      .map(line => line.replace(/^ {8}/, ''))
      .join('\n') || 'pass';

  const submit = () => {
    if (running || disabled) return;
    onRun(body(startup), loopUnlocked ? body(loop) : 'pass');
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
      <div className="chapter0-editor-document" aria-label={t('tutorial.chapter_zero.editor_locked_label')}>
        <Lock className="chapter0-editor-locked-icon" size={11} aria-hidden="true" />
        <LockedCode code={'from netcrawl import WorkerClass, Edge\n\n'} />
        <LockedCode code={'class MyWorker(WorkerClass):\n'} range="class" active={highlight} />
        <LockedCode
          code={'    class_name = "Recovered"\n    class_id   = "recovered"\n\n'}
          range="identity"
          active={highlight}
        />
        <LockedCode code={'    edge = Edge("hub ↔ mine")\n\n'} range="edge" active={highlight} />
        <div
          className={`chapter0-code-range${highlight === 'startup' ? ' chapter0-code-range-active' : ''}`}
          data-code-range="startup"
        >
          <LockedCode code={'    def on_startup(self):\n'} />
          <MethodBody value={startup} onChange={setStartup} disabled={running || disabled} label="on_startup body" />
        </div>
        {loopUnlocked && (
          <div
            className={`chapter0-code-range${highlight === 'loop' ? ' chapter0-code-range-active' : ''}`}
            data-code-range="loop"
          >
            <LockedCode code={'\n    def on_loop(self):\n'} />
            <MethodBody value={loop} onChange={setLoop} disabled={running || disabled} label="on_loop body" />
          </div>
        )}
        <LockedCode
          code={
            '\n    # provided WorkerClass API (locked)\n    def info(self):    ...\n    def move(self, edge): ...\n    def collect(self): ...\n    def deposit(self): ...'
          }
        />
      </div>
    </div>
  );
}
