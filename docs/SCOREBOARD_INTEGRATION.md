# Scoreboard Integration Guide

Step-by-step guide to add the scoreboard to your game.

---

## Step 1: Add State to Game.tsx

Add these state variables to track when to show the scoreboard:

```typescript
// In your Game component
const [showScoreboard, setShowScoreboard] = useState(false);
const [finalScore, setFinalScore] = useState(0);
const [finalStage, setFinalStage] = useState(1);
const [rewardAmount, setRewardAmount] = useState(0);
```

---

## Step 2: Calculate Rewards at Game End

When the game ends (player dies with no lives left), calculate rewards:

```typescript
// Add this function to calculate rewards
const calculateGameRewards = (gameState: GameState): number => {
  // Example reward calculation
  // Adjust this to match your reward system
  
  const baseReward = gameState.score / 10000; // 1 FLIP per 10k points
  const stageBonus = gameState.stage * 0.5; // Bonus per stage
  
  // Check if player collected any artifacts
  const artifactBonus = gameState.currentArtifact ? 
    (gameState.currentArtifact.finalChance / 100) * 10 : 0;
  
  const totalReward = baseReward + stageBonus + artifactBonus;
  
  return Math.max(0, totalReward); // Never negative
};
```

---

## Step 3: Trigger Scoreboard on Game Over

Find where your game over logic happens (when lives reach 0):

```typescript
// Find this in your game loop (around line 3100-3200 in Game.tsx)
if (gameState.lives <= 0) {
  // BEFORE ending the game, save the final state
  const score = gameState.score;
  const stage = gameState.stage;
  const rewards = calculateGameRewards(gameState);
  
  setFinalScore(score);
  setFinalStage(stage);
  setRewardAmount(rewards);
  setShowScoreboard(true);
  
  // Pause game or stop animation loop
  // (The scoreboard will overlay the game)
}
```

---

## Step 4: Import Scoreboard Component

At the top of Game.tsx:

```typescript
import { Scoreboard } from './components/Scoreboard';
```

---

## Step 5: Render Scoreboard

At the end of your Game component's return statement (after the canvas):

```typescript
return (
  <div className="relative w-full h-full">
    {/* Your existing game UI */}
    <canvas ref={canvasRef} />
    
    {/* All your existing menus, buttons, etc. */}
    
    {/* ADD THIS: Scoreboard overlay */}
    {showScoreboard && (
      <Scoreboard
        score={finalScore}
        stage={finalStage}
        rewardAmount={rewardAmount}
        onComplete={() => {
          setShowScoreboard(false);
          // Reset game to menu or restart
          initGame();
        }}
      />
    )}
  </div>
);
```

---

## Step 6: Add "View Leaderboard" Button (Optional)

In your game menu, add a button to view the leaderboard anytime:

```typescript
import { ScoreboardDisplay } from './components/Scoreboard';

// In your menu component
const [showLeaderboard, setShowLeaderboard] = useState(false);

// Add this button to your menu
<button 
  onClick={() => setShowLeaderboard(true)}
  className="px-6 py-3 bg-cyan-500 text-black rounded font-bold"
>
  🏆 Leaderboard
</button>

// Render the leaderboard
{showLeaderboard && (
  <ScoreboardDisplay onClose={() => setShowLeaderboard(false)} />
)}
```

---

## Step 7: Show User Info in HUD (Optional)

Display the current user's name in the game HUD:

```typescript
import { getCurrentUser } from './components/Scoreboard';

// In your HUD or header
const currentUser = getCurrentUser();

{currentUser && (
  <div className="text-white">
    Welcome, {currentUser.displayName}!
  </div>
)}
```

---

## Complete Example

Here's a minimal example showing the key parts:

