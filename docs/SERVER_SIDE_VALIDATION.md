# Server-Side Validation for Reward System

**Status:** 🔴 TODO - Required before launching with real rewards

**Priority:** HIGH if implementing real rewards, LOW if staying single-player entertainment

---

## Current Implementation

### What We Have Now
- **Client-side random generation**: All `Math.random()` calls happen in browser
- **Client-side reward calculation**: `flipitChance`, `finalChance`, stage multipliers all calculated in JavaScript
- **No validation**: No server checks if results are legitimate
- **Vulnerable to**: Browser DevTools, memory hacks, code injection

### Files Involved
- `src/Game.tsx` - Lines 1321-1323 (LOST sequence calculation)
- `src/Game.tsx` - Lines 1437-1443 (Artifact reward storage)
- `src/gameLoop/staging.ts` - Where `flipitChance` is initially assigned to asteroids
- `src/tractorBeam/state.ts` - Tractor beam state management

---

## Why This Matters

### ✅ Current Use Case (Safe)
If the game is purely for entertainment with no real-world value:
- No real money involved
- No cryptocurrency/NFT rewards
- No competitive leaderboards with prizes
- **Action Needed:** None - current implementation is fine

### ⚠️ Future Use Cases (Requires Changes)
If implementing any of:
- Real money rewards
- Cryptocurrency/token payouts
- NFT minting based on game results
- Prize giveaways
- Competitive leaderboards with rewards
- **Action Needed:** Implement server-side validation IMMEDIATELY

---

## Security Vulnerabilities

### Easy Exploits
```javascript
// 1. Modify chance directly in console
gameState.currentArtifact.finalChance = 100;

// 2. Override random number generator
Math.random = () => 0.999;

// 3. Change traction beam state
tractionBeamRef.current.flipitChance = 1.0;

// 4. Manipulate player stats
gameState.player.health = 999999;
gameState.stage = 100; // Multiply rewards by 100x
```

### Impact
- Players can guarantee 100% win rate
- Players can multiply rewards arbitrarily
- No way to detect or prevent cheating
- Impossible to maintain fair leaderboards

---

## Proposed Solution

### Architecture Overview
```
┌─────────────┐          ┌─────────────┐
│   Client    │          │   Server    │
│  (Browser)  │          │   (API)     │
└──────┬──────┘          └──────┬──────┘
       │                        │
       │ 1. Scan Request        │
       ├───────────────────────>│
       │    {asteroidId}        │
       │                        │
       │                   2. Validate
       │                   3. Generate RNG
       │                   4. Calculate Reward
       │                        │
       │ 5. Signed Result       │
       │<───────────────────────┤
       │    {chance, signature} │
       │                        │
       │ 6. Claim Request       │
       ├───────────────────────>│
       │    {resultId}          │
       │                        │
       │                   7. Verify Signature
       │                   8. Issue Reward
       │                        │
       │ 9. Confirmation        │
       │<───────────────────────┤
       │                        │
```

### Implementation Steps

#### 1. Backend API Setup
**Tech Stack Options:**
- Node.js + Express
- Next.js API Routes (if already using Next)
- Serverless (AWS Lambda, Vercel Functions)
- Dedicated game server (WebSocket for real-time)

**Required Endpoints:**
```typescript
POST /api/game/scan-asteroid
  Body: { asteroidId: string, sessionId: string }
  Returns: { resultId: string, flipitChance: number, signature: string }

POST /api/game/claim-reward
  Body: { resultId: string, signature: string }
  Returns: { success: boolean, rewardAmount: number, txHash?: string }

GET /api/game/session/create
  Returns: { sessionId: string, expiresAt: number }
```

#### 2. Session Management
```typescript
// Server creates authenticated game session
interface GameSession {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  stage: number;
  integrity: string; // Hash to prevent tampering
}
```

#### 3. RNG on Server
```typescript
// Server-side random generation
import crypto from 'crypto';

function generateSecureRandom(): number {
  const buffer = crypto.randomBytes(4);
  return buffer.readUInt32BE(0) / 0xFFFFFFFF;
}

function generateFlipitChance(): number {
  const random = generateSecureRandom();
  return random * 0.09 + 0.01; // 1% - 10%
}
```

#### 4. Cryptographic Signatures
```typescript
// Sign results to prevent tampering
import crypto from 'crypto';

const SECRET_KEY = process.env.GAME_SECRET_KEY;

function signResult(result: any): string {
  const data = JSON.stringify(result);
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('hex');
}

function verifySignature(result: any, signature: string): boolean {
  const expectedSignature = signResult(result);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

#### 5. Client Changes
```typescript
// src/Game.tsx - Replace client-side random with API call

// OLD (Client-side):
const flipitChance = Math.random() * 0.09 + 0.01;

// NEW (Server-side):
async function scanAsteroid(asteroidId: string) {
  const response = await fetch('/api/game/scan-asteroid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      asteroidId, 
      sessionId: currentSession.id 
    })
  });
  
  const { resultId, flipitChance, signature } = await response.json();
  
  // Store for later claim
  return { resultId, flipitChance, signature };
}

