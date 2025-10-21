// YouTube Data API v3 Integration

import { YOUTUBE_CONFIG, KNOWN_CHANNEL_IDS, extractChannelIdentifier } from '../config/youtube';
import type { YouTubeVideo, YouTubeChannel, YouTubePlaylist } from './types';
import { quotaTracker } from './quotaTracker';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const PLAYLIST_CACHE_KEY = 'youtube_playlist_cache';

// In-memory cache for channel data
let cachedPlaylist: YouTubePlaylist | null = null;

// Pending requests to prevent duplicate calls
const pendingRequests = new Map<string, Promise<YouTubePlaylist | null>>();

/**
 * Get channel ID from hard-coded map or fall back to API search
 * This saves 100 quota units for known channels!
 */
async function getChannelIdFromHandle(handle: string): Promise<string | null> {
  // If it's a URL, extract the channel identifier first
  let searchHandle = handle;
  if (handle.startsWith('http://') || handle.startsWith('https://')) {
    const extracted = extractChannelIdentifier(handle);
    if (extracted) {
      searchHandle = extracted;
      console.log(`📝 Extracted handle from URL: ${searchHandle}`);
    } else {
      console.error('❌ Could not extract channel identifier from URL:', handle);
      return null;
    }
  }
  
  const cleanHandle = searchHandle.startsWith('@') ? searchHandle.slice(1) : searchHandle;
  const handleWithAt = searchHandle.startsWith('@') ? searchHandle : `@${searchHandle}`;
  
  // Check hard-coded map first (saves 100 units!)
  if (KNOWN_CHANNEL_IDS[handleWithAt]) {
    console.log(`✅ Using hard-coded channel ID for ${handleWithAt} (saved 100 quota units!)`);
    return KNOWN_CHANNEL_IDS[handleWithAt];
  }
  if (KNOWN_CHANNEL_IDS[cleanHandle]) {
    console.log(`✅ Using hard-coded channel ID for ${cleanHandle} (saved 100 quota units!)`);
    return KNOWN_CHANNEL_IDS[cleanHandle];
  }
  
  // Fall back to expensive API search (100 units)
  console.warn(`⚠️ Channel not in hard-coded map. Calling expensive search.list API (100 units)...`);
  try {
    const url = `${API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(cleanHandle)}&key=${YOUTUBE_CONFIG.API_KEY}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': window.location.origin + window.location.pathname
      }
    });
    
    // Track quota usage
    quotaTracker.logCall('search.list', response.ok);
    
    if (!response.ok) {
      if (response.status === 403) {
        console.error('🚫 403 Forbidden - Check your API key setup:');
        console.error('   1. Is YouTube Data API v3 enabled in Google Cloud Console?');
        console.error('   2. Is your API key valid and in .env.local as VITE_YOUTUBE_API_KEY?');
        console.error('   3. Are HTTP referrer restrictions properly set (allow localhost)?');
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const channelId = data.items[0].snippet.channelId;
      console.log(`💡 Found channel ID: ${channelId}. Consider adding to KNOWN_CHANNEL_IDS map!`);
      return channelId;
    }
    return null;
  } catch (error) {
    quotaTracker.logCall('search.list', false, String(error));
    console.error('Error fetching channel ID:', error);
    return null;
  }
}

/**
 * Fetch channel details
 */
async function getChannelDetails(channelId: string): Promise<YouTubeChannel | null> {
  try {
    const url = `${API_BASE}/channels?part=snippet&id=${channelId}&key=${YOUTUBE_CONFIG.API_KEY}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': window.location.origin + window.location.pathname
      }
    });
    
    // Track quota usage
    quotaTracker.logCall('channels.list', response.ok);
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const channel = data.items[0];
      return {
        id: channel.id,
        title: channel.snippet.title,
        handle: channel.snippet.customUrl || `@${channel.snippet.title}`,
        thumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.default.url,
        url: `https://www.youtube.com/channel/${channel.id}`,
      };
    }
    return null;
  } catch (error) {
    quotaTracker.logCall('channels.list', false, String(error));
    console.error('Error fetching channel details:', error);
    return null;
  }
}

