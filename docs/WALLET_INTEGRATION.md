# Wallet Integration Strategy

**Status:** 🔴 TODO - Required for reward distribution

---

## Recommended Approach

### Phase 1: Email Registration (NOW)
✅ **Collect email at game end**
- Required for account creation
- Used for notifications
- Allows delayed wallet connection
- Lower friction for new users

### Phase 2: Wallet Connection (LATER)
✅ **Optional at registration, required before claiming**
- User can add wallet in profile settings
- Must connect wallet to claim rewards
- Support multiple wallet providers

---

## Wallet Provider Options

### 1. MetaMask (MUST HAVE)
**Market Share:** ~80% of Web3 users
**Pros:**
- Most popular wallet
- Browser extension + mobile app
- Well-documented API
- Industry standard

**Cons:**
- Requires browser extension
- Desktop-focused

### 2. WalletConnect (MUST HAVE)
**Market Share:** Wide mobile coverage
**Pros:**
- Supports 170+ wallets
- Mobile-first (QR code scan)
- Works with Trust Wallet, Rainbow, Coinbase Wallet, etc.
- No browser extension needed

**Cons:**
- Requires QR code scan on desktop
- Extra step for users

### 3. Coinbase Wallet (RECOMMENDED)
**Market Share:** Growing, especially US users
**Pros:**
- Large user base
- Easy onboarding for crypto newcomers
- Built-in fiat on-ramp

**Cons:**
- Less decentralized
- US-centric

### 4. Rainbow, Argent, Trust Wallet (NICE TO HAVE)
**Market Share:** Smaller but dedicated users
**Pros:**
- Better UX than MetaMask
- Built-in DeFi features

**Cons:**
- Smaller user base
- WalletConnect covers these anyway

---

## Recommended Tech Stack

### Option A: RainbowKit (BEST FOR YOU)
**Why:** Battle-tested, beautiful UI, supports all wallets

```bash
npm install @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query
```

**Features:**
- ✅ MetaMask, WalletConnect, Coinbase Wallet built-in
- ✅ Beautiful pre-built UI
- ✅ Dark mode support
- ✅ Mobile responsive
- ✅ Maintained by top Web3 team

**Code Example:**
```typescript
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { metaMaskWallet, walletConnectWallet, coinbaseWallet } from '@rainbow-me/rainbowkit/wallets';

const connectors = connectorsForWallets([
  {
    groupName: 'Recommended',
    wallets: [metaMaskWallet, walletConnectWallet, coinbaseWallet],
  },
]);
```

### Option B: Web3Modal (ALTERNATIVE)
**Why:** Official WalletConnect solution

```bash
npm install @web3modal/wagmi wagmi viem
```

**Features:**
- ✅ Official WalletConnect library
- ✅ Supports all major wallets
- ✅ Simpler than RainbowKit
- ❌ Less customizable UI

### Option C: Manual Implementation (NOT RECOMMENDED)
Requires handling each wallet separately - too much work.

---

## Recommended UX Flow

### User Journey

