import React, { useEffect, useRef, useState } from 'react';
import { RegistrationModal } from './RegistrationModal';
import { ScoreboardDisplay } from './ScoreboardDisplay';
import { UserProfile } from './types';
import { saveScore, addPendingReward, getCurrentUser, getCurrentGameTickets, getLifetimeTickets } from './storage';

interface ScoreboardProps {
  score: number;
  stage: number;
  rewardAmount: number;
  onComplete: () => void;
}

type FlowState = 'registration' | 'wallet-prompt' | 'complete' | 'scoreboard';

export const Scoreboard: React.FC<ScoreboardProps> = ({
  score,
  stage,
  rewardAmount,
  onComplete,
}) => {
  const existingUser = getCurrentUser();
  const [flowState, setFlowState] = useState<FlowState>(
    existingUser ? 'wallet-prompt' : 'registration'
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(existingUser);
  const [targetScoreId, setTargetScoreId] = useState<string | undefined>(undefined);
  const didAutoSaveRef = useRef(false);

  const handleRegistrationComplete = (profile: UserProfile) => {
    setUserProfile(profile);

    // Save score to leaderboard and capture ID for auto-scroll
    const saved = saveScore({
      displayName: profile.displayName,
      score,
      stage,
      rewardAmount,
      userEmail: profile.email,
    });
    setTargetScoreId(saved.id);

    // Save pending reward
    if (rewardAmount > 0) {
      addPendingReward({
        amount: rewardAmount,
        tokenSymbol: 'Tickets',
        earnedAt: Date.now(),
        gameScore: score,
        claimed: false,
      });
    }

    // Move to wallet prompt
    setFlowState('wallet-prompt');
  };

  // If user already exists, auto-save score once when we reach wallet-prompt
  useEffect(() => {
    if (flowState !== 'wallet-prompt' || !userProfile || didAutoSaveRef.current) return;
    try {
      const saved = saveScore({
        displayName: userProfile.displayName,
        score,
        stage,
        rewardAmount,
        userEmail: userProfile.email,
      });
      setTargetScoreId(saved.id);

      if (rewardAmount > 0) {
        addPendingReward({
          amount: rewardAmount,
          tokenSymbol: 'Tickets',
          earnedAt: Date.now(),
          gameScore: score,
          claimed: false,
        });
      }
    } finally {
      didAutoSaveRef.current = true;
    }
  }, [flowState, userProfile, score, stage, rewardAmount]);

  // Listen for 'R' key to close scoreboard and restart game
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onComplete(); // This will close scoreboard and initGame() is called from Game.tsx
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete]);

  const handleSkipRegistration = () => {
    // Save score anonymously
    const saved = saveScore({
      displayName: 'Anonymous',
      score,
      stage,
      rewardAmount: 0, // No rewards without registration
      userEmail: undefined,
    });
    setTargetScoreId(saved.id);

    setFlowState('complete');
  };

  const handleWalletConnect = () => {
    // TODO: Implement wallet connection when RainbowKit is added
    alert('Wallet connection coming soon! You can add it later in your profile.');
    setFlowState('complete');
  };

  const handleSkipWallet = () => {
    setFlowState('complete');
  };

  const handleViewScoreboard = () => {
    setFlowState('scoreboard');
  };

  const handleCloseScoreboard = () => {
    // Return to completion screen instead of closing entirely
    setFlowState('complete');
  };

  // Registration Modal
  if (flowState === 'registration') {
    return (
      <RegistrationModal
        score={score}
        stage={stage}
        rewardAmount={rewardAmount}
        onComplete={handleRegistrationComplete}
        onSkip={handleSkipRegistration}
      />
    );
  }

  // Wallet Connection Prompt
  if (flowState === 'wallet-prompt' && userProfile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
        <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
          {/* Success Header */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">✅</div>
            <h2 className="text-3xl font-bold text-cyan-400 mb-2">Score Saved!</h2>
            <p className="text-white text-lg">
              Welcome, <span className="font-bold">{userProfile.displayName}</span>!
            </p>
          </div>

          {/* Reward Info */}
          {rewardAmount > 0 && (
            <>
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-500 rounded p-4 mb-6">
                <p className="text-yellow-200 text-center mb-2">
                  <span className="text-2xl font-bold block mb-1">
                    💰 {rewardAmount.toFixed(2)} FLIP
                  </span>
                  Rewards are ready to claim!
                </p>
              </div>

              <div className="bg-gray-800 rounded p-4 mb-6">
                <h3 className="text-white font-bold mb-3">To claim your rewards:</h3>
                <ol className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">1.</span>
                    <span>Connect your crypto wallet (MetaMask, WalletConnect, etc.)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">2.</span>
                    <span>Verify wallet ownership</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">3.</span>
                    <span>Claim rewards (sent directly to your wallet)</span>
                  </li>
                </ol>
              </div>

              <p className="text-gray-400 text-sm text-center mb-6">
                You can connect your wallet now or do it later in your profile.
                Your rewards won't expire for 90 days.
              </p>
            </>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            {rewardAmount > 0 && (
              <button
                onClick={handleWalletConnect}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded font-bold transition-colors flex items-center justify-center gap-2"
              >
                <span>🦊</span>
                Connect Wallet Now
              </button>
            )}
            <button
              onClick={handleViewScoreboard}
              className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded font-bold transition-colors"
            >
              View Leaderboard
            </button>
            <button
              onClick={handleSkipWallet}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold transition-colors"
            >
              {rewardAmount > 0 ? 'Add Wallet Later' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completion Screen
  if (flowState === 'complete') {
    const currentGameTickets = getCurrentGameTickets();
    const lifetimeTickets = getLifetimeTickets();
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-85 backdrop-blur-md">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-4 border-cyan-400 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 animate-pulse"></div>
          
          <div className="text-center relative z-10">
            <div className="text-7xl mb-4 animate-bounce">🎮</div>
            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-6">Thanks for Playing!</h2>
            
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-yellow-500 rounded-xl p-6 mb-6 shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-orange-500/10"></div>
              <div className="relative z-10">
                <div className="text-yellow-400 text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                  <span className="text-3xl">🎟️</span>
                  <span>+{currentGameTickets} This Game</span>
                </div>
                <div className="border-t border-yellow-500/30 my-4" />
                <div className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-400 text-3xl font-extrabold">
                  LIFETIME: {lifetimeTickets} 🎟️
                </div>
              </div>
            </div>
            
            {userProfile && rewardAmount > 0 && (
              <p className="text-gray-300 mb-6">
                Your tickets are saved and ready for prize drawings!
              </p>
            )}

            <div className="space-y-3">
              <button
                onClick={handleViewScoreboard}
                className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded font-bold transition-colors"
              >
                View Leaderboard
              </button>
              <button
                onClick={onComplete}
                className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Scoreboard Display
  if (flowState === 'scoreboard') {
    return <ScoreboardDisplay onClose={handleCloseScoreboard} targetScoreId={targetScoreId} />;
  }

  return null;
};
