'use client';

import { TvTorrentOption } from '@/lib/eztv';
import type { TvTorrentState } from '@/hooks/useRecommendationCardState';

interface Props {
  isDownloading: boolean;
  numberOfSeasons: number;
  onDownload: () => void;
  onOptionSelect: (index: number) => void;
  onSeasonSelect: (season: number) => void;
  seasonsInLibrary: Set<number>;
  selectedOptionIdx: number;
  selectedSeason: number | null;
  showPlex: boolean;
  torrentMeta: { size: string; seeders: number } | null;
  tvDownloading: boolean;
  tvTorrentOptions: TvTorrentOption[] | null;
  tvTorrentState: TvTorrentState;
}

export default function TvDownloadSection({
  isDownloading,
  numberOfSeasons,
  onDownload,
  onOptionSelect,
  onSeasonSelect,
  seasonsInLibrary,
  selectedOptionIdx,
  selectedSeason,
  showPlex,
  torrentMeta,
  tvDownloading,
  tvTorrentOptions,
  tvTorrentState,
}: Props) {
  if (showPlex || numberOfSeasons <= 0) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1 mb-2">
        {seasonsInLibrary.size === 0 && (
          <button
            key={0}
            onClick={() => onSeasonSelect(0)}
            disabled={tvTorrentState === 'loading' && selectedSeason === 0}
            className={`text-xs px-2 py-1 rounded font-medium transition-colors
              ${selectedSeason === 0
                ? 'bg-plex-accent text-black'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }
              disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            All
          </button>
        )}

        {Array.from({ length: numberOfSeasons }, (_, index) => index + 1).map((season) => {
          const inPlex = seasonsInLibrary.has(season);

          if (inPlex) {
            return (
              <span
                key={season}
                title={`Season ${season} is in your Plex library`}
                className="text-xs px-2 py-1 rounded font-medium
                  bg-green-900/30 text-green-600 border border-green-800/50
                  cursor-default select-none"
              >
                ✓ S{String(season).padStart(2, '0')}
              </span>
            );
          }

          return (
            <button
              key={season}
              onClick={() => onSeasonSelect(season)}
              disabled={tvTorrentState === 'loading' && selectedSeason === season}
              className={`text-xs px-2 py-1 rounded font-medium transition-colors
                ${selectedSeason === season
                  ? 'bg-plex-accent text-black'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }
                disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              S{String(season).padStart(2, '0')}
            </button>
          );
        })}
      </div>

      {selectedSeason !== null && (
        <div>
          {tvTorrentState === 'loading' ? (
            <span className="text-xs text-gray-600 animate-pulse">Checking availability...</span>
          ) : tvTorrentState === 'found' ? (
            isDownloading ? (
              <span className="text-xs text-green-400">Downloading…</span>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={onDownload}
                  disabled={tvDownloading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                    bg-plex-accent text-black font-semibold
                    hover:bg-yellow-400 transition-colors
                    disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {tvDownloading ? (
                    'Starting…'
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M5 20h14v-2H5v2zm7-4l-5-5 1.41-1.41L11 17.17V4h2v13.17l3.59-3.58L18 15l-6 6-6-6z" />
                      </svg>
                      {selectedSeason === 0 ? 'Download Series' : `Season ${selectedSeason}`}
                    </>
                  )}
                </button>

                {tvTorrentOptions && tvTorrentOptions.length > 1 ? (
                  <select
                    value={selectedOptionIdx}
                    onChange={(event) => onOptionSelect(Number(event.target.value))}
                    className="text-xs bg-gray-800 text-gray-400 border border-gray-700
                      rounded px-2 py-1 cursor-pointer hover:border-gray-500
                      focus:outline-none focus:border-plex-accent"
                  >
                    {tvTorrentOptions.map((option, index) => (
                      <option key={index} value={index}>
                        {(option.sizeBytes / 1e9).toFixed(1)} GB · {option.seeders} seeders
                      </option>
                    ))}
                  </select>
                ) : torrentMeta ? (
                  <span className="text-xs text-gray-600">
                    {torrentMeta.size}
                    {torrentMeta.size && torrentMeta.seeders > 0 ? ' · ' : ''}
                    {torrentMeta.seeders > 0 ? `${torrentMeta.seeders} seeders` : ''}
                  </span>
                ) : null}
              </div>
            )
          ) : tvTorrentState === 'nopack' ? (
            <span className="text-xs text-gray-500">
              {selectedSeason === 0
                ? "Complete series pack isn’t available yet"
                : `Season ${selectedSeason} isn’t available as a complete pack yet`}
            </span>
          ) : tvTorrentState === 'notfound' || tvTorrentState === 'error' ? (
            <span className="text-xs text-gray-500">Not available to download</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
