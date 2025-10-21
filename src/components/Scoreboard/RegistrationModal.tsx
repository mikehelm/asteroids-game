import React, { useState } from 'react';
import { UserProfile } from './types';
import { saveUser, getCurrentUser } from './storage';

interface RegistrationModalProps {
  score: number;
  stage: number;
  rewardAmount: number;
  onComplete: (profile: UserProfile) => void;
  onSkip: () => void;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  score,
  stage,
  rewardAmount,
  onComplete,
  onSkip,
}) => {
  const existingUser = getCurrentUser();
  const [displayName, setDisplayName] = useState(existingUser?.displayName || '');
  const [email, setEmail] = useState(existingUser?.email || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (displayName.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (displayName.trim().length > 20) {
      setError('Name must be less than 20 characters');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    setIsSubmitting(true);

    try {
      const profile: UserProfile = {
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        emailVerified: false,
        createdAt: Date.now(),
        // Wallet will be added later
      };

      // Save to localStorage (will be API call later)
      saveUser(profile);

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      onComplete(profile);
    } catch (err) {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-cyan-400 mb-2">Game Over!</h2>
          <div className="text-white space-y-1">
            <p className="text-2xl font-bold">Score: {score.toLocaleString()}</p>
            <p className="text-lg">Stage: {stage}</p>
            {rewardAmount > 0 && (
              <p className="text-yellow-400 text-xl font-bold mt-2">
                🎟️ Tickets Earned: {Math.floor(rewardAmount)}
              </p>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-yellow-900 bg-opacity-30 border border-yellow-500 rounded p-4 mb-6">
          <p className="text-yellow-200 text-sm">
            <span className="font-bold">⚠️ Register to claim rewards!</span>
            <br />
            Your email is required to save your score and claim your earned rewards.
            {rewardAmount > 0 && " You'll need to connect a wallet later to receive tokens."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-cyan-300 text-sm font-bold mb-2">
              Display Name (shown on leaderboard)
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-400 focus:outline-none"
              placeholder="Enter your name"
              maxLength={20}
              disabled={isSubmitting}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-cyan-300 text-sm font-bold mb-2">
              Email (required for account)
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-400 focus:outline-none"
              placeholder="your@email.com"
              disabled={isSubmitting}
            />
            <p className="text-gray-400 text-xs mt-1">
              We'll send you updates about your rewards
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-500 rounded p-3">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold transition-colors"
              disabled={isSubmitting}
            >
              Skip
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Register & Save'}
            </button>
          </div>
        </form>

        {/* Privacy Note */}
        <p className="text-gray-500 text-xs text-center mt-4">
          Your email will not be shared publicly. See our privacy policy for details.
        </p>
      </div>
    </div>
  );
};