// When claiming reward:
async function claimReward(resultId: string, signature: string) {
  const response = await fetch('/api/game/claim-reward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultId, signature })
  });
  
  const { success, rewardAmount } = await response.json();
  return { success, rewardAmount };
}
```

#### 6. Database Schema
```sql
-- Game sessions
CREATE TABLE game_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  stage INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  integrity_hash VARCHAR(64) NOT NULL
);

-- Scan results
CREATE TABLE scan_results (
  result_id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES game_sessions(session_id),
  asteroid_id VARCHAR(64) NOT NULL,
  flipit_chance DECIMAL(5,4) NOT NULL,
  stage INT NOT NULL,
  final_chance DECIMAL(7,4) NOT NULL,
  signature VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at TIMESTAMP
);

-- Rewards issued
CREATE TABLE rewards (
  reward_id VARCHAR(64) PRIMARY KEY,
  result_id VARCHAR(64) REFERENCES scan_results(result_id),
  user_id VARCHAR(64) NOT NULL,
  amount DECIMAL(18,8) NOT NULL,
  transaction_hash VARCHAR(128), -- For blockchain rewards
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Anti-Cheat Measures

### Server-Side Checks
1. **Rate Limiting**: Max scans per session (prevent spam)
2. **Session Validation**: Ensure stage progression is legitimate
3. **Timing Analysis**: Detect impossibly fast completions
4. **Pattern Detection**: Flag suspicious win rates
5. **IP Tracking**: Detect multi-accounting

### Client-Side Obfuscation (Secondary)
- Minify and obfuscate code
- Use WebAssembly for critical calculations
- Implement integrity checks
- **Note:** These are easily bypassed; server validation is primary defense

---

## Migration Plan

### Phase 1: Preparation
- [ ] Set up backend infrastructure
- [ ] Design database schema
- [ ] Implement authentication system
- [ ] Create API endpoints
- [ ] Add cryptographic signing

### Phase 2: Parallel Implementation
- [ ] Keep existing client-side logic
- [ ] Add server-side validation in parallel
- [ ] Log discrepancies for testing
- [ ] Compare results (client vs server)

### Phase 3: Switch Over
- [ ] Make server-side authoritative
- [ ] Remove client-side random generation
- [ ] Add fallback for server downtime
- [ ] Implement proper error handling

### Phase 4: Testing
- [ ] Penetration testing
- [ ] Load testing (concurrent users)
- [ ] Attempt known exploits
- [ ] Verify signatures working
- [ ] Test rate limiting

### Phase 5: Launch
- [ ] Deploy to production
- [ ] Monitor for anomalies
- [ ] Set up alerting for suspicious activity
- [ ] Implement fraud detection

---

## Cost Considerations

### Infrastructure Costs
- **Backend Server**: $5-50/month (depending on scale)
- **Database**: $10-30/month (managed service)
- **Blockchain Gas Fees**: Variable (if issuing crypto rewards)
- **CDN/Hosting**: $0-20/month

### Development Time
- **Backend Setup**: 1-2 weeks
- **API Implementation**: 1 week
- **Client Integration**: 3-5 days
- **Testing & Security Audit**: 1 week
- **Total Estimate**: 4-6 weeks for one developer

---

## Alternative: Hybrid Approach

If full server validation is overkill:

### Leaderboard Only Validation
- Keep casual play client-side
- Only validate high scores for leaderboard
- Server checks replays/game state hashes
- Lower infrastructure cost

### Proof-of-Work
- Client must solve computational puzzle to submit score
- Slows down automated cheating
- Still vulnerable to dedicated cheaters
- Good for deterring casual cheaters

---

## Resources & References

### Security Best Practices
- [OWASP Game Security](https://owasp.org/)
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [JWT Authentication](https://jwt.io/introduction)

### Implementation Examples
- [Node.js + Express API Template](https://github.com/hagopj13/node-express-boilerplate)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Supabase Auth + Database](https://supabase.com/docs)

---

## Decision Checklist

Before implementing, answer these questions:

- [ ] Will real money or valuable items be at stake?
- [ ] Do you need competitive leaderboards?
- [ ] Is preventing cheating critical to game integrity?
- [ ] Can you maintain backend infrastructure?
- [ ] Do you have budget for hosting costs?
- [ ] Do you have time for 4-6 weeks of development?

**If YES to any of the first 3:** Implement server-side validation
**If NO to all:** Current client-side implementation is fine

---

## Contact & Questions

When ready to implement, consider:
1. Authentication provider (Auth0, Firebase, Supabase)
2. Database choice (PostgreSQL, MongoDB, Supabase)
3. Hosting platform (Vercel, AWS, Railway)
4. Reward mechanism (crypto wallet, in-game currency, prizes)

**Document Last Updated:** 2025-10-18
