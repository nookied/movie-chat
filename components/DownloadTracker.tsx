'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { DownloadStatus, ActiveDownload } from '@/types';

interface Props {
  download: ActiveDownload;
  onComplete: () => void;
  onMoved?: (torrentName: string, year?: number) => void;
}

// Transmission status codes
const STATUS_LABELS: Record<number, string> = {
  0: 'Paused',
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

export default function DownloadTracker({ download, onComplete, onMoved }: Props) {
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(false);
  const [controlLoading, setControlLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveErrors = useRef(0);

  function stopPolling() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/transmission/status?id=${download.torrentId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      consecutiveErrors.current = 0;
      setStatus(data);
      setError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cannot reach Transmission';
      consecutiveErrors.current += 1;

      if (msg.toLowerCase().includes('not found')) {
        stopPolling();
        if (download.fromApp) {
          // Server poller moved it — show "Added to library" then dismiss
          onMoved?.(download.torrentName, download.year);
          setMoved(true);
        } else {
          // External torrent manually removed — just dismiss quietly
          onComplete();
        }
        return;
      }

      setError(msg);
      // Stop polling after 3 consecutive errors (e.g. Transmission down)
      if (consecutiveErrors.current >= 3) stopPolling();
    }
  }, [download.torrentId, download.fromApp, download.torrentName, download.year, onMoved, onComplete]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => stopPolling();
  }, [fetchStatus]);

  async function handleControl(action: 'pause' | 'resume' | 'remove') {
    setControlLoading(true);
    try {
      await fetch('/api/transmission/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: download.torrentId, action }),
      });
      if (action === 'remove') {
        onComplete();
      } else {
        await fetchStatus();
      }
    } catch {
      // silently fail — next poll will reflect real state
    } finally {
      setControlLoading(false);
    }
  }

  const percent = status ? Math.round(status.percentDone * 100) : 0;
  // percent=100 alone isn't enough — Transmission stays at status 4 (Downloading) while it flushes
  // the last bytes and verifies the hash. The file doesn't exist on disk until status transitions to
  // 0 (Stopped), 5 (Queued to seed), or 6 (Seeding).
  const isFinalizing = percent >= 100 && status !== null && status.status === 4;
  const isDone = percent >= 100 && status !== null && (status.status === 0 || status.status === 5 || status.status === 6);
  const isPaused = status?.status === 0 && !isDone;

  // Auto-dismiss the "Added to library" card 3 seconds after move confirmation
  useEffect(() => {
    if (!moved) return;
    const timer = setTimeout(() => onComplete(), 3000);
    return () => clearTimeout(timer);
  }, [moved, onComplete]);

  if (moved) {
    return (
      <div className="mx-4 rounded-xl border border-green-700/50 bg-green-900/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-green-400 font-medium text-sm">Added to library</p>
            <p className="text-green-400/60 text-xs mt-0.5 truncate">{download.torrentName}</p>
          </div>
          <button
            onClick={onComplete}
            className="text-green-600 hover:text-green-300 flex-shrink-0 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 rounded-xl border border-plex-border bg-plex-card px-4 py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-tight truncate">
            {download.torrentName}
          </p>
          {status && !error && (
            <p className="text-gray-500 text-xs mt-0.5">
              {isFinalizing ? 'Finalizing…' : (STATUS_LABELS[status.status] ?? 'Unknown')}
            </p>
          )}
        </div>
        {!error && (
          <span className="text-plex-accent font-bold text-sm flex-shrink-0 tabular-nums">{percent}%</span>
        )}
      </div>

      {/* Progress bar */}
      {!error && (
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-plex-accent rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* Stats + controls row — only shown while actively downloading */}
      {!error && !isDone && !isFinalizing && status && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{formatSpeed(status.rateDownload)}</span>
            <span>ETA {formatEta(status.eta)}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Pause / Resume */}
            <button
              onClick={() => handleControl(isPaused ? 'resume' : 'pause')}
              disabled={controlLoading}
              title={isPaused ? 'Resume' : 'Pause'}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            >
              {isPaused ? (
                <>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  Pause
                </>
              )}
            </button>
            {/* Cancel */}
            <button
              onClick={() => handleControl('remove')}
              disabled={controlLoading}
              title="Cancel download"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error state — covers Transmission unreachable or other unexpected errors */}
      {error && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-red-400 text-xs">{error}</p>
          <button
            onClick={onComplete}
            className="text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0 underline"
          >
            Clean up
          </button>
        </div>
      )}

      {/* App-initiated download complete — server is moving it in the background */}
      {isDone && download.fromApp && (
        <p className="text-gray-500 text-xs mt-1 animate-pulse">Moving to library…</p>
      )}

      {/* External download — done, user must dismiss manually */}
      {isDone && !download.fromApp && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-gray-400 text-xs">Download complete</p>
          <button
            onClick={onComplete}
            className="text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
