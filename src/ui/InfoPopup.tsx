import React, { useEffect } from 'react';
import './infoPopup.css';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function InfoPopup({ open, onClose }: Props) {
  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ip-backdrop" role="dialog" aria-modal="true">
      <div className="ip-card">
        <button className="ip-close" aria-label="Close" onClick={onClose}>×</button>
        <h2 className="ip-title">Flipit Asteroids: Play Free, Win Big</h2>

        <ul className="ip-list">
          <li><strong>Win up to $10,000</strong> in random Flipit rewards.</li>
          <li><strong>Survive, score, and beat challenges</strong> — more chances as you progress.</li>
          <li><strong>Invite friends</strong> — if they hit a big prize, you <strong>match their reward</strong>.</li>
          <li><strong>Exclusive node giveaways</strong> — special drops with lasting value.</li>
          <li><strong>Always free to play</strong> — skill and luck decide the rest.</li>
        </ul>

        <p className="ip-foot">The beam chooses, but the rewards are real.</p>

        <button className="ip-cta" onClick={onClose}>
          Continue Playing
          <span className="ip-sub">Good luck, pilot.</span>
        </button>
      </div>
    </div>
  );
}
