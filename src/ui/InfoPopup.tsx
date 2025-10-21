import { useEffect } from 'react';
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
    <div className="ip-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ip-card" onClick={(e) => e.stopPropagation()}>
        <button className="ip-close" aria-label="Close" onClick={onClose}>×</button>
        
        {/* Hero Section */}
        <div className="ip-hero">
          <div className="ip-icon-burst">🚀</div>
          <h2 className="ip-title">Flipit Asteroids</h2>
          <p className="ip-subtitle">Play Free, Win Big</p>
        </div>

        {/* Features Grid */}
        <div className="ip-features">
          <div className="ip-feature">
            <div className="ip-feature-icon">💰</div>
            <div className="ip-feature-content">
              <h3 className="ip-feature-title">Win up to $10,000</h3>
              <p className="ip-feature-desc">Random Flipit rewards await</p>
            </div>
          </div>

          <div className="ip-feature">
            <div className="ip-feature-icon">🎁</div>
            <div className="ip-feature-content">
              <h3 className="ip-feature-title">Node Giveaways</h3>
              <p className="ip-feature-desc">Exclusive drops with lasting value</p>
            </div>
          </div>
        </div>

        {/* Featured: Invite Friends */}
        <div className="ip-featured-section">
          <div className="ip-featured-badge">Invite for rewards!</div>
          <div className="ip-featured-card">
            <div className="ip-featured-icon">🤝</div>
            <h3 className="ip-featured-title">Invite Friends & Match Rewards!</h3>
            <p className="ip-featured-desc">
              When your friends win big, <strong>you win too!</strong> Get matching rewards for every prize they unlock. 
              The more friends, the more chances to win.
            </p>
            <div className="ip-featured-highlight">
              💎 <strong>100% Reward Match</strong> on all friend prizes
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button className="ip-cta" onClick={onClose}>
          <span className="ip-cta-main">Continue Playing</span>
          <span className="ip-cta-sub">Good luck, pilot. 🛸</span>
        </button>
      </div>
    </div>
  );
}
