'use client';

import { useEffect, useState, useCallback } from 'react';
import { DownloadStatus, ActiveDownload } from '@/types';

interface Props {
  download: ActiveDownload;
  onComplete: () => void;
}

// Transmission status codes
const STATUS_LABELS: Record<number, string> = {
  0: 'Stopped',
  1: 'Checking queue',
  2: 'Checking files',
  3: 'Download queue',
  4: 'Downloading',
  5: 'Seed queue',
  6: 'Seeding',
};

function formatEta(seconds: number): string {
  if (seconds < 0) return '∞';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export default function DownloadTracker({ download, onComplete }: Props) {
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const [moveError, setMoveError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/transmission/status?id=${download.torrentId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot reach Transmission');
    }
  }, [download.torrentId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function handleMove() {
    setMoving(true);
    setMoveError('');

    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ torrentId: download.torrentId }),
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || 'Move failed');

      setMoved(true);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move failed');
      setMoving(false);
    }
  }

  const percent = status ? Math.round(status.percentDone * 100) : 0;
  const isDone = percent >= 100;

  if (moved) {
    return (
      <div className="fixed bottom-4 right-4 w-80 bg-green-900/80 border border-green-600 rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-300 font-medium text-sm">Moved to library</p>
            <p className="text-green-400/70 text-xs mt-0.5 truncate">{download.torrentName}</p>
          </div>
          <button
            onClick={onComplete}
            className="text-green-400 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-plex-card border border-plex-border rounded-xl p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-tight truncate">
            {download.torrentName}
          </p>
          {status && (
            <p className="text-gray-400 text-xs mt-0.5">
              {STATUS_LABELS[status.status] ?? 'Unknown'}
            </p>
          )}
        </div>
        <span className="text-plex-accent font-bold text-sm flex-shrink-0">{percent}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-plex-accent rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stats */}
      {status && !isDone && (
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          <span>{formatSpeed(status.rateDownload)}</span>
          <span>ETA {formatEta(status.eta)}</span>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs mb-2">{error}</p>
      )}

      {/* Move button */}
      {isDone && (
        <button
          onClick={handleMove}
          disabled={moving}
          className="w-full py-2 rounded-lg bg-plex-accent text-black text-sm font-semibold
            hover:bg-plex-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors plex-pulse"
        >
          {moving ? 'Moving to library...' : 'Move to Library'}
        </button>
      )}

      {moveError && (
        <p className="text-red-400 text-xs mt-2">{moveError}</p>
      )}
    </div>
  );
}
