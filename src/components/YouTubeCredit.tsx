import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { YouTubeVideo, YouTubeChannel } from '../youtube/types';
import { YOUTUBE_CONFIG } from '../config/youtube';

interface YouTubeCreditProps {
  video: YouTubeVideo | null;
  channel: YouTubeChannel | null;
  isPlaying: boolean;
}

export function YouTubeCredit({ video, channel, isPlaying }: YouTubeCreditProps) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!isPlaying || !video || !channel) {
      // Fade out
      setOpacity(0);
      const timer = setTimeout(() => setVisible(false), YOUTUBE_CONFIG.CREDIT_FADE_OUT);
      return () => clearTimeout(timer);
    }

    // New video started - show credit
    setVisible(true);
    
    // Fade in
    const fadeInTimer = setTimeout(() => setOpacity(1), 50);
    
    // Hold, then fade out
    const hideTimer = setTimeout(() => {
      setOpacity(0);
      setTimeout(() => setVisible(false), YOUTUBE_CONFIG.CREDIT_FADE_OUT);
    }, YOUTUBE_CONFIG.CREDIT_DISPLAY_DURATION);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(hideTimer);
    };
  }, [video, isPlaying, channel]);

  // Don't render if missing required data
  if (!video || !channel) {
    return null;
  }

  // Don't render DOM element if not visible
  if (!visible) {
    return null;
  }

  const handleClick = () => {
    window.open(channel.url, '_blank', 'noopener,noreferrer');
  };

  return createPortal(
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.85)',
        border: '2px solid #ff0000',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '280px',
        cursor: 'pointer',
        opacity,
        transition: `opacity ${opacity === 0 ? YOUTUBE_CONFIG.CREDIT_FADE_OUT : YOUTUBE_CONFIG.CREDIT_FADE_IN}ms ease-in-out`,
        zIndex: 10000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Video Thumbnail */}
      <img
        src={video.thumbnail.url}
        alt={video.title}
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: '4px',
          display: 'block',
        }}
      />
      
      {/* Video Title */}
      <div
        style={{
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: '600',
          textAlign: 'center',
          lineHeight: '1.3',
          maxHeight: '36px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {video.title}
      </div>
      
      {/* Channel Credit */}
      <div
        style={{
          color: '#aaaaaa',
          fontSize: '11px',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>♫</span>
        <span>Now Playing from</span>
        <span style={{ color: '#ff0000', fontWeight: '600' }}>{channel.handle}</span>
      </div>
      
      {/* Click indicator */}
      <div
        style={{
          color: '#666666',
          fontSize: '9px',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Click to visit channel
      </div>
    </div>,
    document.body
  );
}
