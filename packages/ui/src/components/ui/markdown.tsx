import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';

SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('powershell', powershell);
SyntaxHighlighter.registerLanguage('diff', diff);
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Copy, Check } from 'lucide-react';

// Code theme using CSS variables
const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6' },
  'pre[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', background: 'var(--bg-primary)', padding: '12px 14px', borderRadius: '8px', overflow: 'auto' },
  comment: { color: 'var(--text-muted)' },
  string: { color: 'var(--color-positive, #4ade80)' },
  'triple-quoted-string': { color: 'var(--color-positive, #4ade80)' },
  keyword: { color: 'var(--accent)' },
  function: { color: 'var(--color-warning, #fbbf24)' },
  'function-variable': { color: 'var(--color-warning, #fbbf24)' },
  number: { color: 'var(--color-warning, #f59e0b)' },
  operator: { color: 'var(--text-secondary)' },
  'class-name': { color: 'var(--accent)' },
  builtin: { color: 'var(--accent)' },
  punctuation: { color: 'var(--text-secondary)' },
  decorator: { color: 'var(--color-warning, #f59e0b)' },
  boolean: { color: 'var(--color-warning, #f59e0b)' },
  // Python-specific tokens
  'attr-name': { color: 'var(--accent)' },
  'attr-value': { color: 'var(--color-positive, #4ade80)' },
  property: { color: '#c9d1d9' },
  'method': { color: 'var(--color-warning, #fbbf24)' },
  'self': { color: '#ff7b72' },
  'constant': { color: 'var(--color-warning, #f59e0b)' },
};

// Platform tab groups — consecutive code blocks with these languages become tabs
const PLATFORM_GROUPS: Record<string, string> = {
  powershell: 'Windows',
  bash: 'macOS / Linux',
  sh: 'macOS / Linux',
  cmd: 'Windows',
};

const LANG_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  js: 'JavaScript',
  ts: 'TypeScript',
  ...PLATFORM_GROUPS,
};

// Persist user's preferred tab per group
const PREF_KEY = 'netcrawl-code-tab-pref';

