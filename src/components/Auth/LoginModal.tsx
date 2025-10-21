import React, { useState } from 'react';
import { UserProfile } from '../Scoreboard/types';
import { saveUser, getUserByEmail } from '../Scoreboard/storage';

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

type AuthMode = 'login' | 'register';

// Simple hash function for local password storage
// NOTE: This is for local development only. Real production should use proper backend auth!
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    setIsSubmitting(true);

    try {
      // TODO: Replace with real API call when backend is ready
      // For now, check localStorage for existing user
      await new Promise(resolve => setTimeout(resolve, 500));

      const existingUser = getUserByEmail(email);
      if (existingUser) {
        // Check if this is an old account without password hash (created before password feature)
        if (!existingUser.passwordHash) {
          // Migrate old account: add password hash
          const inputPasswordHash = await hashPassword(password);
          const updatedUser = {
            ...existingUser,
            passwordHash: inputPasswordHash,
          };
          saveUser(updatedUser);
          onSuccess(updatedUser);
          onClose();
          return;
        }
        
        // Verify password hash for accounts with password
        const inputPasswordHash = await hashPassword(password);
        if (existingUser.passwordHash === inputPasswordHash) {
          saveUser(existingUser); // Set as current user
          onSuccess(existingUser);
          onClose();
        } else {
          setError('Invalid password. Please try again.');
        }
      } else {
        setError('No account found with this email. Please register.');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!displayName.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields');
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

    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      // TODO: Replace with real API call when backend is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if user already exists in database
      const existingUser = getUserByEmail(email);
      if (existingUser) {
        setError('An account with this email already exists. Please login.');
        setIsSubmitting(false);
        return;
      }

      // Hash the password before storing
      const passwordHash = await hashPassword(password);

      const newUser: UserProfile = {
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        passwordHash,
        emailVerified: false,
        createdAt: Date.now(),
      };

      saveUser(newUser);
      onSuccess(newUser);
      onClose();
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400">
            {mode === 'login' ? 'Login' : 'Register'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-2 rounded font-bold transition-colors ${
              mode === 'login'
                ? 'bg-cyan-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-2 rounded font-bold transition-colors ${
              mode === 'register'
                ? 'bg-cyan-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="displayName" className="block text-cyan-300 text-sm font-bold mb-2">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-400 focus:outline-none"
                placeholder="Your name"
                maxLength={20}
                disabled={isSubmitting}
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-cyan-300 text-sm font-bold mb-2">
              Email
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
          </div>

          <div>
            <label htmlFor="password" className="block text-cyan-300 text-sm font-bold mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-400 focus:outline-none"
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              disabled={isSubmitting}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="confirmPassword" className="block text-cyan-300 text-sm font-bold mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-400 focus:outline-none"
                placeholder="Confirm password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-500 rounded p-3">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {/* Info Box for Registration */}
          {mode === 'register' && !error && (
            <div className="bg-cyan-900 bg-opacity-20 border border-cyan-600 rounded p-3">
              <p className="text-cyan-200 text-xs">
                📧 Your email will be used to track your scores and claim rewards.
                We'll never share it publicly.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Please wait...'
              : mode === 'login'
              ? 'Login'
              : 'Create Account'}
          </button>
        </form>

        {/* Footer Note */}
        <p className="text-gray-500 text-xs text-center mt-4">
          {mode === 'login' 
            ? "Don't have an account? Click Register above." 
            : 'Already have an account? Click Login above.'}
        </p>

        {/* Temp Dev Note */}
        <p className="text-yellow-500 text-xs text-center mt-2 italic">
          ⚠️ Dev Mode: Data stored locally only
        </p>
      </div>
    </div>
  );
};
