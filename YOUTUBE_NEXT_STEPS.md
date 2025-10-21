# YouTube Integration - Remaining Steps

## ✅ Completed So Far:
1. Created YouTube API configuration (`src/config/youtube.ts`)
2. Created YouTube type definitions (`src/youtube/types.ts`)
3. Created YouTube API functions (`src/youtube/youtubeApi.ts`)
4. Created YouTube Player wrapper (`src/youtube/youtubePlayer.ts`)
5. Created YouTubeCredit component (`src/components/YouTubeCredit.tsx`)
6. Added imports and state variables to `sounds.ts`

## 🔧 Still Need To Do:

### 1. Add YouTube Methods to `sounds.ts`

Add these public methods to the `SoundSystemImpl` class:

```typescript
// Initialize YouTube player (call this on game start)
async initYouTube(): Promise<void> {
  try {
    await initializeYouTubePlayer();
    this.youtubePlayerReady = true;
    
    // Set up callbacks
    onYouTubeVideoEnd(() => {
      this.handleYouTubeEnd();
    });
    
    onYouTubeError((error) => {
      console.log('YouTube error, falling back to local:', error);
      this.youtubeEnabled = false;
    });
    
    // Fetch playlist
    const playlist = await fetchYouTubePlaylist();
    if (playlist) {
      this.youtubePlaylistLoaded = true;
    }
    
    // Check internet
    this.hasInternet = await checkInternetConnection();
  } catch (error) {
    console.log('YouTube initialization failed:', error);
    this.youtubeEnabled = false;
  }
}

// Decide whether to play YouTube or local
private shouldPlayYouTube(): boolean {
  if (!this.youtubeEnabled || !this.youtubePlayerReady || !this.has Internet) {
    return false;
  }
  
  if (this.musicSourceType === 'youtube') {
    return true; // User wants YouTube only
  }
  
  if (this.musicSourceType === 'local') {
    return false; // User wants local only
  }
  
  // Mixed mode (90/10)
  if (this.isFirstSong) {
    this.isFirstSong = false;
    return true; // First song always YouTube
  }
  
  return Math.random() < YOUTUBE_CONFIG.YOUTUBE_PLAY_CHANCE; // 10% chance
}

// Play next track (YouTube or local)
private async playNextTrack(): Promise<void> {
  if (this.shouldPlayYouTube()) {
    await this.playYouTubeTrack();
  } else {
    await this.playLocalTrack();
  }
}

// Play a YouTube video
private async playYouTubeTrack(): Promise<void> {
  const video = getRandomYouTubeVideo();
  if (!video) {
    // Fall back to local
    await this.playLocalTrack();
    return;
  }
  
  this.currentYouTubeVideo = video;
  await playYouTubeVideo(video);
  
  // Notify UI
  if (this.youtubeStateChangeCallback) {
    this.youtubeStateChangeCallback(video, getCachedChannel(), true);
  }
}

// Play a local track
private async playLocalTrack(): Promise<void> {
  // Your existing playMusic() logic here
  await this.playMusic();
}

// Handle YouTube video end
private handleYouTubeEnd(): void {
  // Notify UI
  if (this.youtubeStateChangeCallback) {
    this.youtubeStateChangeCallback(null, null, false);
  }
  
  // Play next track after gap
  setTimeout(() => {
    this.playNextTrack();
  }, this.musicGapMs);
}

// Public API for UI
setMusicSource(source: MusicSource): void {
  this.musicSourceType = source;
}

setYouTubeEnabled(enabled: boolean): void {
  this.youtubeEnabled = enabled;
  if (!enabled) {
    stopYouTubePlayer();
  }
}

onYouTubeStateChange(callback: (video: YouTubeVideo | null, channel: YouTubeChannel | null, isPlaying: boolean) => void): void {
  this.youtubeStateChangeCallback = callback;
}

getCurrentYouTubeVideo(): YouTubeVideo | null {
  return this.currentYouTubeVideo;
}

getYouTubeChannel(): YouTubeChannel | null {
  return getCachedChannel();
}

// Update existing pauseMusic() to handle YouTube
pauseMusic(): void {
  if (isYouTubePlaying()) {
    pauseYouTubePlayer();
  }
  // ... existing local pause logic
}

// Update existing resumeMusic() to handle YouTube
resumeMusic(): void {
  if (this.currentYouTubeVideo) {
    resumeYouTubePlayer();
  } else {
    // ... existing local resume logic
  }
}

// Update existing setMusicVolume() to sync with YouTube
setMusicVolume(v: number): void {
  this.musicVolume = Math.max(0, Math.min(1, v));
  setYouTubeVolume(this.musicVolume * 100); // Convert to 0-100
  // ... existing local volume logic
}
```