function getTabPref(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
function setTabPref(group: string, tab: string) {
  const prefs = getTabPref();
  prefs[group] = tab;
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        position: 'absolute', top: 6, right: 6,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: '4px',
        background: copied ? 'var(--bg-positive, rgba(74,222,128,0.15))' : 'var(--bg-secondary)',
        border: `1px solid ${copied ? 'var(--border-bright)' : 'var(--border)'}`,
        color: copied ? 'var(--color-positive, #4ade80)' : 'var(--text-muted)',
        fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Side-by-side diff view for ```diff code blocks */
function DiffView({ code }: { code: string }) {
  const lines = code.split('\n');
  const removed: string[] = [];
  const added: string[] = [];
  const context: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-')) {
      removed.push(line.slice(1));
    } else if (line.startsWith('+')) {
      added.push(line.slice(1));
    } else {
      // Context lines go to both sides
      removed.push(line);
      added.push(line);
      context.push(line.trim());
    }
  }

  const lineStyle = (type: 'remove' | 'add' | 'context'): React.CSSProperties => ({
    padding: '1px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: '1.7',
    whiteSpace: 'pre',
    background: type === 'remove' ? 'rgba(239,68,68,0.08)' : type === 'add' ? 'rgba(74,222,128,0.08)' : 'transparent',
    color: type === 'remove' ? '#f87171' : type === 'add' ? '#4ade80' : 'var(--text-secondary)',
  });

  const colStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    minWidth: 0,
  };

  const headerStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{
      display: 'flex',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '8px 0',
      fontSize: 11,
    }}>
      {/* Before */}
      <div style={colStyle}>
        <div style={{ ...headerStyle, color: '#f87171', background: 'rgba(239,68,68,0.05)' }}>Before</div>
        <div style={{ padding: '4px 0' }}>
          {removed.map((line, i) => {
            const isCtx = context.includes(line.trim());
            return <div key={i} style={lineStyle(isCtx ? 'context' : 'remove')}>{line || '\u00A0'}</div>;
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

      {/* After */}
      <div style={colStyle}>
        <div style={{ ...headerStyle, color: '#4ade80', background: 'rgba(74,222,128,0.05)' }}>After</div>
        <div style={{ padding: '4px 0' }}>
          {added.map((line, i) => {
            const isCtx = context.includes(line.trim());
            return <div key={i} style={lineStyle(isCtx ? 'context' : 'add')}>{line || '\u00A0'}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

function CodeBlockInner({ language, code }: { language: string; code: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <CopyButton text={code} />
      <SyntaxHighlighter
        style={codeTheme as any}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 14px',
          paddingRight: '70px',
          margin: 0,
          fontSize: '12px',
          lineHeight: '1.7',
        }}
        codeTagProps={{
          style: { fontFamily: 'var(--font-mono)', fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0, "calt" 0' },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/** Tabbed code block — shows tabs for platform/language switching */
function TabbedCodeBlock({ blocks }: { blocks: { lang: string; label: string; code: string }[] }) {
  const groupKey = blocks.map(b => b.lang).sort().join(',');
  const prefs = getTabPref();
  const savedTab = blocks.find(b => prefs[groupKey] === b.lang || prefs['platform'] === b.lang);
  const [active, setActive] = useState(savedTab?.lang || blocks[0].lang);
  const activeBlock = blocks.find(b => b.lang === active) || blocks[0];

  const handleTab = (lang: string) => {
    setActive(lang);
    setTabPref(groupKey, lang);
    // Also save as general platform preference
    if (PLATFORM_GROUPS[lang]) setTabPref('platform', lang);
  };

  return (
    <div style={{ margin: '8px 0' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 1, marginBottom: -1, position: 'relative', zIndex: 1 }}>
        {blocks.map(b => {
          const isActive = b.lang === active;
          return (
            <button
              key={b.lang}
              onClick={() => handleTab(b.lang)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px 6px 0 0',
                border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
                borderBottom: isActive ? '1px solid var(--bg-primary)' : '1px solid transparent',
                background: isActive ? 'var(--bg-primary)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      <CodeBlockInner language={activeBlock.lang} code={activeBlock.code} />
    </div>
  );
}

/**
 * Pre-process markdown to detect consecutive code blocks that should be tabbed.
 * Returns segments: either plain markdown strings or tab groups.
 */
type Segment = { type: 'md'; content: string } | { type: 'tabs'; blocks: { lang: string; label: string; code: string }[] };

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  // Match fenced code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  const blocks: { start: number; end: number; lang: string; code: string }[] = [];

  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      lang: match[1] || 'text',
      code: match[2].trimEnd(),
    });
  }

  if (blocks.length === 0) return [{ type: 'md', content }];

  // Group consecutive platform-specific code blocks
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    // Check if this block and the next form a tab group
    // (consecutive platform blocks with only whitespace between them)
    if (i + 1 < blocks.length && PLATFORM_GROUPS[b.lang]) {
      const between = content.slice(b.end, blocks[i + 1].start).trim();
      const nextB = blocks[i + 1];
      if (between.length === 0 && PLATFORM_GROUPS[nextB.lang] && b.lang !== nextB.lang) {
        // Found a tab group! Check for more consecutive blocks
        const tabBlocks = [b];
        let j = i + 1;
        while (j < blocks.length) {
          const betweenJ = content.slice(tabBlocks[tabBlocks.length - 1].end, blocks[j].start).trim();
          if (betweenJ.length === 0 && PLATFORM_GROUPS[blocks[j].lang]) {
            tabBlocks.push(blocks[j]);
            j++;
          } else break;
        }

        // Emit markdown before this group
        const mdBefore = content.slice(lastIndex, tabBlocks[0].start).trim();
        if (mdBefore) segments.push({ type: 'md', content: mdBefore });

        // Emit tab group
        segments.push({
          type: 'tabs',
          blocks: tabBlocks.map(tb => ({
            lang: tb.lang,
            label: LANG_LABELS[tb.lang] || tb.lang,
            code: tb.code,
          })),
        });

        lastIndex = tabBlocks[tabBlocks.length - 1].end;
        i = j;
        continue;
      }
    }

    // Also check for python/javascript tab groups
    if (i + 1 < blocks.length && (b.lang === 'python' || b.lang === 'javascript' || b.lang === 'js')) {
      const between = content.slice(b.end, blocks[i + 1].start).trim();
      const nextB = blocks[i + 1];
      const isLangPair = (b.lang === 'python' && (nextB.lang === 'javascript' || nextB.lang === 'js'))
        || ((b.lang === 'javascript' || b.lang === 'js') && nextB.lang === 'python');
      if (between.length === 0 && isLangPair) {
        const mdBefore = content.slice(lastIndex, b.start).trim();
        if (mdBefore) segments.push({ type: 'md', content: mdBefore });
        segments.push({
          type: 'tabs',
          blocks: [b, nextB].map(tb => ({
            lang: tb.lang,
            label: LANG_LABELS[tb.lang] || tb.lang,
            code: tb.code,
          })),
        });
        lastIndex = nextB.end;
        i += 2;
        continue;
      }
    }

    i++;
  }

  // Remaining markdown
  const remaining = content.slice(lastIndex).trim();
  if (remaining) segments.push({ type: 'md', content: remaining });

  return segments;
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');
          const isInline = !match && !codeString.includes('\n');

          if (isInline) {
            return (
              <code style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '1px 5px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"liga" 0, "calt" 0',
                color: 'var(--accent)',
              }}>
                {children}
              </code>
            );
          }

          // Diff blocks → side-by-side view
          if (match?.[1] === 'diff') {
            return <DiffView code={codeString} />;
          }

          return (
            <div style={{ position: 'relative', margin: '8px 0' }}>
              <CopyButton text={codeString} />
              <SyntaxHighlighter
                style={codeTheme as any}
                language={match?.[1] || 'text'}
                PreTag="div"
                customStyle={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  paddingRight: '70px',
                  margin: 0,
                  fontSize: '12px',
                  lineHeight: '1.7',
                }}
                codeTagProps={{
                  style: { fontFamily: 'var(--font-mono)', fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0, "calt" 0' },
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          );
        },
        p({ children }) { return <p style={{ margin: '8px 0', lineHeight: 1.7 }}>{children}</p>; },
        ul({ children }) { return <ul style={{ margin: '6px 0', paddingLeft: '20px', lineHeight: 1.7 }}>{children}</ul>; },
        ol({ children }) { return <ol style={{ margin: '6px 0', paddingLeft: '20px', lineHeight: 1.7 }}>{children}</ol>; },
        li({ children }) { return <li style={{ margin: '2px 0' }}>{children}</li>; },
        strong({ children }) { return <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{children}</strong>; },
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{children}</table>
            </div>
          );
        },
        th({ children }) { return <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border-bright)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>{children}</th>; },
        td({ children }) { return <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{children}</td>; },
        h1({ children }) { return <h1 style={{ fontSize: '18px', fontWeight: 800, margin: '12px 0 6px', color: 'var(--text-primary)' }}>{children}</h1>; },
        h2({ children }) { return <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '10px 0 4px', color: 'var(--text-primary)' }}>{children}</h2>; },
        h3({ children }) { return <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h3>; },
        a({ href, children }) {
          const isExternal = href && /^https?:\/\//.test(href);
          return <a href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{children}</a>;
        },
        hr() { return <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)', margin: '12px 0' }} />; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function Markdown({ content }: { content: string }) {
  const segments = parseSegments(content);

  // If no tab groups found, render as simple markdown
  if (segments.length === 1 && segments[0].type === 'md') {
    return <MarkdownBlock content={content} />;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'tabs'
          ? <TabbedCodeBlock key={i} blocks={seg.blocks} />
          : <MarkdownBlock key={i} content={seg.content} />
      )}
    </>
  );
}
