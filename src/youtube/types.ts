// YouTube API Type Definitions

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: {
    url: string;
    width: number;
    height: number;
  };
  duration: string; // ISO 8601 duration format
  channelTitle: string;
  publishedAt: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  handle: string;
  thumbnail: string;
  url: string;
}

export interface YouTubePlaylist {
  videos: YouTubeVideo[];
  channel: YouTubeChannel;
  cachedAt: number;
}

export interface YouTubePlayerState {
  isPlaying: boolean;
  currentVideo: YouTubeVideo | null;
  volume: number;
  error: string | null;
}

export type MusicSource = 'local' | 'youtube' | 'mixed';

export interface MusicSettings {
  source: MusicSource;
  youtubeEnabled: boolean;
  customChannelUrl: string | null;
  localSongsOnly: boolean;
}

// YouTube IFrame Player API types
export interface YT {
  Player: new (elementId: string, config: YTPlayerConfig) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

export interface YTPlayerConfig {
  height?: string;
  width?: string;
  videoId: string;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    modestbranding?: 0 | 1;
    rel?: 0 | 1;
    showinfo?: 0 | 1;
  };
  events?: {
    onReady?: (event: YTEvent) => void;
    onStateChange?: (event: YTEvent) => void;
    onError?: (event: YTEvent) => void;
  };
}

export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  loadVideoById: (videoId: string) => void;
  getPlayerState: () => number;
  destroy: () => void;
}

export interface YTEvent {
  target: YTPlayer;
  data: number;
}

declare global {
  interface Window {
    YT: YT;
    onYouTubeIframeAPIReady: () => void;
  }
}
