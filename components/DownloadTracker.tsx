'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { DownloadStatus, ActiveDownload } from '@/types';

interface Props {
  download: ActiveDownload;
  onComplete: () => void;
  onMoved?: (torrentName: string) => void;
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
  // moving/moveError are only set when the user clicks "Move now" manually.
  // App-initiated downloads are moved by the server-side background poller.
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const [moveError, setMoveError] = useState('');
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

      // Torrent is gone from Transmission — the background poller already moved it.
      // Show "Added to library" briefly, then dismiss.
      if (msg.toLowerCase().includes('not found')) {
        stopPolling();
        if (download.fromApp) {
          onMoved?.(download.torrentName);
          setMoved(true);
          return;
        }
      }

      setError(msg);
      // Stop polling after 3 consecutive errors (e.g. Transmission down)
      if (consecutiveErrors.current >= 3) stopPolling();
    }
  }, [download.torrentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => stopPolling();
  }, [fetchStatus]);

  // Manual move — only used as a fallback if the background poller hasn't
  // picked up the torrent yet and the user wants to trigger it themselves.
  async function handleMove() {
    setMoving(true);
    setMoveError('');
    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          torrentId: download.torrentId,
          mediaType: download.mediaType,
          season: download.season,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Move failed');
      onMoved?.(download.torrentName);
      setMoved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Move failed';

      // Background poller is already on it — stay in "Moving to library…" state.
      // The poller will remove the torrent; the next poll will clean up the card.
      if (msg.toLowerCase().includes('already in progress')) return;

      // File is already gone — poller moved it but hadn't yet removed the torrent.
      if (msg.toLowerCase().includes('enoent') || msg.toLowerCase().includes('no such file')) {
        onMoved?.(download.torrentName);
        setMoved(true);
        return;
      }

      setMoveError(msg);
      setMoving(false);
    }
  }

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
  // 0 (Stopped), 5 (Queued to seed), or 6 (Seeding). Triggering the move on status 4 causes ENOENT.
  const isFinalizing = percent >= 100 && status !== null && status.status === 4;
  const isDone = percent >= 100 && status !== null && (status.status === 0 || status.status === 5 || status.status === 6);
  const isPaused = status?.status === 0 && !isDone;

  // Auto-dismiss the "Added to library" card 3 seconds after a successful move
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

      {/* Error state */}
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
      {isDone && download.fromApp && !moving && !moveError && (
        <p className="text-gray-500 text-xs mt-1 animate-pulse">Moving to library…</p>
      )}

      {/* External download — done, user must dismiss manually */}
      {isDone && !download.fromApp && !moving && !moveError && (
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

      {moving && <p className="text-xs text-gray-500 mt-1 animate-pulse">Moving to library…</p>}
      {moveError && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-red-400 text-xs">{moveError}</p>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => { setMoveError(''); handleMove(); }}
              className="text-xs text-plex-accent hover:text-plex-accent-hover transition-colors underline"
            >
              Retry
            </button>
            <button
              onClick={onComplete}
              className="text-xs text-gray-400 hover:text-white transition-colors underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