```typescript
import React, { useState, useEffect } from 'react';
import { Scoreboard, ScoreboardDisplay, getCurrentUser } from './components/Scoreboard';

function Game() {
  // Game state
  const [gameState, setGameState] = useState(/* ... */);
  
  // Scoreboard state
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalStage, setFinalStage] = useState(1);
  const [rewardAmount, setRewardAmount] = useState(0);
  
  const currentUser = getCurrentUser();
  
  // Game loop
  useEffect(() => {
    const gameLoop = () => {
      // Your game logic...
      
      // Check for game over
      if (gameState.lives <= 0 && !showScoreboard) {
        const score = gameState.score;
        const stage = gameState.stage;
        const rewards = calculateGameRewards(gameState);
        
        setFinalScore(score);
        setFinalStage(stage);
        setRewardAmount(rewards);
        setShowScoreboard(true);
      }
    };
    
    const intervalId = setInterval(gameLoop, 16); // 60 FPS
    return () => clearInterval(intervalId);
  }, [gameState]);
  
  const calculateGameRewards = (state: GameState): number => {
    return state.score / 10000 + state.stage * 0.5;
  };
  
  const handleScoreboardComplete = () => {
    setShowScoreboard(false);
    // Reset game or return to menu
    initGame();
  };
  
  return (
    <div className="relative w-full h-full">
      {/* Game Canvas */}
      <canvas ref={canvasRef} />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 text-white">
        {currentUser && <p>Player: {currentUser.displayName}</p>}
        <p>Score: {gameState.score}</p>
        <p>Stage: {gameState.stage}</p>
      </div>
      
      {/* Menu */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
        <button onClick={() => setShowLeaderboard(true)}>
          🏆 Leaderboard
        </button>
      </div>
      
      {/* Scoreboard (shown on game over) */}
      {showScoreboard && (
        <Scoreboard
          score={finalScore}
          stage={finalStage}
          rewardAmount={rewardAmount}
          onComplete={handleScoreboardComplete}
        />
      )}
      
      {/* Leaderboard (shown on demand) */}
      {showLeaderboard && (
        <ScoreboardDisplay 
          onClose={() => setShowLeaderboard(false)} 
        />
      )}
    </div>
  );
}
```

---

## Testing the Integration

### 1. Test Game Over Flow

```typescript
// In browser console, trigger game over manually
gameState.lives = 0;
```

You should see:
1. Registration modal (if not logged in)
2. Wallet connection prompt
3. Leaderboard option

### 2. Test with Existing User

```typescript
// In console, create a test user
import { saveUser } from './components/Scoreboard/storage';

saveUser({
  email: 'test@example.com',
  displayName: 'TestPlayer',
  emailVerified: false,
  createdAt: Date.now(),
});
```

Now when game ends, you'll skip registration.

### 3. Check Saved Scores

```typescript
// In console
import { getTopScores } from './components/Scoreboard/storage';
console.log(getTopScores(10));
```

### 4. Clear Test Data

```typescript
// In console
import { clearAllData } from './components/Scoreboard/storage';
clearAllData();
```

---

## Troubleshooting

### Scoreboard Doesn't Show
- Check that `showScoreboard` state is being set to `true`
- Verify the condition that triggers game over
- Check browser console for errors

### Registration Not Working
- Check browser localStorage (DevTools → Application → Local Storage)
- Verify email validation logic
- Check for JavaScript errors

### Scores Not Saving
- Check `saveScore()` function is being called
- Verify localStorage permissions (some browsers restrict it)
- Check browser console for storage errors

### Styling Looks Wrong
- Ensure Tailwind CSS is properly configured
- Check that no global styles are conflicting
- Verify z-index (scoreboard should be z-50)

---

## Next Steps

After basic integration:

1. **Test thoroughly** - Play through multiple games
2. **Adjust reward calculation** - Match your game economy
3. **Customize styling** - Match your game theme
4. **Add backend API** - See `/docs/SERVER_SIDE_VALIDATION.md`
5. **Add wallet connection** - See `/docs/WALLET_INTEGRATION.md`

---

## Questions?

- Check `/src/components/Scoreboard/README.md`
- Review example code in `/src/components/Scoreboard/`
- Test with browser DevTools console
