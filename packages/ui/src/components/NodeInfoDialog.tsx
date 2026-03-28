/**
 * NodeInfoDialog — generic pluggable dialog for node-specific detail views.
 * Each node type can register dialog configs with buttons, titles, and markdown content.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Markdown } from './ui/markdown';

export interface NodeDialogConfig {
  buttonLabel: string;
  buttonIcon?: React.ReactNode;
  dialogTitle: string;
  dialogContent: string; // Markdown
}

/** Registry of dialog configs per node type. Each node type can have multiple dialogs. */
export const NODE_DIALOG_REGISTRY: Record<string, Record<string, (nodeData: any) => NodeDialogConfig>> = {
  compute: {
    puzzleCatalog: (data: any) => ({
      buttonLabel: 'Puzzle Catalog',
      dialogTitle: `Puzzles — ${data.label} (${(data.difficulty || 'easy').toUpperCase()})`,
      dialogContent: getPuzzleCatalogMarkdown(data.difficulty || 'easy'),
    }),
  },
};

function getPuzzleCatalogMarkdown(difficulty: string): string {
  const puzzles: Record<string, { title: string; items: string[] }> = {
    easy: {
      title: 'Easy Puzzles',
      items: [
        '**Addition** — `a + b`',
        '**Subtraction** — `a - b`',
        '**Multiplication** — `a * b`',
        '**Floor Division** — `a // b`',
        '**Modulo** — `a % b`',
      ],
    },
    medium: {
      title: 'Medium Puzzles',
      items: [
        '**Maximum** — `max(numbers)`',
        '**Sum List** — `sum(numbers)`',
        '**Count Evens** — count even numbers',
        '**String Length** — `len(text)`',
        '**Exponent** — `base ** exp`',
      ],
    },
    hard: {
      title: 'Hard Puzzles',
      items: [
        '**Fibonacci** — n-th Fibonacci number',
        '**Median** — middle value of sorted list',
        '**Unique Count** — `len(set(numbers))`',
        '**GCD** — greatest common divisor',
      ],
    },
  };

  const pool = puzzles[difficulty] || puzzles.easy;

  return `## ${pool.title}

This node generates random puzzles from the following pool. Each puzzle gives you parameters and expects a numeric answer.

${pool.items.map(p => `- ${p}`).join('\n')}

### How to solve

\`\`\`python
node = self.get_current_node()  # ComputeNode
task = node.get_task()           # ComputeTask

# task.parameters has the puzzle inputs
# task.hint shows the expected operation
params = task.parameters
op = params["op"]

if op == "add":
    answer = params["a"] + params["b"]
elif op == "multiply":
    answer = params["a"] * params["b"]
# ... handle other ops

result = node.submit(task.task_id, answer)
# result["correct"] == True  -> +resources!
\`\`\`

### Rewards

| Difficulty | Base Reward | Cooldown |
|-----------|------------|----------|
| Easy | 5 data | 10s |
| Medium | 15 data | 20s |
| Hard | 40 data | 30s |
`;
}

export function NodeInfoDialog({ config, onClose }: { config: NodeDialogConfig; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)', zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
          width: 560, maxWidth: 'calc(100vw - 48px)', height: 480,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {config.dialogTitle}
          </span>
          <button onClick={onClose} style={{
            color: 'var(--text-muted)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Markdown content={config.dialogContent} />
        </div>
      </motion.div>
    </motion.div>
  );
}
