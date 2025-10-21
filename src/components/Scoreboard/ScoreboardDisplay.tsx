import React, { useEffect, useState, useRef } from 'react';
import { getScores, getCurrentUser, getUserRank, getLifetimeTickets, getCurrentGameTickets } from './storage';
import { ScoreEntry } from './types';
import { getTopScores } from './storage';

interface ScoreboardDisplayProps {
  onClose: () => void;
  targetScoreId?: string;
}
export const ScoreboardDisplay: React.FC<ScoreboardDisplayProps> = ({ onClose, targetScoreId }) => {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const currentUser = getCurrentUser();
  const userRank = currentUser ? getUserRank(currentUser.email) : null;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);

  useEffect(() => {
    // Load all stored scores so we can find and scroll to the target entry
    const all = getScores();
    setScores(all);
  }, []);

  // Smart scroll animation based on user's rank
  useEffect(() => {
    if (scores.length === 0 || !listRef.current || !targetScoreId) return;
    
    const scrollContainer = listRef.current;
    const targetIndex = scores.findIndex(s => s.id === targetScoreId);
    if (targetIndex === -1) return;
    
    const targetRank = targetIndex + 1;
    const isTopFive = targetRank <= 5;
    const entryHeight = 80; // approximate height per entry
    
    // Disable smooth scrolling for custom animation
    scrollContainer.style.scrollBehavior = 'auto';
    
    if (isTopFive) {
      // Top 5: Start at position 20 and scroll UP to top
      const startPosition = Math.min(entryHeight * 20, scrollContainer.scrollHeight);
      scrollContainer.scrollTop = startPosition;
      
      // Show fireworks!
      setShowFireworks(true);
      
      // Scroll to top with ease-out
      setTimeout(() => {
        const startTime = performance.now();
        const duration = 2000; // 2 seconds for dramatic effect
        
        const easeOutQuad = (t: number): number => {
          return 1 - (1 - t) * (1 - t);
        };
        
        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easeOutQuad(progress);
          
          scrollContainer.scrollTop = startPosition * (1 - easedProgress);
          
          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          } else {
            scrollContainer.style.scrollBehavior = 'smooth';
          }
        };
        
        requestAnimationFrame(animateScroll);
      }, 300);
    } else {
      // Not top 5: Start at TOP and scroll DOWN to their score (centered)
      scrollContainer.scrollTop = 0;
      
      setTimeout(() => {
        // Calculate target position to center the user's score
        const targetElement = scrollContainer.querySelector(`[data-score-id="${targetScoreId}"]`);
        if (!targetElement) return;
        
        const containerHeight = scrollContainer.clientHeight;
        const elementTop = (targetElement as HTMLElement).offsetTop;
        const elementHeight = (targetElement as HTMLElement).offsetHeight;
        
        // Center the element
        const targetScrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);
        const scrollDistance = Math.max(0, targetScrollPosition);
        
        // Calculate duration based on distance (speed up if needed, max 4 seconds)
        const maxDuration = 4000; // 4 seconds max
        const minDuration = 1500; // 1.5 seconds min
        const duration = Math.min(maxDuration, Math.max(minDuration, scrollDistance * 2));
        
        const startTime = performance.now();
        
        const easeOutCubic = (t: number): number => {
          return 1 - Math.pow(1 - t, 3);
        };
        
        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easeOutCubic(progress);
          
          scrollContainer.scrollTop = scrollDistance * easedProgress;
          
          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          } else {
            scrollContainer.style.scrollBehavior = 'smooth';
          }
        };
        
        requestAnimationFrame(animateScroll);
      }, 300);
    }
  }, [scores, targetScoreId]);

  // Removed old auto-scroll logic (replaced with smart scroll above)

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getMedalEmoji = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
      {/* Fireworks for top 5 */}
      {showFireworks && (
        <div className="absolute inset-0 pointer-events-none z-40">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-4 h-4 rounded-full animate-ping"
              style={{
                top: `${10 + Math.random() * 80}%`,
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1.5 + Math.random()}s`,
                backgroundColor: ['#fbbf24', '#22d3ee', '#a855f7', '#f472b6', '#10b981'][Math.floor(Math.random() * 5)],
              }}
            />
          ))}
        </div>
      )}
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white mb-1">🏆 Leaderboard</h2>
              <p className="text-cyan-100 text-sm">Top 10 Scores</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-cyan-200 text-3xl font-bold leading-none transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scores List - Now includes User Stats Box at top */}
        <div className="flex-1 overflow-y-auto p-6" ref={listRef}>
          {/* User Stats Box - Scrolls with content */}
          {currentUser && (
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-cyan-500 rounded-xl p-5 relative overflow-hidden mb-6 shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-2xl">
                      👤
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-bold text-lg truncate">{currentUser.displayName}</h3>
                      <p className="text-gray-400 text-xs truncate">{currentUser.email}</p>
                    </div>
                  </div>
                  {userRank && (
                    <div className="text-center flex-shrink-0">
                      <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                        #{userRank}
                      </div>
                      <div className="text-xs text-gray-400">Rank</div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* Total Tickets Won */}
                  <div className="bg-gray-900/50 rounded-lg p-3 border border-yellow-500/30">
                    <div className="text-2xl mb-1">🎟️</div>
                    <div className="text-xl font-bold text-yellow-400 truncate">
                      {Math.floor(scores
                        .filter(s => s.userEmail === currentUser.email)
                        .reduce((total, s) => total + (s.rewardAmount || 0), 0))}
                    </div>
                    <div className="text-xs text-gray-400">Total Won</div>
                  </div>

                  {/* Best Score */}
                  <div className="bg-gray-900/50 rounded-lg p-3 border border-cyan-500/30">
                    <div className="text-2xl mb-1">🏆</div>
                    <div className="text-xl font-bold text-cyan-400 truncate">
                      {scores.find(s => s.userEmail === currentUser.email)?.score.toLocaleString() || '0'}
                    </div>
                    <div className="text-xs text-gray-400">Best</div>
                  </div>

                  {/* Total Games */}
                  <div className="bg-gray-900/50 rounded-lg p-3 border border-purple-500/30">
                    <div className="text-2xl mb-1">🎮</div>
                    <div className="text-xl font-bold text-purple-400 truncate">
                      {scores.filter(s => s.userEmail === currentUser.email).length}
                    </div>
                    <div className="text-xs text-gray-400">Games</div>
                  </div>
                </div>

                {getCurrentGameTickets() > 0 && (
                  <div className="mt-3 bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2.5 flex items-center gap-2">
                    <div className="text-xl flex-shrink-0">🎉</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-yellow-200 font-semibold text-sm">
                        +{getCurrentGameTickets()} tickets this session!
                      </p>
                      <p className="text-yellow-300/70 text-xs">Keep playing to earn more</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User's Rank Banner (if not in top 10) */}
          {currentUser && userRank && userRank > 10 && (
            <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg px-4 py-2.5 mb-4">
              <p className="text-yellow-200 text-sm">
                <span className="font-bold">Your Rank: #{userRank}</span>
                {' • '}Keep playing to reach the top 10!
              </p>
            </div>
          )}
          {scores.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No scores yet</p>
              <p className="text-gray-500 text-sm mt-2">Be the first to set a high score!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scores.map((entry, index) => {
                const rank = index + 1;
                const isCurrentUser = currentUser?.email === entry.userEmail;
                const isTarget = targetScoreId && entry.id === targetScoreId;
                const isTopFive = rank <= 5;

                return (
                  <div
                    key={entry.id}
                    data-score-id={entry.id}
                    className={`
                      flex items-center gap-4 p-4 rounded-lg transition-colors relative
                      ${isTarget
                        ? 'bg-gradient-to-r from-orange-900/40 to-yellow-900/40 border-2 border-yellow-400 shadow-lg shadow-yellow-500/50' 
                        : isCurrentUser 
                          ? 'bg-cyan-900 bg-opacity-40 border-2 border-cyan-400'
                          : isTopFive
                            ? 'bg-gray-800 border-2 border-yellow-500/50'
                            : 'bg-gray-800 border border-gray-700 hover:bg-gray-750'
                      }
                    `}
                  >
                    {/* Gold box for top 5 */}
                    {isTopFive && (
                      <div className="absolute inset-0 border-2 border-yellow-500 rounded-lg pointer-events-none"></div>
                    )}
                    {/* Rank */}
                    <div className="flex-shrink-0 w-12 text-center">
                      <div className="text-2xl">
                        {getMedalEmoji(rank)}
                      </div>
                      <div className={`
                        text-sm font-bold
                        ${rank === 1 ? 'text-yellow-400' : 
                          rank === 2 ? 'text-gray-300' : 
                          rank === 3 ? 'text-orange-400' : 
                          'text-gray-400'}
                      `}>
                        #{rank}
                      </div>
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-bold text-lg truncate">
                          {entry.displayName}
                        </p>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 bg-cyan-500 text-black text-xs font-bold rounded">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        <span>Stage {entry.stage}</span>
                        <span>•</span>
                        <span>{formatDate(entry.timestamp)}</span>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-2xl font-bold text-cyan-400">
                        {entry.score.toLocaleString()}
                      </div>
                      {entry.rewardAmount > 0 && (
                        <div className="text-xs text-yellow-400">
                          🎟️ {Math.floor(entry.rewardAmount)} Tickets
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 bg-gray-850">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
