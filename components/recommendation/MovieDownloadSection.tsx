'use client';

import type { CheckState } from '@/hooks/useRecommendationCardState';

interface Props {
  downloading: boolean;
  forceInLibrary: boolean;
  isDownloading: boolean;
  noSuitableQuality: boolean;
  onDownload: () => void;
  torrentMeta: { size: string; seeders: number } | null;
  torrentState: CheckState;
  torrentSummary: string;
}

export default function MovieDownloadSection({
  downloading,
  forceInLibrary,
  isDownloading,
  noSuitableQuality,
  onDownload,
  torrentMeta,
  torrentState,
  torrentSummary,
}: Props) {
  if (torrentState === 'skipped' || forceInLibrary) return null;

  return (
    <div className="mt-3">
      {torrentState === 'idle' ? null : torrentState === 'loading' ? (
        <span className="text-xs text-gray-600 animate-pulse">Checking availability...</span>
      ) : isDownloading ? (
        <span className="text-xs text-green-400">Downloading…</span>
      ) : torrentSummary ? (
        <div className="flex items-center gap-2.5">
          <button
            onClick={onDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
              bg-plex-accent text-black font-semibold
              hover:bg-yellow-400 transition-colors
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloading ? (
              'Starting…'
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M5 20h14v-2H5v2zm7-4l-5-5 1.41-1.41L11 17.17V4h2v13.17l3.59-3.58L18 15l-6 6-6-6z" />
                </svg>
                Download
              </>
            )}
          </button>
          {torrentMeta && (
            <span className="text-xs text-gray-600">
              {torrentMeta.size}
              {torrentMeta.size && torrentMeta.seeders > 0 ? ' · ' : ''}
              {torrentMeta.seeders > 0 ? `${torrentMeta.seeders} seeders` : ''}
            </span>
          )}
        </div>
      ) : noSuitableQuality ? (
        <span className="text-xs text-gray-500">Not available in HD</span>
      ) : (
        <span className="text-xs text-gray-500">Not available to download</span>
      )}
    </div>
  );
}
