import { useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { useT } from '../../hooks/useT';

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
      <pre className="chapter0-editor-locked" aria-label={t('tutorial.chapter_zero.editor_locked_label')}>
        <span className="chapter0-editor-locked-icon">
          <Lock size={11} />
        </span>
        <code>{LOCKED_SHELL}</code>
      </pre>
      <label className="chapter0-editor-block">
        <textarea
          value={startup}
          onChange={e => setStartup(e.target.value)}
          rows={5}
          spellCheck={false}
          disabled={running || disabled}
          className="chapter0-editor-textarea"
          aria-label="on_startup"
        />
      </label>
      <label className="chapter0-editor-block">
        <textarea
          value={loop}
          onChange={e => setLoop(e.target.value)}
          rows={7}
          spellCheck={false}
          disabled={running || disabled}
          className="chapter0-editor-textarea"
          aria-label="on_loop"
        />
      </label>
    </div>
  );
}
