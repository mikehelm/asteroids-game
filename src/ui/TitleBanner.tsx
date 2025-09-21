import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onUiEvent } from '../events';
import './titleBanner.css';

type Props = {
  title: string;
  messages: string[];
  cycleIntervalMs?: number;
  fadeMs?: number;
  onInfoClick?: () => void;
};

export default function TitleBanner({
  title,
  messages,
  cycleIntervalMs = 5000,
  fadeMs = 600,
  onInfoClick,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const shakeRef = useRef<HTMLDivElement | null>(null);

  // Cycle tagline
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const t = setInterval(() => {
      setFading(true);
      const to = setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setFading(false);
      }, fadeMs);
      return () => clearTimeout(to);
    }, cycleIntervalMs);
    return () => clearInterval(t);
  }, [cycleIntervalMs, fadeMs, messages]);

  // Reactive shake on UI events
  useEffect(() => {
    const off = onUiEvent((e) => {
      if (e.type === 'level-up' || e.type === 'alien-kill') {
        const el = shakeRef.current;
        if (!el) return;
        el.classList.remove('tb-shake');
        // force reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        (el as any).offsetHeight;
        el.classList.add('tb-shake');
        const rm = setTimeout(() => el.classList.remove('tb-shake'), 400);
        return () => clearTimeout(rm);
      }
    });
    return off;
  }, []);

  const msg = useMemo(() => (messages && messages[idx]) || '', [messages, idx]);

  return (
    <div className="pointer-events-none fixed top-6 left-1/2 -translate-x-1/2 z-50 select-none">
      <div ref={shakeRef} className="text-center flex items-center justify-center gap-2">
        <h1 className="tb-title-gradient text-3xl md:text-4xl font-extrabold tracking-tight">
          {title}
        </h1>

        {/* Info button (clickable) */}
        {onInfoClick && (
          <button
            className="pointer-events-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
            aria-label="About rewards"
            onClick={onInfoClick}
          >
            {/* simple i icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" opacity="0.9"/>
              <path d="M12 10v7m0-9h.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* tagline area */}
      <div
        className={
          'mt-1 text-sm md:text-base font-medium text-white/90 text-center transition-opacity duration-[var(--tb-fade-ms)] ' +
          (fading ? 'opacity-0' : 'opacity-100')
        }
        style={{ '--tb-fade-ms': `${fadeMs}ms` } as React.CSSProperties}
      >
        {msg}
      </div>
    </div>
  );
}
