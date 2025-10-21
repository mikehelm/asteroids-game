// YouTube IFrame Player API Wrapper

import type { YTPlayer, YouTubeVideo, YouTubePlayerState } from './types';

let playerInstance: YTPlayer | null = null;
let playerReady = false;
let apiLoaded = false;
let currentVideo: YouTubeVideo | null = null;

// Callbacks
let onStateChangeCallback: ((state: YouTubePlayerState) => void) | null = null;
let onEndCallback: (() => void) | null = null;
let onErrorCallback: ((error: string) => void) | null = null;

/**
 * Load the YouTube IFrame API script
 */
export function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (apiLoaded) {
      resolve();
      return;
    }
    
    // Check if already loading
    if (window.YT) {
      apiLoaded = true;
      resolve();
      return;
    }
    
    // Create script tag
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => reject(new Error('Failed to load YouTube API'));
    
    // Set up callback for when API is ready
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      resolve();
    };
    
    // Add to document
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!apiLoaded) {
        reject(new Error('YouTube API load timeout'));
      }
    }, 10000);
  });
}

/**
 * Initialize the YouTube player (hidden, audio-only)
 */
export async function initializeYouTubePlayer(containerId: string = 'youtube-player'): Promise<void> {
  try {
    await loadYouTubeAPI();
    
    if (playerInstance) {
      return; // Already initialized
    }
    
    // Create container if it doesn't exist
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.top = '-9999px'; // Hide off-screen
      container.style.left = '-9999px';
      container.style.width = '1px';
      container.style.height = '1px';
      document.body.appendChild(container);
    }
    
    return new Promise((resolve, reject) => {
      playerInstance = new window.YT.Player(containerId, {
        height: '1',
        width: '1',
        videoId: '', // Will be set when playing
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
        },
        events: {
          onReady: (event) => {
            playerReady = true;
            resolve();
          },
          onStateChange: (event) => {
            handleStateChange(event.data);
          },
          onError: (event) => {
            const errorMessage = getErrorMessage(event.data);
            console.error('YouTube player error:', errorMessage);
            if (onErrorCallback) {
              onErrorCallback(errorMessage);
            }
          },
        },
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!playerReady) {
          reject(new Error('Player initialization timeout'));
        }
      }, 10000);
    });
  } catch (error) {
    console.error('Error initializing YouTube player:', error);
    throw error;
  }
}

/**
 * Handle player state changes
 */
function handleStateChange(state: number): void {
  if (!onStateChangeCallback) return;
  
  const playerState: YouTubePlayerState = {
    isPlaying: state === window.YT.PlayerState.PLAYING,
    currentVideo,
    volume: playerInstance?.getVolume() || 0,
    error: null,
  };
  
  onStateChangeCallback(playerState);
  
  // Handle video end
  if (state === window.YT.PlayerState.ENDED && onEndCallback) {
    onEndCallback();
  }
}

/**
 * Get error message from error code
 */
function getErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case 2:
      return 'Invalid video ID';
    case 5:
      return 'HTML5 player error';
    case 100:
      return 'Video not found or private';
    case 101:
    case 150:
      return 'Video cannot be embedded';
    default:
      return `Unknown error (${errorCode})`;
  }
}

/**
 * Play a YouTube video
 */
export async function playYouTubeVideo(video: YouTubeVideo): Promise<void> {
  if (!playerReady || !playerInstance) {
    throw new Error('Player not ready');
  }
  
  currentVideo = video;
  playerInstance.loadVideoById(video.id);
  playerInstance.playVideo();
}

/**
 * Pause the current video
 */
export function pauseYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.pauseVideo();
  }
}

/**
 * Resume playback
 */
export function resumeYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.playVideo();
  }
}

/**
 * Stop the current video
 */
export function stopYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.stopVideo();
    currentVideo = null;
  }
}

/**
 * Set player volume (0-100)
 */
export function setYouTubeVolume(volume: number): void {
  if (playerInstance) {
    playerInstance.setVolume(Math.max(0, Math.min(100, volume)));
  }
}

/**
 * Mute the player
 */
export function muteYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.mute();
  }
}

/**
 * Unmute the player
 */
export function unmuteYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.unMute();
  }
}

/**
 * Check if player is muted
 */
export function isYouTubeMuted(): boolean {
  return playerInstance?.isMuted() || false;
}

/**
 * Get current player state
 */
export function getYouTubePlayerState(): number {
  return playerInstance?.getPlayerState() || -1;
}

/**
 * Check if a video is currently playing
 */
export function isYouTubePlaying(): boolean {
  return getYouTubePlayerState() === window.YT?.PlayerState.PLAYING;
}

/**
 * Get the currently playing video
 */
export function getCurrentVideo(): YouTubeVideo | null {
  return currentVideo;
}

/**
 * Set callback for state changes
 */
export function onYouTubeStateChange(callback: (state: YouTubePlayerState) => void): void {
  onStateChangeCallback = callback;
}

/**
 * Set callback for when video ends
 */
export function onYouTubeVideoEnd(callback: () => void): void {
  onEndCallback = callback;
}

/**
 * Set callback for errors
 */
export function onYouTubeError(callback: (error: string) => void): void {
  onErrorCallback = callback;
}

/**
 * Destroy the player instance
 */
export function destroyYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.destroy();
    playerInstance = null;
    playerReady = false;
    currentVideo = null;
  }
}

/**
 * Check if player is ready
 */
export function isPlayerReady(): boolean {
  return playerReady;
}
