'use client';

import { useCallback, useState, useEffect } from 'react';
import { ActiveDownload } from '@/types';
import DownloadTracker from './DownloadTracker';

interface Props {
  downloads: ActiveDownload[];
  onMoved: (name: string, year?: number) => void;
  onComplete: (torrentId: number) => void;
}

// Thin wrapper that memoizes the onComplete binding per torrent ID so
// DownloadTracker receives a stable function reference across re-renders.
function DownloadTrackerWrapper({
  download,
  onMoved,
  onComplete,
}: {
  download: ActiveDownload;
  onMoved: (name: string, year?: number) => void;
  onComplete: (torrentId: number) => void;
}) {
  const handleComplete = useCallback(
    () => onComplete(download.torrentId),
    [onComplete, download.torrentId],
  );
  return (
    <DownloadTracker
      download={download}
      onMoved={onMoved}
      onComplete={handleComplete}
    />
  );
}

export default function DownloadsPanel({ downloads, onMoved, onComplete }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when all downloads finish
  useEffect(() => {
    if (downloads.length === 0) setExpanded(false);
  }, [downloads.length]);

  if (downloads.length === 0) return null;

  const label =
    downloads.length === 1
      ? downloads[0].torrentName
      : `${downloads.length} downloads`;

  return (
    <div className="border-t border-plex-border bg-plex-card">
      {/* ── Summary bar — always visible ─────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/60 transition-colors"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {/* Pulsing dot */}
        <span className="relative flex-shrink-0 w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-plex-accent opacity-75 animate-ping" />
          <span className="relative block w-2 h-2 rounded-full bg-plex-accent" />
        </span>

        <span className="flex-1 text-left text-sm text-white font-medium truncate">{label}</span>

        <span className="text-xs text-gray-500 flex-shrink-0">
          {expanded ? 'Hide' : 'Show'}
        </span>

        {/* Chevron */}
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ${expanded ? '' : 'rotate-180'}`}
        >
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
      </button>

      {/* ── Expanded tracker list ─────────────────────────────────────── */}
      {expanded && (
        <div
          className="overflow-y-auto bg-plex-bg pb-2 space-y-2"
          style={{ maxHeight: '40vh' }}
        >
          {downloads.map((dl) => (
            <DownloadTrackerWrapper
              key={dl.torrentId}
              download={dl}
              onMoved={onMoved}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
