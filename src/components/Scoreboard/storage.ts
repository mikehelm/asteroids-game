// Local storage management for scoreboard
// This will be replaced with API calls when backend is ready

import { ScoreEntry, UserProfile, LocalScoreboard, PendingReward } from './types';

const STORAGE_KEY = 'asteroids_scoreboard';
const USER_KEY = 'asteroids_user';
const USERS_DB_KEY = 'asteroids_users_db'; // Database of all registered users
const REWARDS_KEY = 'asteroids_pending_rewards';

// Get all scores from localStorage
export function getScores(): ScoreEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const scoreboard: LocalScoreboard = JSON.parse(data);
    return scoreboard.scores || [];
  } catch (error) {
    console.error('Error reading scores:', error);
    return [];
  }
}

// Save a new score
export function saveScore(entry: Omit<ScoreEntry, 'id' | 'timestamp'>): ScoreEntry {
  const scores = getScores();
  
  const newEntry: ScoreEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  
  scores.push(newEntry);
  
  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);
  
  // Keep top 100 scores
  const topScores = scores.slice(0, 100);
  
  const scoreboard: LocalScoreboard = {
    scores: topScores,
    currentUser: getCurrentUser(),
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scoreboard));
  
  return newEntry;
}

// Get top N scores
export function getTopScores(limit: number = 10): ScoreEntry[] {
  const scores = getScores();
  return scores.slice(0, limit);
}

// Get user's best score
export function getUserBestScore(email: string): ScoreEntry | null {
  const scores = getScores();
  const userScores = scores.filter(s => s.userEmail === email);
  return userScores.length > 0 ? userScores[0] : null;
}

// Get user's rank (1-indexed)
export function getUserRank(email: string): number | null {
  const scores = getScores();
  const index = scores.findIndex(s => s.userEmail === email);
  return index >= 0 ? index + 1 : null;
}

// User database management (stores all registered users)
function getUsersDatabase(): Record<string, UserProfile> {
  try {
    const data = localStorage.getItem(USERS_DB_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users database:', error);
    return {};
  }
}

function saveUsersDatabase(users: Record<string, UserProfile>): void {
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
}

export function getUserByEmail(email: string): UserProfile | null {
  const users = getUsersDatabase();
  return users[email.toLowerCase()] || null;
}

function saveUserToDatabase(user: UserProfile): void {
  const users = getUsersDatabase();
  users[user.email.toLowerCase()] = user;
  saveUsersDatabase(users);
}

// Current user management (currently logged in user)
export function getCurrentUser(): UserProfile | null {
  try {
    const data = localStorage.getItem(USER_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading user:', error);
    return null;
  }
}

export function saveUser(user: UserProfile): void {
  // Save to both current user AND the database
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  saveUserToDatabase(user);
}

export function clearUser(): void {
  // Only clear current user, keep in database
  localStorage.removeItem(USER_KEY);
}

// Pending rewards management
export function getPendingRewards(): PendingReward[] {
  try {
    const data = localStorage.getItem(REWARDS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading rewards:', error);
    return [];
  }
}

export function addPendingReward(reward: Omit<PendingReward, 'rewardId'>): void {
  const rewards = getPendingRewards();
  const newReward: PendingReward = {
    ...reward,
    rewardId: crypto.randomUUID(),
  };
  rewards.push(newReward);
  localStorage.setItem(REWARDS_KEY, JSON.stringify(rewards));
}

export function markRewardAsClaimed(rewardId: string): void {
  const rewards = getPendingRewards();
  const updated = rewards.map(r => 
    r.rewardId === rewardId ? { ...r, claimed: true } : r
  );
  localStorage.setItem(REWARDS_KEY, JSON.stringify(updated));
}

export function getTotalPendingRewards(): number {
  const rewards = getPendingRewards();
  return rewards
    .filter(r => !r.claimed)
    .reduce((sum, r) => sum + r.amount, 0);
}

// Clear all data (for testing)
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REWARDS_KEY);
}

// Ticket system storage
const CURRENT_GAME_TICKETS_KEY = 'asteroids_current_game_tickets';
const LIFETIME_TICKETS_KEY = 'asteroids_lifetime_tickets';

export function getCurrentGameTickets(): number {
  try {
    const tickets = localStorage.getItem(CURRENT_GAME_TICKETS_KEY);
    return tickets ? parseInt(tickets, 10) : 0;
  } catch {
    return 0;
  }
}

export function getLifetimeTickets(): number {
  try {
    const tickets = localStorage.getItem(LIFETIME_TICKETS_KEY);
    return tickets ? parseInt(tickets, 10) : 0;
  } catch {
    return 0;
  }
}

export function incrementCurrentGameTickets(): void {
  const current = getCurrentGameTickets();
  localStorage.setItem(CURRENT_GAME_TICKETS_KEY, String(current + 1));
}

export function addTicketToLifetime(): void {
  const current = getLifetimeTickets();
  localStorage.setItem(LIFETIME_TICKETS_KEY, String(current + 1));
}

export function resetCurrentGameTickets(): void {
  localStorage.setItem(CURRENT_GAME_TICKETS_KEY, '0');
}
