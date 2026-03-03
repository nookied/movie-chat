'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Recommendation, PlexStatus, ReviewData, TorrentOption } from '@/types';

interface Props {
  recommendation: Recommendation;
  onPlexFound: (title: string, year: number) => void;
  onTorrentsReady: (title: string, year: number, torrents: TorrentOption[]) => void;
  onNoSuitableQuality: (title: string, year: number) => void;
}

// 'idle' = waiting for Plex result before starting; 'skipped' = on Plex, no need to search
type CheckState = 'idle' | 'loading' | 'done' | 'skipped' | 'error';

export default function RecommendationCard({
  recommendation,
  onPlexFound,
  onTorrentsReady,
  onNoSuitableQuality,
}: Props) {
  const { title, year, type } = recommendation;

  const [plexState, setPlexState] = useState<CheckState>('loading');
  const [reviewState, setReviewState] = useState<CheckState>('loading');
  const [torrentState, setTorrentState] = useState<CheckState>('idle');

  const [plex, setPlex] = useState<PlexStatus | null>(null);
  const [reviews, setReviews] = useState<ReviewData | null>(null);
  const [torrentSummary, setTorrentSummary] = useState('');
  const [noSuitableQuality, setNoSuitableQuality] = useState(false);

  // Fire each callback only once
  const plexCallbackSent = useRef(false);
  const torrentCallbackSent = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams({ title, year: String(year) });

    // Reviews run independently — just metadata, no decision depends on them
    fetch(`/api/reviews?${params}`)
      .then((r) => r.json())
      .then((d) => { setReviews(d); setReviewState('done'); })
      .catch(() => setReviewState('error'));

    // Plex first — then YTS only if the movie is not already in the library
    async function checkSequentially() {
      // Step 1: Plex
      let plexFound = false;
      try {
        const r = await fetch(`/api/plex/check?${params}`);
        const d: PlexStatus = await r.json();
        setPlex(d);
        setPlexState('done');
        plexFound = d.found;
        if (d.found && !plexCallbackSent.current) {
          plexCallbackSent.current = true;
          onPlexFound(title, year);
        }
      } catch {
        setPlexState('error');
      }

      // Step 2: YTS — only runs if movie not on Plex, and only for movies
      if (plexFound || type !== 'movie') {
        setTorrentState('skipped');
        return;
      }

      setTorrentState('loading');
      try {
        const r = await fetch(`/api/torrents/search?${params}`);
        const d: { torrents: TorrentOption[]; noSuitableQuality: boolean } = await r.json();
        setTorrentState('done');

        if (d.noSuitableQuality) {
          setNoSuitableQuality(true);
          if (!torrentCallbackSent.current) {
            torrentCallbackSent.current = true;
            onNoSuitableQuality(title, year);
          }
          return;
        }

        if (d.torrents?.length > 0) {
          const best = d.torrents[0];
          setTorrentSummary(`1080p · ${best.codec} · ${best.size}`);
          if (!torrentCallbackSent.current) {
            torrentCallbackSent.current = true;
            onTorrentsReady(title, year, d.torrents);
          }
        }
      } catch {
        setTorrentState('error');
      }
    }

    checkSequentially();
  }, [title, year, type, onPlexFound, onTorrentsReady, onNoSuitableQuality]);

  return (
    <div className="ml-11 mt-2 rounded-xl border border-plex-border bg-plex-card overflow-hidden max-w-[600px]">
      <div className="flex gap-4 p-4">
        {/* Poster */}
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

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-white font-semibold text-base leading-tight">{title}</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                {year} · {type === 'tv' ? 'TV Series' : 'Movie'}
                {reviews?.runtime ? ` · ${reviews.runtime}min` : ''}
                {reviews?.director ? ` · dir. ${reviews.director}` : ''}
              </p>
            </div>

            {/* Plex badge */}
            {plexState === 'loading' ? (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">
                Checking Plex...
              </span>
            ) : plex?.found ? (
              <span className="text-xs bg-green-900/60 text-green-400 border border-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
                On Plex ✓
              </span>
            ) : (
              <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                Not in library
              </span>
            )}
          </div>

          {/* Genres */}
          {reviews?.genres && reviews.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {reviews.genres.slice(0, 4).map((g) => (
                <span key={g} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {reviewState === 'loading' ? (
            <p className="text-gray-500 text-xs mt-2 italic animate-pulse">Loading info...</p>
          ) : reviews?.overview ? (
            <p className="text-gray-400 text-xs mt-2 line-clamp-3">{reviews.overview}</p>
          ) : null}

          {/* Scores */}
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

          {/* Torrent availability — shown only when Plex doesn't have it */}
          {type === 'movie' && torrentState !== 'skipped' && (
            <div className="mt-3">
              {torrentState === 'idle' ? null : torrentState === 'loading' ? (
                <span className="text-xs text-gray-600 animate-pulse">Checking availability...</span>
              ) : torrentSummary ? (
                <span className="text-xs text-green-500">Available to download</span>
              ) : (
                <span className="text-xs text-gray-500">Not available to download</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value, color }: { label: string; value: string; color: 'blue' | 'yellow' | 'red' }) {
  const colors = {
    blue: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    red: 'bg-red-900/40 text-red-300 border-red-700/50',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors[color]}`}>
      {label} {value}
    </span>
  );
}
