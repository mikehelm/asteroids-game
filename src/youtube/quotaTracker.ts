// YouTube API Quota Tracker
// Tracks API usage and quota costs

export interface QuotaEntry {
  timestamp: number;
  endpoint: string;
  cost: number;
  method: string;
  success: boolean;
  error?: string;
}

// Quota costs per endpoint (from YouTube API v3 documentation)
export const QUOTA_COSTS = {
  'search.list': 100,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
  'commentThreads.list': 50,
  'subscriptions.list': 5,
} as const;

export const DAILY_QUOTA_LIMIT = 10000;

class YouTubeQuotaTracker {
  private entries: QuotaEntry[] = [];
  private readonly STORAGE_KEY = 'youtube_quota_tracker';

  constructor() {
    this.loadFromStorage();
    this.cleanOldEntries();
  }

  /**
   * Log an API call
   */
  logCall(endpoint: keyof typeof QUOTA_COSTS, success: boolean, error?: string): void {
    const entry: QuotaEntry = {
      timestamp: Date.now(),
      endpoint,
      cost: QUOTA_COSTS[endpoint] || 0,
      method: endpoint,
      success,
      error,
    };

    this.entries.push(entry);
    this.saveToStorage();
  }

  /**
   * Get total quota used today (resets at midnight PT)
   */
  getTodayUsage(): number {
    const todayEntries = this.getTodayEntries();
    return todayEntries.reduce((sum, entry) => sum + entry.cost, 0);
  }

  /**
   * Get remaining quota for today
   */
  getRemainingQuota(): number {
    return Math.max(0, DAILY_QUOTA_LIMIT - this.getTodayUsage());
  }

  /**
   * Get entries from today (Pacific Time)
   */
  getTodayEntries(): QuotaEntry[] {
    const now = new Date();
    const pacificOffset = -8 * 60; // PT is UTC-8 (or UTC-7 during DST)
    const localOffset = now.getTimezoneOffset();
    const ptOffset = localOffset + pacificOffset;
    
    // Get midnight PT in local time
    const midnightLocal = new Date(now);
    midnightLocal.setHours(0, 0, 0, 0);
    const midnightPT = new Date(midnightLocal.getTime() + ptOffset * 60000);

    return this.entries.filter(entry => entry.timestamp >= midnightPT.getTime());
  }

  /**
   * Get all entries
   */
  getAllEntries(): QuotaEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries grouped by endpoint
   */
  getUsageByEndpoint(): Record<string, { count: number; totalCost: number }> {
    const todayEntries = this.getTodayEntries();
    const grouped: Record<string, { count: number; totalCost: number }> = {};

    todayEntries.forEach(entry => {
      if (!grouped[entry.endpoint]) {
        grouped[entry.endpoint] = { count: 0, totalCost: 0 };
      }
      grouped[entry.endpoint].count++;
      grouped[entry.endpoint].totalCost += entry.cost;
    });

    return grouped;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.saveToStorage();
  }

  /**
   * Remove entries older than 1 day (keep yesterday and today only)
   */
  private cleanOldEntries(): void {
    const oneDayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);
    this.entries = this.entries.filter(entry => entry.timestamp > oneDayAgo);
    this.saveToStorage();
  }

  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.entries));
    } catch (error) {
      console.error('Failed to save quota tracker:', error);
    }
  }

  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.entries = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load quota tracker:', error);
      this.entries = [];
    }
  }
}

// Singleton instance
export const quotaTracker = new YouTubeQuotaTracker();
