import React from 'react';

type DebugPanelProps = {
  lines: string[];
  visible?: boolean;
  max?: number; // cap lines shown
};

export default function DebugPanel({ lines, visible = true, max = 200 }: DebugPanelProps) {
  if (!visible) return null;
  const slice = lines.slice(-max);

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 1000,
        width: 'min(46vw, 640px)',
        maxHeight: '40vh',
        overflowY: 'auto',
        padding: '8px 10px',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        background: 'rgba(10, 10, 14, 0.8)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: '18px',
        color: '#d1d5db',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(6px)',
        whiteSpace: 'pre-wrap',
      }}
    >
      {slice.length === 0 ? (
        <div style={{ opacity: 0.7 }}>debug: (no messages)</div>
      ) : (
        slice.map((l, i) => <div key={i}>{l}</div>)
      )}
    </div>
  );
}