```
Game Ends
   ↓
┌─────────────────────────────┐
│  🎮 Game Over!              │
│  Final Score: 12,450        │
│  Rewards Earned: 3.2 FLIP   │
└─────────────────────────────┘
   ↓
┌─────────────────────────────┐
│  📋 Save to Leaderboard?    │
│                             │
│  Name: [___________]        │
│  Email: [___________]       │
│                             │
│  ⚠️  Register to claim      │
│     your rewards later!     │
│                             │
│  [Skip]  [Register & Save]  │
└─────────────────────────────┘
   ↓
Registration Successful!
   ↓
┌─────────────────────────────┐
│  ✅ Score Saved!            │
│                             │
│  💰 Claim Your Rewards      │
│                             │
│  To receive 3.2 FLIP:       │
│  1. Connect wallet now, or  │
│  2. Add wallet in profile   │
│                             │
│  [Skip for Now]             │
│  [Connect Wallet]           │
└─────────────────────────────┘
   ↓
   ├─ Skip ──────────────────> Profile shows: "Add wallet to claim rewards"
   │
   └─ Connect Wallet
        ↓
   ┌─────────────────────────────┐
   │  🦊 Connect Wallet          │
   │                             │
   │  [MetaMask]                 │
   │  [WalletConnect]            │
   │  [Coinbase Wallet]          │
   │                             │
   │  Your wallet will receive:  │
   │  3.2 FLIP tokens            │
   └─────────────────────────────┘
        ↓
   ┌─────────────────────────────┐
   │  ✅ Wallet Connected!       │
   │  0x742d...4e23              │
   │                             │
   │  Rewards will be sent when  │
   │  you claim them in your     │
   │  profile.                   │
   │                             │
   │  [View Profile]             │
   │  [Play Again]               │
   └─────────────────────────────┘
```

---

## Data Structure

### User Profile
```typescript
interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  walletAddress?: string; // Optional until they connect
  walletProvider?: 'metamask' | 'walletconnect' | 'coinbase';
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PendingReward {
  rewardId: string;
  userId: string;
  gameId: string;
  amount: number;
  tokenSymbol: string; // 'FLIP', 'ETH', etc.
  status: 'pending' | 'claimed' | 'expired';
  earnedAt: number;
  claimedAt?: number;
  txHash?: string;
}
```

### Local Storage (For Now)
```typescript
interface LocalScoreboard {
  scores: ScoreEntry[];
  currentUser?: {
    email: string;
    displayName: string;
    walletAddress?: string;
  };
}

interface ScoreEntry {
  id: string;
  displayName: string;
  score: number;
  rewardAmount: number;
  timestamp: number;
  userEmail?: string; // Hidden from public leaderboard
}
```

---

## Security Considerations

### ✅ DO:
1. **Verify wallet ownership** via signature
2. **Store wallet address lowercase** (checksummed addresses can vary)
3. **Allow wallet updates** (users lose access to wallets)
4. **Expire unclaimed rewards** (30-90 days)
5. **Email verification** before allowing claims
6. **Rate limit** wallet connections
7. **Log all wallet changes** for audit trail

### ❌ DON'T:
1. **Never store private keys** (duh, but worth saying)
2. **Don't force wallet connection** at registration
3. **Don't trust client-side wallet verification** (verify on server)
4. **Don't allow multiple wallets per user** (fraud prevention)
5. **Don't send rewards immediately** (allow claim window)

---

## Wallet Verification Flow

### Signature-Based Verification
```typescript
// When user connects wallet
async function verifyWalletOwnership(address: string): Promise<boolean> {
  // 1. Generate random nonce
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // 2. Store nonce with timestamp (server-side)
  await storeNonce(address, nonce);
  
  // 3. Ask user to sign message
  const message = `Sign this message to verify wallet ownership.
  
Nonce: ${nonce}
Website: asteroids-game.com
Timestamp: ${Date.now()}`;
  
  // 4. User signs with wallet
  const signature = await ethereum.request({
    method: 'personal_sign',
    params: [message, address],
  });
  
  // 5. Verify signature on server
  const isValid = await verifySignature(address, message, signature, nonce);
  
  // 6. If valid, link wallet to account
  if (isValid) {
    await linkWalletToUser(userId, address);
  }
  
  return isValid;
}
```

---

## Smart Contract Integration

