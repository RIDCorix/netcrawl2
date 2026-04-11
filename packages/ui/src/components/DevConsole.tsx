import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/api';

// ── Types ───────────────────────────────────────────────────────────────────
interface NodeCompletion { id: string; label: string; unlocked: boolean }
interface QuestCompletion { id: string; name: string; status: string }
interface MapCompletion { id: number; name: string; unlocked: boolean }

interface Completions {
  items: string[];
  nodes: NodeCompletion[];
  quests: QuestCompletion[];
  maps: MapCompletion[];
}

interface LogLine {
  id: number;
  kind: 'in' | 'ok' | 'err' | 'sys';
  text: string;
}

// ── Command definitions (for top-level autocomplete) ──────────────────────
const ROOT_COMMANDS = ['/give', '/nodes', '/quests', '/maps', '/help', '/clear'];
const LOCK_ACTIONS = ['unlock', 'lock'];

// ── Terminal colors ────────────────────────────────────────────────────────
const COLORS = {
  bg: 'rgba(5, 10, 15, 0.96)',
  border: 'rgba(0, 212, 170, 0.4)',
  fg: '#c0f5e3',
  prompt: '#00d4aa',
  dim: '#5a7a75',
  err: '#ff6b6b',
  ok: '#7ef5b8',
  suggest: '#94c9b9',
  suggestActive: '#0a1a16',
  suggestActiveBg: '#00d4aa',
};

interface Suggestion {
  value: string; // what gets inserted to replace the current token
  label: string; // what's displayed
  detail?: string;
}

function parseTokens(input: string): { tokens: string[]; trailingSpace: boolean } {
  // Split on whitespace, preserving empty trailing token when input ends in space.
  const trailingSpace = /\s$/.test(input);
  const tokens = input.trim().length === 0 ? [] : input.trim().split(/\s+/);
  return { tokens, trailingSpace };
}

function computeSuggestions(input: string, completions: Completions | null): Suggestion[] {
  if (!completions) return [];
  const { tokens, trailingSpace } = parseTokens(input);

  // The "current" token is the one being typed. If input ends in whitespace,
  // we're starting a fresh token (empty prefix); otherwise we're editing the last.
  const editingIndex = trailingSpace ? tokens.length : Math.max(0, tokens.length - 1);
  const current = trailingSpace ? '' : (tokens[tokens.length - 1] || '');
  const lc = current.toLowerCase();

  // Position 0 → command name
  if (editingIndex === 0) {
    return ROOT_COMMANDS
      .filter(c => c.toLowerCase().startsWith(lc))
      .map(c => ({ value: c, label: c }));
  }

  const cmd = tokens[0];

  if (cmd === '/give') {
    if (editingIndex === 1) {
      return completions.items
        .filter(i => i.toLowerCase().includes(lc))
        .map(i => ({ value: i, label: i }));
    }
    if (editingIndex === 2) {
      // quantity — offer a few presets
      return ['1', '10', '64', '100', '999']
        .filter(n => n.startsWith(current))
        .map(n => ({ value: n, label: n, detail: 'qty' }));
    }
    return [];
  }

  if (cmd === '/nodes' || cmd === '/quests' || cmd === '/maps') {
    if (editingIndex === 1) {
      return LOCK_ACTIONS
        .filter(a => a.startsWith(lc))
        .map(a => ({ value: a, label: a }));
    }
    if (editingIndex === 2) {
      if (cmd === '/nodes') {
        return completions.nodes
          .filter(n =>
            n.id.toLowerCase().includes(lc) ||
            n.label.toLowerCase().includes(lc)
          )
          .slice(0, 40)
          .map(n => ({
            value: n.id,
            label: n.id,
            detail: `${n.label}${n.unlocked ? ' ✓' : ''}`,
          }));
      }
      if (cmd === '/quests') {
        return completions.quests
          .filter(q =>
            q.id.toLowerCase().includes(lc) ||
            q.name.toLowerCase().includes(lc)
          )
          .slice(0, 40)
          .map(q => ({ value: q.id, label: q.id, detail: `${q.name} [${q.status}]` }));
      }
      if (cmd === '/maps') {
        return completions.maps
          .filter(m =>
            String(m.id).startsWith(lc) ||
            m.name.toLowerCase().includes(lc)
          )
          .map(m => ({
            value: String(m.id),
            label: String(m.id),
            detail: `${m.name}${m.unlocked ? ' ✓' : ''}`,
          }));
      }
    }
  }

  return [];
}

