import React from 'react';

type DebugPanelProps = {
  lines: string[];
  visible?: boolean;
  max?: number; // cap lines shown
  onClose?: () => void;
  devConsole?: {
    lines: string[];
    onCopy: () => void;
    onToggleMax: () => void;
    maximized: boolean;
  };
};

export default function DebugPanel({ lines, visible = true, max = 200, onClose, devConsole }: DebugPanelProps) {
  if (!visible) return null;
  const slice = lines.slice(-max);

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        top: 12,
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
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close debug panel"
          style={{
            position: 'absolute',
            right: 6,
            top: 6,
            background: 'rgba(31, 41, 55, 0.8)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#e5e7eb',
            borderRadius: 6,
            padding: '2px 6px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      )}
      {slice.length === 0 ? (
        <div style={{ opacity: 0.7 }}>debug: (no messages)</div>
      ) : (
        slice.map((l, i) => <div key={i}>{l}</div>)
      )}

      {/* Optional embedded Debug Console (used by host panel when provided) */}
      {devConsole && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#67e8f9' }}>Debug Console</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={devConsole.onToggleMax}
                style={{ background: 'rgba(31,41,55,0.8)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
              >{devConsole.maximized ? 'Minimize' : 'Maximize'}</button>
              <button
                onClick={devConsole.onCopy}
                style={{ background: 'rgba(31,41,55,0.8)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
              >Copy</button>
            </div>
          </div>
          <div
            style={{
              background: 'rgba(31, 41, 55, 0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '6px 8px',
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              lineHeight: '16px',
              maxHeight: devConsole.maximized ? 260 : 96,
            }}
          >
            {(devConsole.lines.slice(-250)).map((ln, i) => (
              <div key={i}>{ln}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
