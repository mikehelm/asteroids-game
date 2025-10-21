import React, { useEffect, useState, useRef } from 'react';
import { incrementCurrentGameTickets, addTicketToLifetime } from './Scoreboard/storage';

interface TicketRandomizerProps {
  flipitPercent: number;
  onComplete: () => void;
  stage: number;
}

export const TicketRandomizer: React.FC<TicketRandomizerProps> = ({
  flipitPercent,
  onComplete,
  stage,
}) => {
  const [phase, setPhase] = useState<'spinning' | 'result' | 'flying'>('spinning');
  const [displayNumber, setDisplayNumber] = useState(50);
  const [finalNumber, setFinalNumber] = useState(0);
  const [isWinner, setIsWinner] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate final random number (1-100)
    const final = Math.floor(Math.random() * 100) + 1;
    setFinalNumber(final);
    const winner = final <= flipitPercent;
    setIsWinner(winner);

    // Spinning phase: 4 seconds total
    const spinInterval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 100) + 1);
    }, 50);

    // Slow down animation progressively
    const slowDown1 = setTimeout(() => {
      clearInterval(spinInterval);
      const slowInterval = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 100) + 1);
      }, 100);

      const slowDown2 = setTimeout(() => {
        clearInterval(slowInterval);
        const verySlow = setInterval(() => {
          setDisplayNumber(Math.floor(Math.random() * 100) + 1);
        }, 200);

        const finalStop = setTimeout(() => {
          clearInterval(verySlow);
          setDisplayNumber(final);
          setPhase('result');

          if (winner) {
            setShowFireworks(true);
            // Play win sound
            try {
              const audio = new Audio();
              audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiO1vLQfzEGHGq/7+OZUA0IUaro9L';
              audio.volume = 0.3;
              audio.play().catch(() => {});
            } catch {}
          } else {
            // Play loss sound
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);
              oscillator.frequency.value = 200;
              gainNode.gain.value = 0.2;
              oscillator.start();
              oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.5);
              gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
              setTimeout(() => oscillator.stop(), 500);
            } catch {}
          }

          // Wait for user input instead of auto-continuing
          setTimeout(() => {
            setWaitingForInput(true);
          }, 500);
        }, 800);

        return () => clearTimeout(finalStop);
      }, 1500);

      return () => clearTimeout(slowDown2);
    }, 2000);

    return () => {
      clearInterval(spinInterval);
      clearTimeout(slowDown1);
    };
  }, [flipitPercent]);

  // Handle user input to continue
  useEffect(() => {
    if (!waitingForInput) return;

    const handleContinue = () => {
      setWaitingForInput(false);
      if (isWinner) {
        incrementCurrentGameTickets();
        addTicketToLifetime();
        setPhase('flying');
        setTimeout(onComplete, 2000);
      } else {
        onComplete();
      }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handleContinue();
      }
    };

    const handleClick = () => {
      handleContinue();
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('click', handleClick);
    };
  }, [waitingForInput, isWinner, onComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
    >
      {/* Fireworks */}
      {showFireworks && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full animate-ping"
              style={{
                top: `${20 + Math.random() * 60}%`,
                left: `${20 + Math.random() * 60}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: '1.5s',
                backgroundColor: ['#fbbf24', '#22d3ee', '#a855f7', '#f472b6'][Math.floor(Math.random() * 4)],
              }}
            />
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="bg-gray-900 border-4 border-cyan-400 rounded-2xl p-12 max-w-lg w-full mx-4 shadow-2xl relative overflow-hidden">
        {/* Animated Background */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: phase === 'result' 
              ? isWinner 
                ? 'radial-gradient(circle, #4ade80 0%, transparent 70%)'
                : 'radial-gradient(circle, #f87171 0%, transparent 70%)'
              : 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
          }}
        />
        
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-center text-white mb-8 animate-pulse">
            🏆 LEVEL {stage} COMPLETE! 🏆
          </h2>

          {/* Randomizer Display */}
          <div className="relative mb-8">
            <div
              className={`text-9xl font-bold text-center mb-4 transition-all duration-500 ${
                phase === 'spinning' ? 'text-cyan-400' : 
                isWinner ? 'text-green-400 animate-bounce' : 'text-red-400'
              }`}
              style={{
                textShadow: phase === 'result' 
                  ? isWinner 
                    ? '0 0 30px rgba(74, 222, 128, 0.8), 0 0 60px rgba(74, 222, 128, 0.5)' 
                    : '0 0 30px rgba(248, 113, 113, 0.8)'
                  : '0 0 20px rgba(34, 211, 238, 0.6)',
                fontFamily: 'monospace',
                transform: phase === 'result' ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              {displayNumber}
            </div>

            {/* Chance Display */}
            <div className="text-2xl text-center font-bold mb-2"
              style={{
                color: flipitPercent >= 75 ? '#4ade80' : flipitPercent >= 50 ? '#fbbf24' : '#f87171',
              }}
            >
              Chance: {flipitPercent.toFixed(1)}%
            </div>
            
            {phase === 'spinning' && (
              <div className="text-center space-y-1">
                <div className="text-yellow-300 text-xl font-bold animate-pulse">
                  Roll UNDER {flipitPercent.toFixed(1)}% to WIN!
                </div>
                <div className="text-gray-400 text-sm">
                  Rolling for your ticket...
                </div>
              </div>
            )}
          </div>

          {/* Result Message */}
          {phase !== 'spinning' && (
            <div className="text-center animate-fadeIn">
              {isWinner ? (
                <div className="space-y-4">
                  <div className="text-5xl font-bold text-green-400 animate-bounce">
                    🎉 WINNER! 🎉
                  </div>
                  <div className="text-7xl">🎟️</div>
                  <p className="text-white text-2xl font-bold">You earned a ticket!</p>
                  <p className="text-green-300 text-sm">Every ticket = chance to win big prizes!</p>
                  {waitingForInput && (
                    <p className="text-cyan-300 text-lg mt-6 animate-pulse">
                      Press SPACE or CLICK to continue
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Show "Oh, so close!" if within 5 points of winning */}
                  {finalNumber - flipitPercent <= 5 ? (
                    <div className="text-5xl font-bold text-orange-400">😮 Oh, so close!</div>
                  ) : (
                    <div className="text-5xl font-bold text-red-400">😞 Better Luck Next Time</div>
                  )}
                  <p className="text-gray-400 text-lg">Scan more asteroids to increase your chances!</p>
                  <p className="text-yellow-400 text-sm">Higher scan % = Better odds</p>
                  {waitingForInput && (
                    <p className="text-cyan-300 text-lg mt-6 animate-pulse">
                      Press SPACE or CLICK to continue
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Flying Ticket Animation */}
          {phase === 'flying' && (
            <div
              ref={ticketRef}
              className="fixed text-7xl"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'flyToTopLeft 2s cubic-bezier(0.4, 0.0, 0.2, 1) forwards',
              }}
            >
              🎟️
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes flyToTopLeft {
          0% {
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.3) rotate(180deg);
          }
          100% {
            top: 60px;
            left: 60px;
            transform: translate(0, 0) scale(0.4) rotate(720deg);
            opacity: 0.9;
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
};
