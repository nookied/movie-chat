'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Recommendation, PlexStatus, ReviewData, TorrentOption } from '@/types';
import { TvTorrentResult, TvTorrentOption } from '@/lib/eztv';

interface Props {
  recommendation: Recommendation;
  onPlexFound: (title: string, year?: number) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number
  ) => void;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onDownload: (title: string, year?: number) => void;
  onNotFound?: (title: string) => void;
  isDownloading?: boolean;
  forceInLibrary?: boolean;
}

// 'idle' = waiting for Plex result before starting; 'skipped' = on Plex, no need to search
type CheckState = 'idle' | 'loading' | 'done' | 'skipped' | 'error';
type TvTorrentState = 'idle' | 'loading' | 'found' | 'nopack' | 'notfound' | 'error';

export default function RecommendationCard({
  recommendation,
  onPlexFound,
  onTorrentsReady,
  onNoSuitableQuality,
  onDownload,
  onNotFound,
  isDownloading = false,
  forceInLibrary = false,
}: Props) {
  const { title, year, type } = recommendation;

  const [plexState, setPlexState] = useState<CheckState>('loading');
  const [reviewState, setReviewState] = useState<CheckState>('loading');
  const [torrentState, setTorrentState] = useState<CheckState>('idle');

  const [plex, setPlex] = useState<PlexStatus | null>(null);
  const [reviews, setReviews] = useState<ReviewData | null>(null);
  const [torrentSummary, setTorrentSummary] = useState('');
  const [noSuitableQuality, setNoSuitableQuality] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Torrent meta shown below the download button: size + seeders
  const [torrentMeta, setTorrentMeta] = useState<{ size: string; seeders: number } | null>(null);

  // TV-specific state
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [tvTorrentState, setTvTorrentState] = useState<TvTorrentState>('idle');
  const [tvDownloading, setTvDownloading] = useState(false);
  const [tvTorrentOptions, setTvTorrentOptions] = useState<TvTorrentOption[] | null>(null);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);

  // Fire each callback only once
  const plexCallbackSent = useRef(false);
  const torrentCallbackSent = useRef(false);
  // Guard for the auto-fetch of the default TV season — runs at most once per card
  const autoFetchedSeason = useRef(false);

  // Always-current plex state accessible inside closures without stale captures
  const plexRef = useRef<PlexStatus | null>(null);
  useEffect(() => { plexRef.current = plex; }, [plex]);

  useEffect(() => {
    const params = new URLSearchParams({ title });
    if (year !== undefined) params.set('year', String(year));
    const typeParam = type === 'tv' ? 'tv' : 'movie';

    // Reviews run independently — just metadata, no decision depends on them
    fetch(`/api/reviews?${params}&type=${typeParam}`)
      .then((r) => r.json())
      .then((d: ReviewData) => {
        setReviews(d);
        setReviewState('done');
        // If TMDB/OMDB found nothing at all, tell the LLM so it can react
        if (!d.poster && !d.overview && d.tmdbScore === undefined && !d.imdbScore) {
          onNotFound?.(title);
        }
      })
      .catch(() => setReviewState('error'));

    // Plex first — then YTS only if movie not in library; TV uses season picker instead
    async function checkSequentially() {
      // Step 1: Plex
      let plexFound = false;
      try {
        const plexUrl = type === 'tv'
          ? `/api/plex/check?${params}&type=tv`
          : `/api/plex/check?${params}`;
        const r = await fetch(plexUrl);
        const d: PlexStatus = await r.json();
        setPlex(d);
        setPlexState('done');
        // For movies fire immediately; for TV we fire in a separate effect once
        // we know numberOfSeasons (needed to distinguish "all" vs "partial").
        plexFound = type === 'movie' ? d.found : false;
        if (type === 'movie' && d.found && !plexCallbackSent.current) {
          plexCallbackSent.current = true;
          onPlexFound(title, year);
        }
      } catch {
        setPlexState('error');
      }

      // Step 2: YTS — only for movies not on Plex; TV uses season picker
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
          setTorrentMeta({ size: best.size, seeders: best.seeders });
          if (!torrentCallbackSent.current) {
            torrentCallbackSent.current = true;
            onTorrentsReady(title, year, d.torrents, 'movie');
          }
        }
      } catch {
        setTorrentState('error');
      }
    }

    checkSequentially();
  }, [title, year, type, onPlexFound, onTorrentsReady, onNoSuitableQuality]);

  async function handleSeasonSelect(season: number) {
    setSelectedSeason(season);
    setTvTorrentState('loading');
    setTvDownloading(false);
    setTorrentMeta(null);
    setTvTorrentOptions(null);
    setSelectedOptionIdx(0);

    try {
      const params = new URLSearchParams({
        title,
        type: 'tv',
        season: String(season),
      });
      if (year !== undefined) params.set('year', String(year));
      const r = await fetch(`/api/torrents/search?${params}`);
      const d: TvTorrentResult = await r.json();

      if (!d.found) {
        setTvTorrentState('notfound');
        return;
      }

      if (d.noSeasonPack) {
        setTvTorrentState('nopack');
        return;
      }

      setTvTorrentState('found');
      setTorrentMeta({
        size: d.sizeBytes ? `${(d.sizeBytes / 1e9).toFixed(1)} GB` : '',
        seeders: d.seeders ?? 0,
      });
      setTvTorrentOptions(d.options ?? null);

      // Build a synthetic TorrentOption to reuse the existing download pipeline
      const syntheticTorrent: TorrentOption = {
        quality: d.quality ?? '1080p',
        type: 'web',
        codec: '',
        size: d.sizeBytes ? `${(d.sizeBytes / 1e9).toFixed(1)} GB` : '',
        seeders: d.seeders ?? 0,
        magnet: d.magnet ?? '',
        movieTitle: title,
      };

      // No callback guard for TV — re-selecting a season must overwrite the pending entry
      onTorrentsReady(title, year, [syntheticTorrent], 'tv', season);
    } catch {
      setTvTorrentState('error');
    }
  }

  function handleOptionSelect(idx: number) {
    if (!tvTorrentOptions) return;
    setSelectedOptionIdx(idx);
    const opt = tvTorrentOptions[idx];
    setTorrentMeta({
      size: `${(opt.sizeBytes / 1e9).toFixed(1)} GB`,
      seeders: opt.seeders,
    });
    const syntheticTorrent: TorrentOption = {
      quality: opt.quality,
      type: 'web',
      codec: '',
      size: `${(opt.sizeBytes / 1e9).toFixed(1)} GB`,
      seeders: opt.seeders,
      magnet: opt.magnet,
      movieTitle: title,
    };
    onTorrentsReady(title, year, [syntheticTorrent], 'tv', selectedSeason!);
  }

  // Silently fetch the torrent for `season` and register it in pendingTorrents
  // (via onTorrentsReady) without touching any UI state. This lets the AI respond
  // to chat-initiated download requests before the user clicks a season button.
  async function fetchDefaultSeason(season: number) {
    try {
      const params = new URLSearchParams({ title, type: 'tv', season: String(season) });
      if (year !== undefined) params.set('year', String(year));
      const r = await fetch(`/api/torrents/search?${params}`);
      if (!r.ok) return;
      const d: TvTorrentResult = await r.json();
      if (!d.found || d.noSeasonPack) return;
      const syntheticTorrent: TorrentOption = {
        quality: d.quality ?? '1080p',
        type: 'web',
        codec: '',
        size: d.sizeBytes ? `${(d.sizeBytes / 1e9).toFixed(1)} GB` : '',
        seeders: d.seeders ?? 0,
        magnet: d.magnet ?? '',
        movieTitle: title,
      };
      onTorrentsReady(title, year, [syntheticTorrent], 'tv', season);
    } catch { /* silently ignore — user can still click a season button manually */ }
  }

  const numberOfSeasons = reviews?.numberOfSeasons;

  // Derived TV Plex state — only meaningful when type === 'tv'
  const seasonsInLibrary = new Set(plex?.seasons ?? []);
  const allSeasonsInPlex =
    type === 'tv' &&
    plex?.found === true &&
    numberOfSeasons !== undefined &&
    seasonsInLibrary.size >= numberOfSeasons;
  const someSeasonsInPlex =
    type === 'tv' && plex?.found === true && seasonsInLibrary.size > 0 && !allSeasonsInPlex;

  // Fire onPlexFound for TV only when every season is confirmed in library
  useEffect(() => {
    if (type === 'tv' && allSeasonsInPlex && !plexCallbackSent.current) {
      plexCallbackSent.current = true;
      onPlexFound(title, year);
    }
  }, [allSeasonsInPlex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch the default season torrent (earliest not in Plex) once Plex and TMDB
  // data are both settled. This populates pendingTorrents in ChatInterface so the AI
  // can respond to "can I download it?" without requiring the user to click a season
  // button first. Does not update any card UI state — purely a background registration.
  // If the user manually clicks a season, handleSeasonSelect overwrites the entry.
  useEffect(() => {
    if (type !== 'tv') return;
    if (!numberOfSeasons) return;
    if (plexState !== 'done' && plexState !== 'error') return; // wait for Plex to settle
    if (showPlex) return; // all seasons already in library
    if (selectedSeason !== null) return; // user already picked a season manually
    if (autoFetchedSeason.current) return;

    const seasonsInLib = new Set(plex?.seasons ?? []); // empty on Plex error → defaults to S01
    let defaultSeason: number | undefined;
    for (let s = 1; s <= numberOfSeasons; s++) {
      if (!seasonsInLib.has(s)) { defaultSeason = s; break; }
    }
    if (defaultSeason === undefined) return;

    autoFetchedSeason.current = true;
    fetchDefaultSeason(defaultSeason);
  }, [type, numberOfSeasons, plexState, showPlex, selectedSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  // Post-move Plex re-checks — fires silently after forceInLibrary is set.
  // Retries at 2 min → 10 min → 60 min, stopping early once Plex confirms.
  // For movies: stops when d.found === true.
  // For TV:    updates plex state each attempt; allSeasonsInPlex effect fires the
  //             callback naturally once every season is confirmed.
  useEffect(() => {
    if (!forceInLibrary) return;
    // Already confirmed by the initial mount check — nothing to do
    if (type === 'movie' && plexRef.current?.found) return;

    let cancelled = false;
    const DELAYS_MS = [2 * 60_000, 10 * 60_000, 60 * 60_000]; // 2 min, 10 min, 60 min
    let timeoutId: ReturnType<typeof setTimeout>;

    async function attempt(index: number) {
      if (cancelled || index >= DELAYS_MS.length) return;
      if (type === 'movie' && plexRef.current?.found) return; // confirmed between attempts

      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        try {
          const params = new URLSearchParams({ title });
          if (year !== undefined) params.set('year', String(year));
          const url = `/api/plex/check?${params}${type === 'tv' ? '&type=tv' : ''}`;
          const r = await fetch(url);
          if (!r.ok || cancelled) { attempt(index + 1); return; }
          const d: PlexStatus = await r.json();
          if (cancelled) return;

          setPlex(d); // always update — TV season badges benefit even from partial data

          if (type === 'movie' && d.found) {
            // Movie confirmed in Plex — fire callback and stop retrying
            if (!plexCallbackSent.current) {
              plexCallbackSent.current = true;
              onPlexFound(title, year);
            }
            return;
          }
          attempt(index + 1); // not yet confirmed — schedule next attempt
        } catch {
          if (!cancelled) attempt(index + 1);
        }
      }, DELAYS_MS[index]);
    }

    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [forceInLibrary]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPlex =
    forceInLibrary ||
    (type === 'movie' ? plex?.found === true : allSeasonsInPlex);

  return (
    <div className="mt-2 rounded-xl border border-plex-border bg-plex-card overflow-hidden max-w-[600px]">
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
                {(reviews?.year ?? year) !== undefined ? `${reviews?.year ?? year} · ` : ''}{type === 'tv' ? 'TV Series' : 'Movie'}
                {reviews?.runtime ? ` · ${reviews.runtime}min` : ''}
                {reviews?.director ? ` · dir. ${reviews.director}` : ''}
              </p>
            </div>

            {/* Plex badge */}
            {plexState === 'loading' && !forceInLibrary ? (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">
                Checking Plex...
              </span>
            ) : showPlex ? (
              <span className="text-xs bg-green-900/60 text-green-400 border border-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
                On Plex ✓
              </span>
            ) : someSeasonsInPlex ? (
              <span className="text-xs bg-yellow-900/40 text-yellow-500 border border-yellow-700/50 px-2 py-0.5 rounded-full flex-shrink-0">
                Partially in library
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

          {/* Movie torrent availability — shown only when Plex doesn't have it */}
          {type === 'movie' && torrentState !== 'skipped' && !forceInLibrary && (
            <div className="mt-3">
              {torrentState === 'idle' ? null : torrentState === 'loading' ? (
                <span className="text-xs text-gray-600 animate-pulse">Checking availability...</span>
              ) : isDownloading ? (
                <span className="text-xs text-green-400">Downloading…</span>
              ) : torrentSummary ? (
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => { setDownloading(true); onDownload(title, year); }}
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
                      {torrentMeta.size}{torrentMeta.size && torrentMeta.seeders > 0 ? ' · ' : ''}{torrentMeta.seeders > 0 ? `${torrentMeta.seeders} seeders` : ''}
                    </span>
                  )}
                </div>
              ) : noSuitableQuality ? (
                <span className="text-xs text-gray-500">Not available in HD</span>
              ) : (
                <span className="text-xs text-gray-500">Not available to download</span>
              )}
            </div>
          )}

          {/* TV season picker — shown only when not on Plex and numberOfSeasons is known */}
          {type === 'tv' && !showPlex && numberOfSeasons && numberOfSeasons > 0 && (
            <div className="mt-3">
              {/* Season buttons — "All" first (hidden if any seasons owned), then S01 S02 … */}
              <div className="flex flex-wrap gap-1 mb-2">
                {/* All seasons button — hide if any seasons are already in Plex */}
                {seasonsInLibrary.size === 0 && (
                  <button
                    key={0}
                    onClick={() => handleSeasonSelect(0)}
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
                {Array.from({ length: numberOfSeasons }, (_, i) => i + 1).map((s) => {
                  const inPlex = seasonsInLibrary.has(s);
                  return inPlex ? (
                    // Season already in Plex — muted with ✓, not clickable
                    <span
                      key={s}
                      title={`Season ${s} is in your Plex library`}
                      className="text-xs px-2 py-1 rounded font-medium
                        bg-green-900/30 text-green-600 border border-green-800/50
                        cursor-default select-none"
                    >
                      ✓ S{String(s).padStart(2, '0')}
                    </span>
                  ) : (
                    <button
                      key={s}
                      onClick={() => handleSeasonSelect(s)}
                      disabled={tvTorrentState === 'loading' && selectedSeason === s}
                      className={`text-xs px-2 py-1 rounded font-medium transition-colors
                        ${selectedSeason === s
                          ? 'bg-plex-accent text-black'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                        }
                        disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      S{String(s).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>

              {/* TV torrent state below season row */}
              {selectedSeason !== null && (
                <div>
                  {tvTorrentState === 'loading' ? (
                    <span className="text-xs text-gray-600 animate-pulse">Checking availability...</span>
                  ) : tvTorrentState === 'found' ? (
                    isDownloading ? (
                      <span className="text-xs text-green-400">Downloading…</span>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => { setTvDownloading(true); onDownload(title, year); }}
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
                          {/* Inline dropdown when multiple options exist; static text otherwise */}
                          {tvTorrentOptions && tvTorrentOptions.length > 1 ? (
                            <select
                              value={selectedOptionIdx}
                              onChange={(e) => handleOptionSelect(Number(e.target.value))}
                              className="text-xs bg-gray-800 text-gray-400 border border-gray-700
                                rounded px-2 py-1 cursor-pointer hover:border-gray-500
                                focus:outline-none focus:border-plex-accent"
                            >
                              {tvTorrentOptions.map((opt, i) => (
                                <option key={i} value={i}>
                                  {(opt.sizeBytes / 1e9).toFixed(1)} GB · {opt.seeders} seeders
                                </option>
                              ))}
                            </select>
                          ) : torrentMeta ? (
                            <span className="text-xs text-gray-600">
                              {torrentMeta.size}{torrentMeta.size && torrentMeta.seeders > 0 ? ' · ' : ''}{torrentMeta.seeders > 0 ? `${torrentMeta.seeders} seeders` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  ) : tvTorrentState === 'nopack' ? (
                    <span className="text-xs text-gray-500">
                      {selectedSeason === 0
                        ? "Complete series pack isn\u2019t available yet"
                        : `Season ${selectedSeason} isn\u2019t available as a complete pack yet`}
                    </span>
                  ) : tvTorrentState === 'notfound' || tvTorrentState === 'error' ? (
                    <span className="text-xs text-gray-500">Not available to download</span>
                  ) : null}
                </div>
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