### Reward Distribution Contract
```solidity
// FLIP Token distribution contract
contract RewardDistributor {
    address public owner;
    IERC20 public rewardToken;
    
    mapping(address => uint256) public pendingRewards;
    mapping(address => bool) public hasClaimedRecently;
    
    event RewardsClaimed(address indexed user, uint256 amount);
    
    // Server calls this after validating game results
    function addPendingRewards(address user, uint256 amount) external onlyOwner {
        pendingRewards[user] += amount;
    }
    
    // User claims their rewards
    function claimRewards() external {
        require(pendingRewards[msg.sender] > 0, "No rewards");
        require(!hasClaimedRecently[msg.sender], "Claim cooldown");
        
        uint256 amount = pendingRewards[msg.sender];
        pendingRewards[msg.sender] = 0;
        hasClaimedRecently[msg.sender] = true;
        
        rewardToken.transfer(msg.sender, amount);
        
        emit RewardsClaimed(msg.sender, amount);
    }
}
```

---

## Implementation Phases

### Phase 1: Email Only (Week 1)
- [ ] Add registration modal at game end
- [ ] Collect email + display name
- [ ] Store in localStorage for now
- [ ] Show leaderboard with names
- [ ] Mention rewards require wallet (coming soon)

### Phase 2: Backend Integration (Week 2-3)
- [ ] Set up database
- [ ] Create user accounts API
- [ ] Store scores server-side
- [ ] Email verification flow
- [ ] Public leaderboard API

### Phase 3: Wallet Connection (Week 4)
- [ ] Install RainbowKit
- [ ] Add "Connect Wallet" in profile
- [ ] Implement signature verification
- [ ] Store wallet addresses
- [ ] Show pending rewards

### Phase 4: Reward Distribution (Week 5-6)
- [ ] Deploy smart contract
- [ ] Create claim rewards UI
- [ ] Implement withdrawal system
- [ ] Add transaction history
- [ ] Monitor for fraud

---

## Cost Estimates

### Initial Setup
- **RainbowKit**: Free (open source)
- **Smart Contract Deployment**: $50-500 (depends on gas fees)
- **Token Creation**: $100-1000 (audit + deployment)

### Ongoing Costs
- **Gas Fees per Claim**: $1-50 (depends on network, can use Layer 2)
- **Server Costs**: $20-100/month
- **Email Service**: $0-50/month (SendGrid, etc.)

### Optimization: Use Layer 2
- **Polygon**: ~$0.01 per transaction
- **Arbitrum**: ~$0.10 per transaction
- **Base**: ~$0.05 per transaction
- **Ethereum Mainnet**: $5-50 per transaction ❌ Too expensive

---

## Recommended Networks

### For Testing (Now)
1. **Sepolia Testnet** (Ethereum testnet)
2. **Mumbai** (Polygon testnet)
- Free test tokens
- Same as production

### For Production (Later)
1. **Polygon** (Recommended) - Cheap + Fast
2. **Base** (Alternative) - Coinbase's L2
3. **Arbitrum** (Alternative) - Popular L2

**DO NOT use Ethereum mainnet** - Gas fees will eat your budget

---

## FAQs

### Can users change their wallet later?
**Yes**, but:
- Require email verification
- Log all changes
- Consider cooldown period (24h)
- Check for suspicious patterns

### What if user loses wallet access?
**Options:**
1. Allow wallet updates with email verification
2. Provide recovery process (manual review)
3. Set expiration on unclaimed rewards (90 days)
4. Insurance fund for lost rewards

### Should we allow manual wallet entry or require connection?
**Require connection** - prevents typos and ensures ownership

### Multiple wallets per user?
**No** - fraud prevention. One wallet per account.

### Allow claiming rewards before email verification?
**No** - email verification is security gate

---

## Next Steps

1. **This Week**: Implement email registration + local leaderboard
2. **Next Week**: Set up backend + database
3. **Week 3**: Add RainbowKit + wallet connection
4. **Week 4**: Deploy smart contract to testnet
5. **Week 5**: Test end-to-end flow
6. **Week 6**: Launch to production

---

## Resources

- [RainbowKit Docs](https://www.rainbowkit.com/docs/introduction)
- [Wagmi Docs](https://wagmi.sh/)
- [WalletConnect](https://walletconnect.com/)
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

**Document Last Updated:** 2025-10-18
