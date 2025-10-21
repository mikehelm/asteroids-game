import React from 'react';

interface GameStatsProps {
  stats: {
    score: number;
    stage: number;
    asteroidsDestroyed: number;
    ufosDestroyed: number;
    shotsFired: number;
    shotsHit: number;
    maxCombo: number;
    survivalTime: number;
  };
  onClose: () => void;
}

export const GameStats: React.FC<GameStatsProps> = ({ stats, onClose }) => {
  const accuracy = stats.shotsFired > 0 
    ? ((stats.shotsHit / stats.shotsFired) * 100).toFixed(1)
    : '0.0';
  
  const minutes = Math.floor(stats.survivalTime / 60000);
  const seconds = Math.floor((stats.survivalTime % 60000) / 1000);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#1a1a2e',
        border: '3px solid #00ff88',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)',
      }}>
        <h2 style={{
          color: '#00ff88',
          textAlign: 'center',
          marginTop: 0,
          marginBottom: '30px',
          fontSize: '36px',
          textShadow: '0 0 10px rgba(0, 255, 136, 0.8)',
        }}>
          GAME OVER
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          marginBottom: '30px',
        }}>
          <StatItem label="Final Score" value={stats.score.toLocaleString()} highlight />
          <StatItem label="Stage Reached" value={stats.stage.toString()} highlight />
          <StatItem label="Asteroids" value={stats.asteroidsDestroyed.toString()} />
          <StatItem label="UFOs" value={stats.ufosDestroyed.toString()} />
          <StatItem label="Accuracy" value={`${accuracy}%`} />
          <StatItem label="Max Combo" value={`${stats.maxCombo}x`} />
          <StatItem label="Survival Time" value={timeString} colSpan />
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '15px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#1a1a2e',
            backgroundColor: '#00ff88',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.3s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#00dd77';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#00ff88';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
};

interface StatItemProps {
  label: string;
  value: string;
  highlight?: boolean;
  colSpan?: boolean;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, highlight, colSpan }) => (
  <div style={{
    gridColumn: colSpan ? '1 / -1' : 'auto',
    textAlign: 'center',
  }}>
    <div style={{
      color: '#888',
      fontSize: '14px',
      marginBottom: '5px',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    }}>
      {label}
    </div>
    <div style={{
      color: highlight ? '#00ff88' : '#fff',
      fontSize: highlight ? '28px' : '24px',
      fontWeight: 'bold',
      textShadow: highlight ? '0 0 8px rgba(0, 255, 136, 0.6)' : 'none',
    }}>
      {value}
    </div>
  </div>
);
