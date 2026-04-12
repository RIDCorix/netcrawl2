import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

export function StepBar({ steps, currentStep }: { steps: { label: string; key: string }[]; currentStep: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: isCurrent ? 'var(--accent-dim)' : 'transparent',
              border: isCurrent ? '1px solid rgba(0,212,170,0.25)' : '1px solid transparent',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
                background: isDone ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--bg-elevated)',
                color: isDone || isCurrent ? '#000' : 'var(--text-muted)',
                border: `1px solid ${isDone || isCurrent ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {isDone ? <Check size={10} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-muted)', margin: '0 2px' }} />}
          </div>
        );
      })}
    </div>
  );
}
