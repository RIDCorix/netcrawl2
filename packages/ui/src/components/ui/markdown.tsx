import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Code theme using CSS variables so it works in both dark and light modes
const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6' },
  'pre[class*="language-"]': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', background: 'var(--bg-primary)', padding: '12px 14px', borderRadius: '8px', overflow: 'auto' },
  comment: { color: 'var(--text-muted)' },
  string: { color: 'var(--color-positive, #4ade80)' },
  keyword: { color: 'var(--accent)' },
  function: { color: 'var(--color-warning, #fbbf24)' },
  number: { color: 'var(--color-warning, #f59e0b)' },
  operator: { color: 'var(--text-secondary)' },
  'class-name': { color: 'var(--accent)' },
  builtin: { color: 'var(--accent)' },
  punctuation: { color: 'var(--text-secondary)' },
  decorator: { color: 'var(--color-warning, #f59e0b)' },
  boolean: { color: 'var(--color-warning, #f59e0b)' },
};

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

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Code blocks
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');
          const isInline = !match && !codeString.includes('\n');

          if (isInline) {
            // Inline code
            return (
              <code style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '1px 5px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent)',
              }}>
                {children}
              </code>
            );
          }

          // Block code
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
                  paddingRight: '70px', // space for copy button
                  margin: 0,
                  fontSize: '12px',
                  lineHeight: '1.7',
                }}
                codeTagProps={{
                  style: { fontFamily: 'var(--font-mono)' },
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          );
        },

        // Paragraphs
        p({ children }) {
          return <p style={{ margin: '8px 0', lineHeight: 1.7 }}>{children}</p>;
        },

        // Lists
        ul({ children }) {
          return <ul style={{ margin: '6px 0', paddingLeft: '20px', lineHeight: 1.7 }}>{children}</ul>;
        },
        ol({ children }) {
          return <ol style={{ margin: '6px 0', paddingLeft: '20px', lineHeight: 1.7 }}>{children}</ol>;
        },
        li({ children }) {
          return <li style={{ margin: '2px 0' }}>{children}</li>;
        },

        // Strong/Bold
        strong({ children }) {
          return <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{children}</strong>;
        },

        // Tables
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border-bright)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>{children}</th>;
        },
        td({ children }) {
          return <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{children}</td>;
        },

        // Headings (shouldn't be used in guides but just in case)
        h1({ children }) { return <h1 style={{ fontSize: '18px', fontWeight: 800, margin: '12px 0 6px', color: 'var(--text-primary)' }}>{children}</h1>; },
        h2({ children }) { return <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '10px 0 4px', color: 'var(--text-primary)' }}>{children}</h2>; },
        h3({ children }) { return <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h3>; },

        // Links — external URLs open in new tab
        a({ href, children }) {
          const isExternal = href && /^https?:\/\//.test(href);
          return (
            <a
              href={href}
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              {children}
            </a>
          );
        },

        // Horizontal rule
        hr() { return <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)', margin: '12px 0' }} />; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