### 2. Update `Game.tsx`

Add to imports:
```typescript
import { YouTubeCredit } from './components/YouTubeCredit';
import { MusicSource } from './youtube/types';
```

Add state variables:
```typescript
const [youtubeVideo, setYouTubeVideo] = useState<YouTubeVideo | null>(null);
const [youtubeChannel, setYouTubeChannel] = useState<YouTubeChannel | null>(null);
const [youtubeIsPlaying, setYouTubeIsPlaying] = useState(false);
const [musicSource, setMusicSource] = useState<MusicSource>('mixed');
const [youtubeEnabled, setYouTubeEnabled] = useState(true);
```

In useEffect (initialize YouTube):
```typescript
useEffect(() => {
  // Initialize YouTube
  soundSystem.initYouTube().catch(console.error);
  
  // Set up state change listener
  soundSystem.onYouTubeStateChange((video, channel, isPlaying) => {
    setYouTubeVideo(video);
    setYouTubeChannel(channel);
    setYouTubeIsPlaying(isPlaying);
  });
}, []);
```

Add to render (before closing div):
```typescript
{/* YouTube Credit Display */}
<YouTubeCredit
  video={youtubeVideo}
  channel={youtubeChannel}
  isPlaying={youtubeIsPlaying}
/>
```

Add to song list UI:
```typescript
{/* YouTube Settings */}
<div style={{/* styles */}}>
  <label>
    <input
      type="checkbox"
      checked={youtubeEnabled}
      onChange={(e) => {
        setYouTubeEnabled(e.target.checked);
        soundSystem.setYouTubeEnabled(e.target.checked);
      }}
    />
    Enable YouTube Music
  </label>
  
  <select
    value={musicSource}
    onChange={(e) => {
      const source = e.target.value as MusicSource;
      setMusicSource(source);
      soundSystem.setMusicSource(source);
    }}
  >
    <option value="mixed">Mixed (90% Local, 10% YouTube)</option>
    <option value="local">Local Only</option>
    <option value="youtube">YouTube Only</option>
  </select>
</div>
```

### 3. Create `.env.local` File (MANUAL STEP)

```bash
echo "REACT_APP_YOUTUBE_API_KEY=AIzaSyAv_DeMSHVbab_6j169s2kcODNUoPOY7H8" > .env.local
```

### 4. Update Channel ID in `youtube.ts`

After first run, the app will fetch the real channel ID for @OutlawAlgorithm.
You'll need to update DEFAULT_CHANNEL_ID in config once fetched.

## 🧪 Testing Checklist

1. [ ] App loads without errors
2. [ ] First song is from YouTube
3. [ ] Subsequent songs are 90% local, 10% YouTube
4. [ ] YouTube credit displays bottom-right
5. [ ] Credit fades in/out correctly
6. [ ] Clicking credit opens channel
7. [ ] YouTube toggle works
8. [ ] Source selector works (Mixed/Local/YouTube)
9. [ ] Falls back to local when offline
10. [ ] Volume controls affect YouTube
11. [ ] Pause/resume works for both sources

## 📝 Notes

- The core YouTube infrastructure is complete
- Main work remaining is integrating with existing music playback
- Should take ~30-45 minutes to implement remaining steps
- Test thoroughly before deployment!
