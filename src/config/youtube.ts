// YouTube API Configuration
// For security, you should store this in .env.local as:
// REACT_APP_YOUTUBE_API_KEY=AIzaSyAv_DeMSHVbab_6j169s2kcODNUoPOY7H8

export const YOUTUBE_CONFIG = {
  // API Key - will try to read from env first, fallback to hardcoded
  API_KEY: import.meta.env.VITE_YOUTUBE_API_KEY || 'AIzaSyAv_DeMSHVbab_6j169s2kcODNUoPOY7H8',
  
  // Default channel (hard-coded to skip expensive search.list call)
  DEFAULT_CHANNEL_ID: 'UCt_lGH5zsSU2JRFnWUnV_Lg', // @OutlawAlgorithm
  DEFAULT_CHANNEL_HANDLE: '@OutlawAlgorithm',
  DEFAULT_CHANNEL_URL: 'https://www.youtube.com/@OutlawAlgorithm',
  
  // Music selection weights
  YOUTUBE_PLAY_CHANCE: 0.10, // 10% chance for YouTube after first song
  
  // Display settings
  CREDIT_DISPLAY_DURATION: 5000, // 5 seconds
  CREDIT_FADE_IN: 500, // 0.5 seconds
  CREDIT_FADE_OUT: 1000, // 1 second
  
  // API Settings
  MAX_RESULTS: 50, // Fetch up to 50 videos from channel
  CACHE_DURATION: 86400000, // Cache playlist for 24 hours (in ms)
};

// Known channel IDs (hard-coded to skip expensive search.list call - 100 units saved!)
// Add more channels here as you discover them
export const KNOWN_CHANNEL_IDS: Record<string, string> = {
  '@OutlawAlgorithm': 'UCt_lGH5zsSU2JRFnWUnV_Lg',
  'OutlawAlgorithm': 'UCt_lGH5zsSU2JRFnWUnV_Lg',
  // Add more: '@ChannelName': 'UCxxxxxxxxxxxxx',
};

// Helper to validate if a URL is a YouTube channel
export function isValidYouTubeChannel(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/@[\w-]+$/,
    /^https?:\/\/(www\.)?youtube\.com\/channel\/[\w-]+$/,
    /^https?:\/\/(www\.)?youtube\.com\/c\/[\w-]+$/,
  ];
  return patterns.some(pattern => pattern.test(url));
}

// Extract channel handle or ID from URL
export function extractChannelIdentifier(url: string): string | null {
  const handleMatch = url.match(/\/@([\w-]+)/);
  if (handleMatch) return '@' + handleMatch[1];
  
  const channelMatch = url.match(/\/channel\/([\w-]+)/);
  if (channelMatch) return channelMatch[1];
  
  const cMatch = url.match(/\/c\/([\w-]+)/);
  if (cMatch) return cMatch[1];
  
  return null;
}