/**
 * Fetch videos from a channel, filtering for music content
 */
async function getChannelVideos(channelId: string): Promise<YouTubeVideo[]> {
  try {
    // First, get the uploads playlist ID
    const channelUrl = `${API_BASE}/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_CONFIG.API_KEY}`;
    const channelResponse = await fetch(channelUrl);
    
    // Track quota usage
    quotaTracker.logCall('channels.list', channelResponse.ok);
    
    if (!channelResponse.ok) throw new Error(`API error: ${channelResponse.status}`);
    
    const channelData = await channelResponse.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    
    if (!uploadsPlaylistId) {
      throw new Error('Could not find uploads playlist');
    }
    
    // Fetch videos from uploads playlist
    const playlistUrl = `${API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${YOUTUBE_CONFIG.MAX_RESULTS}&key=${YOUTUBE_CONFIG.API_KEY}`;
    const playlistResponse = await fetch(playlistUrl);
    
    // Track quota usage
    quotaTracker.logCall('playlistItems.list', playlistResponse.ok);
    
    if (!playlistResponse.ok) throw new Error(`API error: ${playlistResponse.status}`);
    
    const playlistData = await playlistResponse.json();
    
    // Get video IDs to fetch durations
    const videoIds = playlistData.items.map((item: any) => item.snippet.resourceId.videoId).join(',');
    
    // Fetch video details including duration
    const videosUrl = `${API_BASE}/videos?part=snippet,contentDetails&id=${videoIds}&key=${YOUTUBE_CONFIG.API_KEY}`;
    const videosResponse = await fetch(videosUrl);
    
    // Track quota usage
    quotaTracker.logCall('videos.list', videosResponse.ok);
    
    if (!videosResponse.ok) throw new Error(`API error: ${videosResponse.status}`);
    
    const videosData = await videosResponse.json();
    
    console.log(`📹 Found ${videosData.items.length} total videos, filtering...`);
    
    // Filter and map to our format
    const videos: YouTubeVideo[] = videosData.items
      .filter((video: any) => {
        // Filter out shorts (< 30 seconds) and extremely long videos (> 1 hour)
        const duration = parseISO8601Duration(video.contentDetails.duration);
        const isValidDuration = duration >= 30 && duration <= 3600;
        if (!isValidDuration) {
          console.log(`Filtered out: "${video.snippet.title}" (${Math.floor(duration / 60)}m ${duration % 60}s)`);
        }
        return isValidDuration;
      })
      .map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        thumbnail: {
          url: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default.url,
          width: video.snippet.thumbnails.high?.width || 480,
          height: video.snippet.thumbnails.high?.height || 360,
        },
        duration: video.contentDetails.duration,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
      }));
    
    return videos;
  } catch (error) {
    // Error was already logged in the specific fetch that failed
    console.error('Error fetching channel videos:', error);
    return [];
  }
}

/**
 * Parse ISO 8601 duration (e.g., "PT3M45S") to seconds
 */
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Load playlist from localStorage cache
 */
function loadPlaylistFromStorage(): YouTubePlaylist | null {
  try {
    const stored = localStorage.getItem(PLAYLIST_CACHE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as YouTubePlaylist;
    
    // Check if cache is still valid
    if (Date.now() - parsed.cachedAt < YOUTUBE_CONFIG.CACHE_DURATION) {
      console.log(`✅ Loaded playlist from localStorage cache (${parsed.videos.length} videos)`);
      return parsed;
    }
    
    // Cache expired
    console.log('⏱️ localStorage cache expired');
    return null;
  } catch (error) {
    console.error('Error loading playlist from storage:', error);
    return null;
  }
}

/**
 * Save playlist to localStorage cache
 */
function savePlaylistToStorage(playlist: YouTubePlaylist): void {
  try {
    localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(playlist));
    console.log('💾 Saved playlist to localStorage cache');
  } catch (error) {
    console.error('Error saving playlist to storage:', error);
  }
}

/**
 * Fetch and cache playlist from channel
 * Uses multi-level caching: memory → localStorage → API
 */
