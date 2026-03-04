'use client';

import { useState, useEffect, useRef } from 'react';
import { ActiveDownload } from '@/types';
import DownloadTracker from './DownloadTracker';

interface Props {
  downloads: ActiveDownload[];
  onMoved: (name: string) => void;
  onComplete: (torrentId: number) => void;
}

export default function DownloadsPanel({ downloads, onMoved, onComplete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const prevCountRef = useRef(downloads.length);

  // Auto-expand when a new download is added; auto-collapse when all finish
  useEffect(() => {
    if (downloads.length > prevCountRef.current) setExpanded(true);
    if (downloads.length === 0) setExpanded(false);
    prevCountRef.current = downloads.length;
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
            <DownloadTracker
              key={dl.torrentId}
              download={dl}
              onMoved={onMoved}
              onComplete={() => onComplete(dl.torrentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