function applySuggestion(input: string, suggestion: Suggestion): string {
  const { tokens, trailingSpace } = parseTokens(input);
  let next: string[];
  if (trailingSpace || tokens.length === 0) {
    next = [...tokens, suggestion.value];
  } else {
    next = [...tokens.slice(0, -1), suggestion.value];
  }
  return next.join(' ') + ' ';
}

export function DevConsole() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogLine[]>([]);
  const [completions, setCompletions] = useState<Completions | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  const appendLog = useCallback((kind: LogLine['kind'], text: string) => {
    logIdRef.current += 1;
    setLog(prev => [...prev.slice(-200), { id: logIdRef.current, kind, text }]);
  }, []);

  const loadCompletions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dev/completions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompletions(data);
    } catch (e: any) {
      appendLog('err', `failed to load completions: ${e?.message || e}`);
    }
  }, [appendLog]);

  // Toggle with ~ / ` key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '`' && e.key !== '~') return;
      const target = e.target as HTMLElement | null;
      // Don't hijack while typing into another text field, unless the console
      // itself is already focused.
      if (!open && target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) return;
      e.preventDefault();
      setOpen(o => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus + load completions whenever opened
  useEffect(() => {
    if (!open) return;
    loadCompletions();
    appendLog('sys', 'dev console ready — type /help');
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll log to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const suggestions = useMemo(
    () => computeSuggestions(input, completions),
    [input, completions]
  );

  // Keep selected index in range
  useEffect(() => {
    setSelectedSuggestion(s => (suggestions.length === 0 ? 0 : Math.min(s, suggestions.length - 1)));
  }, [suggestions]);

  const runCommand = useCallback(async (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    appendLog('in', `> ${line}`);
    setHistory(h => [...h.slice(-50), line]);
    setHistoryIdx(null);

    const [cmd, ...args] = line.split(/\s+/);

    if (cmd === '/help') {
      appendLog('sys', '/give <itemType> <count>');
      appendLog('sys', '/nodes <unlock|lock> <nodeId>');
      appendLog('sys', '/quests <unlock|lock> <questId>');
      appendLog('sys', '/maps <unlock|lock> <layerId>');
      appendLog('sys', '/clear    — clear log');
      appendLog('sys', 'Tab: complete   ↑↓: history   Esc/~: close');
      return;
    }
    if (cmd === '/clear') { setLog([]); return; }

    try {
      let res: Response;
      if (cmd === '/give') {
        const [itemType, countStr] = args;
        if (!itemType || !countStr) { appendLog('err', 'usage: /give <itemType> <count>'); return; }
        const count = Number(countStr);
        if (!Number.isFinite(count) || count <= 0) { appendLog('err', 'count must be a positive number'); return; }
        res = await apiFetch('/api/dev/give', {
          method: 'POST',
          body: JSON.stringify({ itemType, count }),
        });
      } else if (cmd === '/nodes' || cmd === '/quests' || cmd === '/maps') {
        const [action, target] = args;
        if (!action || !target) { appendLog('err', `usage: ${cmd} <unlock|lock> <id>`); return; }
        if (action !== 'lock' && action !== 'unlock') {
          appendLog('err', "action must be 'lock' or 'unlock'"); return;
        }
        const base = cmd === '/nodes' ? '/api/dev/nodes' : cmd === '/quests' ? '/api/dev/quests' : '/api/dev/maps';
        const key = cmd === '/nodes' ? 'nodeId' : cmd === '/quests' ? 'questId' : 'layerId';
        const value: string | number = cmd === '/maps' ? Number(target) : target;
        res = await apiFetch(`${base}/${action}`, {
          method: 'POST',
          body: JSON.stringify({ [key]: value }),
        });
      } else {
        appendLog('err', `unknown command: ${cmd}`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        appendLog('err', data.error || `HTTP ${res.status}`);
      } else {
        appendLog('ok', data.message || 'ok');
        // Refresh completions after a successful mutation so auto-complete
        // reflects the new state (e.g. a freshly unlocked node).
        loadCompletions();
      }
    } catch (e: any) {
      appendLog('err', e?.message || String(e));
    }
  }, [appendLog, loadCompletions]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length === 0) return;
      const delta = e.shiftKey ? -1 : 1;
      // If Tab pressed with a selection that matches current token exactly,
      // cycle. Otherwise, complete the currently highlighted one.
      if (e.shiftKey || e.altKey) {
        setSelectedSuggestion(i => (i + delta + suggestions.length) % suggestions.length);
      } else {
        const pick = suggestions[selectedSuggestion] || suggestions[0];
        setInput(applySuggestion(input, pick));
        setSelectedSuggestion(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setSelectedSuggestion(i => (i + 1) % suggestions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setSelectedSuggestion(i => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
    }
    // History (Ctrl+↑/↓ or when no suggestions)
    if (e.key === 'ArrowUp' && (e.ctrlKey || suggestions.length === 0)) {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setInput(history[next]);
      return;
    }
    if (e.key === 'ArrowDown' && (e.ctrlKey || suggestions.length === 0)) {
      e.preventDefault();
      if (historyIdx === null) return;
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(null);
        setInput('');
      } else {
        setHistoryIdx(next);
        setInput(history[next]);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input;
      setInput('');
      runCommand(value);
      return;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => inputRef.current?.focus()}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10000,
            background: COLORS.bg,
            borderBottom: `1px solid ${COLORS.border}`,
            boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
            fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
            fontSize: 13,
            color: COLORS.fg,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px',
            borderBottom: '1px solid rgba(0, 212, 170, 0.15)',
            fontSize: 11,
            color: COLORS.dim,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            <span>dev console</span>
            <span>~ / esc to close · tab to complete</span>
          </div>

          <div
            ref={scrollRef}
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              padding: '8px 12px 4px',
              lineHeight: 1.5,
            }}
          >
            {log.length === 0 && (
              <div style={{ color: COLORS.dim }}>
                Type <span style={{ color: COLORS.prompt }}>/help</span> to see available commands.
              </div>
            )}
            {log.map(l => (
              <div
                key={l.id}
                style={{
                  color:
                    l.kind === 'err' ? COLORS.err :
                    l.kind === 'ok' ? COLORS.ok :
                    l.kind === 'sys' ? COLORS.dim :
                    COLORS.fg,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {l.text}
              </div>
            ))}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            borderTop: '1px solid rgba(0, 212, 170, 0.15)',
          }}>
            <span style={{ color: COLORS.prompt, marginRight: 8 }}>❯</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="/give pickaxe_basic 10"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: COLORS.fg,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                caretColor: COLORS.prompt,
              }}
            />
          </div>

          {suggestions.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(0, 212, 170, 0.15)',
              maxHeight: 200,
              overflowY: 'auto',
            }}>
              {suggestions.map((s, i) => {
                const active = i === selectedSuggestion;
                return (
                  <div
                    key={`${s.value}-${i}`}
                    onMouseDown={e => {
                      // mousedown (not click) so we don't lose input focus
                      e.preventDefault();
                      setInput(applySuggestion(input, s));
                      inputRef.current?.focus();
                    }}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '3px 12px',
                      background: active ? COLORS.suggestActiveBg : 'transparent',
                      color: active ? COLORS.suggestActive : COLORS.suggest,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ minWidth: 160 }}>{s.label}</span>
                    {s.detail && (
                      <span style={{
                        color: active ? 'rgba(10,26,22,0.75)' : COLORS.dim,
                        fontSize: 11,
                      }}>
                        {s.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
