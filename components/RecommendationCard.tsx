'use client';

import Image from 'next/image';
import { Recommendation, TorrentOption } from '@/types';
import LibraryStatusBadge from '@/components/recommendation/LibraryStatusBadge';
import MovieDownloadSection from '@/components/recommendation/MovieDownloadSection';
import MovieMatchChooser from '@/components/recommendation/MovieMatchChooser';
import ScoreBadge from '@/components/recommendation/ScoreBadge';
import TvDownloadSection from '@/components/recommendation/TvDownloadSection';
import { useRecommendationCardState } from '@/hooks/useRecommendationCardState';

interface Props {
  recommendation: Recommendation;
  onPlexFound: (title: string, year?: number) => void;
  onResolveRecommendation?: (recommendation: Recommendation) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number,
    strictYear?: boolean
  ) => void;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onDownload: (title: string, year?: number) => Promise<boolean>;
  onNotFound?: (title: string) => void;
  isDownloading?: boolean;
  forceInLibrary?: boolean;
}

export default function RecommendationCard({
  recommendation,
  onPlexFound,
  onResolveRecommendation,
  onTorrentsReady,
  onNoSuitableQuality,
  onDownload,
  onNotFound,
  isDownloading = false,
  forceInLibrary = false,
}: Props) {
  const {
    ambiguityCandidates,
    downloading,
    handleMovieMatchSelect,
    handleOptionSelect,
    handleSeasonSelect,
    noSuitableQuality,
    numberOfSeasons,
    plexState,
    reviewState,
    resolvedRecommendation,
    reviews,
    seasonsInLibrary,
    selectedOptionIdx,
    selectedSeason,
    showPlex,
    someSeasonsInPlex,
    startMovieDownload,
    startTvDownload,
    torrentMeta,
    torrentState,
    torrentSummary,
    tvDownloading,
    tvTorrentOptions,
    tvTorrentState,
    type,
  } = useRecommendationCardState({
    forceInLibrary,
    onDownload,
    onNoSuitableQuality,
    onNotFound,
    onPlexFound,
    onResolveRecommendation,
    onTorrentsReady,
    recommendation,
  });

  const { title, year } = resolvedRecommendation;

  return (
    <div className="mt-2 rounded-xl border border-plex-border bg-plex-card overflow-hidden max-w-[600px]">
      <div className="flex gap-4 p-4">
        <div className="w-24 h-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800">
          {reviews?.poster ? (
            <Image
              src={reviews.poster}
              alt={`${title} poster`}
              width={96}
              height={144}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-white font-semibold text-base leading-tight">{title}</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                {(reviews?.year ?? year) !== undefined ? `${reviews?.year ?? year} · ` : ''}
                {type === 'tv' ? 'TV Series' : 'Movie'}
                {reviews?.runtime ? ` · ${reviews.runtime}min` : ''}
                {reviews?.director ? ` · dir. ${reviews.director}` : ''}
              </p>
            </div>

            <LibraryStatusBadge
              forceInLibrary={forceInLibrary}
              plexState={plexState}
              showPlex={showPlex}
              someSeasonsInPlex={someSeasonsInPlex}
            />
          </div>

          {reviews?.genres && reviews.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {reviews.genres.slice(0, 4).map((genre) => (
                <span key={genre} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                  {genre}
                </span>
              ))}
            </div>
          )}

          {reviewState === 'loading' ? (
            <p className="text-gray-500 text-xs mt-2 italic animate-pulse">Loading info...</p>
          ) : reviews?.overview ? (
            <p className="text-gray-400 text-xs mt-2 line-clamp-3">{reviews.overview}</p>
          ) : null}

          <div className="flex gap-3 mt-3">
            {reviews?.tmdbScore !== undefined && (
              <ScoreBadge label="TMDB" value={`${reviews.tmdbScore}%`} color="blue" />
            )}
            {reviews?.imdbScore && (
              <ScoreBadge label="IMDb" value={reviews.imdbScore} color="yellow" />
            )}
            {reviews?.rtScore && (
              <ScoreBadge label="RT" value={reviews.rtScore} color="red" />
            )}
          </div>

          {type === 'movie' ? (
            ambiguityCandidates && ambiguityCandidates.length > 1 ? (
              <MovieMatchChooser
                candidates={ambiguityCandidates}
                onSelect={handleMovieMatchSelect}
                title={title}
              />
            ) : (
              <MovieDownloadSection
                downloading={downloading}
                forceInLibrary={forceInLibrary}
                isDownloading={isDownloading}
                noSuitableQuality={noSuitableQuality}
                onDownload={startMovieDownload}
                torrentMeta={torrentMeta}
                torrentState={torrentState}
                torrentSummary={torrentSummary}
              />
            )
          ) : numberOfSeasons ? (
            <TvDownloadSection
              isDownloading={isDownloading}
              numberOfSeasons={numberOfSeasons}
              onDownload={startTvDownload}
              onOptionSelect={handleOptionSelect}
              onSeasonSelect={handleSeasonSelect}
              seasonsInLibrary={seasonsInLibrary}
              selectedOptionIdx={selectedOptionIdx}
              selectedSeason={selectedSeason}
              showPlex={showPlex}
              torrentMeta={torrentMeta}
              tvDownloading={tvDownloading}
              tvTorrentOptions={tvTorrentOptions}
              tvTorrentState={tvTorrentState}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
