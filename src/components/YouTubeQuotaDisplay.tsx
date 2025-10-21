import React, { useState, useEffect } from 'react';
import { quotaTracker, DAILY_QUOTA_LIMIT, QUOTA_COSTS } from '../youtube/quotaTracker';

interface YouTubeQuotaDisplayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const YouTubeQuotaDisplay: React.FC<YouTubeQuotaDisplayProps> = ({ isOpen, onClose }) => {
  const [usage, setUsage] = useState(0);
  const [remaining, setRemaining] = useState(DAILY_QUOTA_LIMIT);
  const [byEndpoint, setByEndpoint] = useState<Record<string, { count: number; totalCost: number }>>({});
  const [recentEntries, setRecentEntries] = useState<any[]>([]);

  const refreshData = () => {
    const todayUsage = quotaTracker.getTodayUsage();
    const remainingQuota = quotaTracker.getRemainingQuota();
    const grouped = quotaTracker.getUsageByEndpoint();
    const recent = quotaTracker.getTodayEntries().slice(-10).reverse(); // Last 10 entries

    setUsage(todayUsage);
    setRemaining(remainingQuota);
    setByEndpoint(grouped);
    setRecentEntries(recent);
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      // Refresh every 5 seconds while open
      const interval = setInterval(refreshData, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const usagePercent = (usage / DAILY_QUOTA_LIMIT) * 100;
  const getColorClass = (percent: number) => {
    if (percent >= 90) return 'text-red-400';
    if (percent >= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900 to-blue-900 p-4 flex items-center justify-between border-b-2 border-cyan-500">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <h2 className="text-xl font-bold text-white">YouTube API Quota Usage</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-red-600 hover:bg-red-500 rounded text-white font-bold text-lg transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-lg font-semibold text-cyan-300">Daily Quota (Resets Midnight PT)</h3>
              <span className={`text-2xl font-bold ${getColorClass(usagePercent)}`}>
                {usage} / {DAILY_QUOTA_LIMIT}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full h-6 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
              <div
                className={`h-full transition-all duration-500 ${
                  usagePercent >= 90 ? 'bg-red-500' :
                  usagePercent >= 70 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            
            <div className="flex justify-between mt-2 text-sm text-gray-400">
              <span>Used: {usagePercent.toFixed(1)}%</span>
              <span>Remaining: {remaining} units</span>
            </div>
          </div>

          {/* Usage by Endpoint */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-cyan-300 mb-3">Usage by Endpoint</h3>
            <div className="space-y-2">
              {Object.entries(byEndpoint).length === 0 ? (
                <p className="text-gray-500 text-sm italic">No API calls made today</p>
              ) : (
                Object.entries(byEndpoint).map(([endpoint, data]) => (
                  <div key={endpoint} className="bg-gray-800 rounded p-3 border border-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium">{endpoint}</span>
                      <span className="text-cyan-400 font-bold">{data.totalCost} units</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {data.count} call{data.count !== 1 ? 's' : ''} × {QUOTA_COSTS[endpoint as keyof typeof QUOTA_COSTS]} units each
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Calls */}
          <div>
            <h3 className="text-lg font-semibold text-cyan-300 mb-3">Recent API Calls</h3>
            <div className="space-y-1">
              {recentEntries.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No recent calls</p>
              ) : (
                recentEntries.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                      entry.success ? 'bg-gray-800 text-gray-300' : 'bg-red-900/30 text-red-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{entry.success ? '✅' : '❌'}</span>
                      <span className="font-mono text-xs">{formatTime(entry.timestamp)}</span>
                      <span>{entry.endpoint}</span>
                    </div>
                    <span className="font-bold">{entry.cost} units</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quota Cost Reference */}
          <div className="mt-6 p-4 bg-gray-800 rounded border border-gray-700">
            <h4 className="text-sm font-semibold text-cyan-300 mb-2">📚 API Cost Reference</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
              {Object.entries(QUOTA_COSTS).map(([endpoint, cost]) => (
                <div key={endpoint} className="flex justify-between">
                  <span>{endpoint}</span>
                  <span className="text-white font-medium">{cost} units</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Quota resets daily at midnight Pacific Time (PT)
          </div>
          <button
            onClick={() => {
              if (confirm('Clear all quota tracking data?')) {
                quotaTracker.clear();
                refreshData();
              }
            }}
            className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
          >
            Clear Data
          </button>
        </div>
      </div>
    </div>
  );
};
