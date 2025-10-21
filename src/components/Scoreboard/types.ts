// Scoreboard types

export interface ScoreEntry {
  id: string;
  displayName: string;
  score: number;
  rewardAmount: number;
  timestamp: number;
  stage: number;
  userEmail?: string; // Not shown publicly
}

export interface UserProfile {
  email: string;
  displayName: string;
  passwordHash?: string; // For local auth only - will be removed when backend is added
  walletAddress?: string;
  walletProvider?: 'metamask' | 'walletconnect' | 'coinbase';
  emailVerified: boolean;
  createdAt: number;
}

export interface LocalScoreboard {
  scores: ScoreEntry[];
  currentUser?: UserProfile;
}

export interface PendingReward {
  rewardId: string;
  amount: number;
  tokenSymbol: string;
  earnedAt: number;
  gameScore: number;
  claimed: boolean;
}
