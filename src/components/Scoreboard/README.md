# Scoreboard Component

Local scoreboard implementation with email registration and reward tracking.

## Features

- ✅ Email registration modal at game end
- ✅ Local storage (ready for API migration)
- ✅ Top 10 leaderboard display
- ✅ Reward tracking (FLIP tokens)
- ✅ User rank tracking
- ✅ Wallet connection prompt (UI only, integration pending)

## Usage

### In Game.tsx

```typescript
import { Scoreboard } from './components/Scoreboard';

function Game() {
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalStage, setFinalStage] = useState(1);
  const [rewardAmount, setRewardAmount] = useState(0);

  // When game ends
  const handleGameOver = () => {
    const score = gameState.score;
    const stage = gameState.stage;
    const rewards = calculateRewards(gameState); // Your calculation

    setFinalScore(score);
    setFinalStage(stage);
    setRewardAmount(rewards);
    setShowScoreboard(true);
  };

  return (
    <>
      {/* Your game canvas */}
      
      {showScoreboard && (
        <Scoreboard
          score={finalScore}
          stage={finalStage}
          rewardAmount={rewardAmount}
          onComplete={() => {
            setShowScoreboard(false);
            // Reset game or return to menu
          }}
        />
      )}
    </>
  );
}
```

### Accessing Current User

```typescript
import { getCurrentUser, getPendingRewards } from './components/Scoreboard';

// Check if user is logged in
const user = getCurrentUser();
if (user) {
  console.log(`Welcome back, ${user.displayName}!`);
}

// Get unclaimed rewards
const rewards = getPendingRewards();
const total = rewards.filter(r => !r.claimed).reduce((sum, r) => sum + r.amount, 0);
console.log(`You have ${total} FLIP to claim`);
```

### Showing Leaderboard Anytime

```typescript
import { ScoreboardDisplay } from './components/Scoreboard';

function Menu() {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  return (
    <>
      <button onClick={() => setShowLeaderboard(true)}>
        View Leaderboard
      </button>

      {showLeaderboard && (
        <ScoreboardDisplay onClose={() => setShowLeaderboard(false)} />
      )}
    </>
  );
}
```

## Data Storage

Currently uses **localStorage**:
- `asteroids_scoreboard` - Score entries
- `asteroids_user` - Current user profile
- `asteroids_pending_rewards` - Unclaimed rewards

### Storage Functions

```typescript
// Scores
getScores() // Get all scores
getTopScores(10) // Get top N
getUserBestScore(email) // User's highest score
getUserRank(email) // User's leaderboard position
saveScore(entry) // Add new score

// User
getCurrentUser() // Get logged-in user
saveUser(profile) // Save/update user
clearUser() // Log out

// Rewards
getPendingRewards() // All rewards
getTotalPendingRewards() // Sum of unclaimed
addPendingReward(reward) // Add new reward
markRewardAsClaimed(id) // Mark as claimed

// Testing
clearAllData() // Wipe everything
```

## Data Types

### ScoreEntry
```typescript
{
  id: string;
  displayName: string;
  score: number;
  rewardAmount: number;
  timestamp: number;
  stage: number;
  userEmail?: string; // Private
}
```

### UserProfile
```typescript
{
  email: string;
  displayName: string;
  walletAddress?: string; // Added when wallet connected
  walletProvider?: 'metamask' | 'walletconnect' | 'coinbase';
  emailVerified: boolean;
  createdAt: number;
}
```

### PendingReward
```typescript
{
  rewardId: string;
  amount: number;
  tokenSymbol: string; // 'FLIP'
  earnedAt: number;
  gameScore: number;
  claimed: boolean;
}
```

## Migration to Backend

When ready to add API:

### 1. Create API Endpoints

```typescript
// Replace storage functions with API calls

// Before (localStorage)
saveScore(entry);

// After (API)
await fetch('/api/scores', {
  method: 'POST',
  body: JSON.stringify(entry),
});
```

### 2. Update Functions

```typescript
// src/components/Scoreboard/storage.ts

export async function saveScore(entry: Omit<ScoreEntry, 'id'>): Promise<ScoreEntry> {
  // API call instead of localStorage
  const response = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  
  if (!response.ok) throw new Error('Failed to save score');
  
  return await response.json();
}
```

### 3. Add Authentication

```typescript
// Use JWT or session tokens
const token = localStorage.getItem('auth_token');

await fetch('/api/scores', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  // ...
});
```

## Wallet Integration

See `/docs/WALLET_INTEGRATION.md` for complete guide.

### Quick Start (Later)

```bash
npm install @rainbow-me/rainbowkit wagmi viem
```

```typescript
// Update Scoreboard.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';

const handleWalletConnect = async () => {
  // RainbowKit handles the UI
  // On success, save wallet address
  const address = await getWalletAddress();
  await updateUserWallet(address);
};
```

## Testing

### Add Test Scores

```typescript
import { saveScore } from './components/Scoreboard';

// Add test data
saveScore({
  displayName: 'Test Player 1',
  score: 50000,
  stage: 5,
  rewardAmount: 10.5,
  userEmail: 'test@example.com',
});
```

### Clear Data

```typescript
import { clearAllData } from './components/Scoreboard';

// Wipe everything (use in dev tools)
clearAllData();
```

## Styling

Uses Tailwind CSS classes. Components are:
- **Responsive** (mobile-friendly)
- **Dark themed** (matches game aesthetic)
- **Accessible** (keyboard navigation, ARIA labels)

### Customization

Edit colors in component files:
- `border-cyan-400` → Your brand color
- `bg-gray-900` → Your background
- `text-yellow-400` → Reward highlight color

## Security Notes

⚠️ **Current Implementation (localStorage):**
- No authentication
- Client-side only
- Easily modified in browser
- **FOR TESTING ONLY**

✅ **Production Requirements:**
- Move to backend API
- Add authentication
- Server-side validation
- See `/docs/SERVER_SIDE_VALIDATION.md`

## Roadmap

- [ ] Backend API integration
- [ ] Email verification
- [ ] RainbowKit wallet connection
- [ ] Smart contract reward distribution
- [ ] Profile page
- [ ] Reward claim UI
- [ ] Transaction history
- [ ] Leaderboard filters (daily, weekly, all-time)
- [ ] Achievement badges

## Support

Questions? See:
- `/docs/WALLET_INTEGRATION.md` - Wallet setup
- `/docs/SERVER_SIDE_VALIDATION.md` - Backend security