export async function fetchYouTubePlaylist(channelHandleOrUrl?: string, forceRefresh = false): Promise<YouTubePlaylist | null> {
  try {
    const handle = channelHandleOrUrl || YOUTUBE_CONFIG.DEFAULT_CHANNEL_HANDLE;
    
    // Check if request is already pending (prevent duplicate calls)
    if (pendingRequests.has(handle)) {
      console.log('⏳ Reusing pending request for:', handle);
      return pendingRequests.get(handle)!;
    }
    
    // Check memory cache (unless forcing refresh)
    if (!forceRefresh && cachedPlaylist && Date.now() - cachedPlaylist.cachedAt < YOUTUBE_CONFIG.CACHE_DURATION) {
      console.log('✅ Using memory cache');
      return cachedPlaylist;
    }
    
    // Check localStorage cache (unless forcing refresh)
    if (!forceRefresh) {
      const storedPlaylist = loadPlaylistFromStorage();
      if (storedPlaylist) {
        cachedPlaylist = storedPlaylist;
        return storedPlaylist;
      }
    }
    
    // Create API request promise
    const promise = (async (): Promise<YouTubePlaylist | null> => {
      try {
        console.log(forceRefresh ? '🔄 Force refreshing playlist...' : '📡 Fetching playlist from YouTube API...');
        
        // For default channel, use hard-coded ID directly (skip search.list!)
        let channelId: string | null;
        if (!channelHandleOrUrl || channelHandleOrUrl === YOUTUBE_CONFIG.DEFAULT_CHANNEL_HANDLE || channelHandleOrUrl === YOUTUBE_CONFIG.DEFAULT_CHANNEL_URL) {
          // Use hard-coded channel ID - NEVER call search.list for default channel!
          channelId = YOUTUBE_CONFIG.DEFAULT_CHANNEL_ID;
          console.log('✅ Using hard-coded channel ID (saved 100 quota units!)');
        } else {
          // Only for custom channels: try hard-coded map first, then API
          channelId = await getChannelIdFromHandle(channelHandleOrUrl);
        }
        
        if (!channelId) {
          console.error('Could not find channel:', handle);
          return null;
        }
        
        // Fetch channel details and videos in parallel
        const [channel, videos] = await Promise.all([
          getChannelDetails(channelId),
          getChannelVideos(channelId),
        ]);
        
        if (!channel) {
          console.error('Channel not found or invalid channel ID:', channelId);
          return null;
        }
        
        if (videos.length === 0) {
          console.error('No music videos found in channel.');
          return null;
        }
        
        console.log(`✅ Loaded ${videos.length} music videos from channel: ${channel.title}`);
        
        // Create playlist
        const playlist: YouTubePlaylist = {
          videos,
          channel,
          cachedAt: Date.now(),
        };
        
        // Cache in memory and localStorage
        cachedPlaylist = playlist;
        savePlaylistToStorage(playlist);
        
        return playlist;
      } finally {
        // Remove from pending map
        pendingRequests.delete(handle);
      }
    })();
    
    // Store pending promise
    pendingRequests.set(handle, promise);
    return promise;
  } catch (error) {
    console.error('Error fetching YouTube playlist:', error);
    return null;
  }
}

/**
 * Get a random video from the cached playlist
 */
export function getRandomYouTubeVideo(): YouTubeVideo | null {
  if (!cachedPlaylist || cachedPlaylist.videos.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * cachedPlaylist.videos.length);
  return cachedPlaylist.videos[randomIndex];
}

/**
 * Clear the cache (useful when user changes channel)
 */
export function clearPlaylistCache(): void {
  cachedPlaylist = null;
  try {
    localStorage.removeItem(PLAYLIST_CACHE_KEY);
    console.log('🗑️ Cleared playlist cache');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Get cached channel info (for UI display)
 */
export function getCachedChannel(): YouTubeChannel | null {
  return cachedPlaylist?.channel || null;
}

/**
 * Check if we have internet connectivity
 */
export async function checkInternetConnection(): Promise<boolean> {
  try {
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
    });
    return true;
  } catch {
    return false;
  }
}
