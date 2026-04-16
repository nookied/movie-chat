'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TvTorrentResult, TvTorrentOption } from '@/lib/eztv';
import { PlexStatus, Recommendation, ReviewData, TorrentOption } from '@/types';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function toSyntheticTorrent(
  movieTitle: string,
  opts: { quality?: string; sizeBytes?: number; seeders?: number; magnet?: string },
): TorrentOption {
  return {
    quality: opts.quality ?? '1080p',
    type: 'web',
    codec: '',
    size: opts.sizeBytes ? `${(opts.sizeBytes / 1e9).toFixed(1)} GB` : '',
    seeders: opts.seeders ?? 0,
    magnet: opts.magnet ?? '',
    movieTitle,
  };
}

export type CheckState = 'idle' | 'loading' | 'done' | 'skipped' | 'error';
export type TvTorrentState = 'idle' | 'loading' | 'found' | 'nopack' | 'notfound' | 'error';

interface Options {
  forceInLibrary: boolean;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onNotFound?: (title: string) => void;
  onPlexFound: (title: string, year?: number) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number
  ) => void;
  onDownload: (title: string, year?: number) => Promise<boolean>;
  recommendation: Recommendation;
}

export function useRecommendationCardState({
  forceInLibrary,
  onDownload,
  onNoSuitableQuality,
  onNotFound,
  onPlexFound,
  onTorrentsReady,
  recommendation,
}: Options) {
  const { title, year, type } = recommendation;

  const [plexState, setPlexState] = useState<CheckState>('loading');
  const [reviewState, setReviewState] = useState<CheckState>('loading');
  const [torrentState, setTorrentState] = useState<CheckState>('idle');
  const [plex, setPlex] = useState<PlexStatus | null>(null);
  const [reviews, setReviews] = useState<ReviewData | null>(null);
  const [torrentSummary, setTorrentSummary] = useState('');
  const [noSuitableQuality, setNoSuitableQuality] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [torrentMeta, setTorrentMeta] = useState<{ size: string; seeders: number } | null>(null);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [tvTorrentState, setTvTorrentState] = useState<TvTorrentState>('idle');
  const [tvDownloading, setTvDownloading] = useState(false);
  const [tvTorrentOptions, setTvTorrentOptions] = useState<TvTorrentOption[] | null>(null);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);

  const plexCallbackSent = useRef(false);
  const torrentCallbackSent = useRef(false);
  const autoFetchedSeason = useRef(false);
  const plexRef = useRef<PlexStatus | null>(null);
  const seasonRequestControllerRef = useRef<AbortController | null>(null);
  const seasonRequestIdRef = useRef(0);

  useEffect(() => {
    plexRef.current = plex;
  }, [plex]);

  useEffect(() => () => {
    seasonRequestControllerRef.current?.abort();
  }, []);

  const runTvTorrentSearch = useCallback(async (season: number, updateUi: boolean) => {
    seasonRequestControllerRef.current?.abort();
    const controller = new AbortController();
    seasonRequestControllerRef.current = controller;
    const requestId = ++seasonRequestIdRef.current;

    try {
      const params = new URLSearchParams({
        title,
        type: 'tv',
        season: String(season),
      });
      if (year !== undefined) params.set('year', String(year));
      const response = await fetch(`/api/torrents/search?${params}`, { signal: controller.signal });
      const data: TvTorrentResult = await response.json();
      if (controller.signal.aborted || requestId !== seasonRequestIdRef.current) return;

      if (!data.found) {
        if (updateUi) setTvTorrentState('notfound');
        return;
      }

      if (data.noSeasonPack) {
        if (updateUi) setTvTorrentState('nopack');
        return;
      }

      if (updateUi) {
        setTvTorrentState('found');
        setTorrentMeta({
          size: data.sizeBytes ? `${(data.sizeBytes / 1e9).toFixed(1)} GB` : '',
          seeders: data.seeders ?? 0,
        });
        setTvTorrentOptions(data.options ?? null);
      }
      onTorrentsReady(title, year, [toSyntheticTorrent(title, data)], 'tv', season);
    } catch (error) {
      if (isAbortError(error)) return;
      if (updateUi && requestId === seasonRequestIdRef.current) {
        setTvTorrentState('error');
      }
    } finally {
      if (seasonRequestControllerRef.current === controller) {
        seasonRequestControllerRef.current = null;
      }
    }
  }, [onTorrentsReady, title, year]);

  const handleSeasonSelect = useCallback((season: number) => {
    setSelectedSeason(season);
    setTvTorrentState('loading');
    setTvDownloading(false);
    setTorrentMeta(null);
    setTvTorrentOptions(null);
    setSelectedOptionIdx(0);

    void runTvTorrentSearch(season, true);
  }, [runTvTorrentSearch]);

  const handleOptionSelect = useCallback((index: number) => {
    if (!tvTorrentOptions || selectedSeason === null) return;

    setSelectedOptionIdx(index);
    const option = tvTorrentOptions[index];
    setTorrentMeta({
      size: `${(option.sizeBytes / 1e9).toFixed(1)} GB`,
      seeders: option.seeders,
    });
    onTorrentsReady(title, year, [toSyntheticTorrent(title, option)], 'tv', selectedSeason);
  }, [onTorrentsReady, selectedSeason, title, tvTorrentOptions, year]);

  const fetchDefaultSeason = useCallback(async (season: number) => {
    try {
      await runTvTorrentSearch(season, false);
    } catch { /* silently ignore — user can still click a season button manually */ }
  }, [runTvTorrentSearch]);

  useEffect(() => {
    let cancelled = false;
    const reviewController = new AbortController();
    const availabilityController = new AbortController();
    const params = new URLSearchParams({ title });
    if (year !== undefined) params.set('year', String(year));
    const typeParam = type === 'tv' ? 'tv' : 'movie';

    fetch(`/api/reviews?${params}&type=${typeParam}`, { signal: reviewController.signal })
      .then((response) => response.json())
      .then((data: ReviewData) => {
        if (cancelled) return;
        setReviews(data);
        setReviewState('done');

        if (!data.poster && !data.overview && data.tmdbScore === undefined && !data.imdbScore) {
          onNotFound?.(title);
        }
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        if (!cancelled) setReviewState('error');
      });

    async function checkSequentially() {
      let plexFound = false;

      try {
        const plexUrl = type === 'tv'
          ? `/api/plex/check?${params}&type=tv`
          : `/api/plex/check?${params}`;
        const response = await fetch(plexUrl, { signal: availabilityController.signal });
        const data: PlexStatus = await response.json();
        if (cancelled) return;

        setPlex(data);
        setPlexState('done');
        plexFound = type === 'movie' ? data.found : false;

        if (type === 'movie' && data.found && !plexCallbackSent.current) {
          plexCallbackSent.current = true;
          onPlexFound(title, year);
        }
      } catch {
        if (cancelled) return;
        setPlexState('error');
      }

      if (cancelled || plexFound || type !== 'movie') {
        if (!cancelled) setTorrentState('skipped');
        return;
      }

      setTorrentState('loading');

      try {
        const response = await fetch(`/api/torrents/search?${params}`, { signal: availabilityController.signal });
        const data: { torrents: TorrentOption[]; noSuitableQuality: boolean } = await response.json();
        if (cancelled) return;

        setTorrentState('done');

        if (data.noSuitableQuality) {
          setNoSuitableQuality(true);
          if (!torrentCallbackSent.current) {
            torrentCallbackSent.current = true;
            onNoSuitableQuality(title, year);
          }
          return;
        }

        if (data.torrents?.length > 0) {
          const best = data.torrents[0];
          setTorrentSummary(`1080p · ${best.codec} · ${best.size}`);
          setTorrentMeta({ size: best.size, seeders: best.seeders });

          if (!torrentCallbackSent.current) {
            torrentCallbackSent.current = true;
            onTorrentsReady(title, year, data.torrents, 'movie');
          }
        }
      } catch (error) {
        if (isAbortError(error)) return;
        if (!cancelled) setTorrentState('error');
      }
    }

    void checkSequentially();

    return () => {
      cancelled = true;
      reviewController.abort();
      availabilityController.abort();
    };
  }, [onNoSuitableQuality, onNotFound, onPlexFound, onTorrentsReady, title, type, year]);

  const numberOfSeasons = reviews?.numberOfSeasons;
  const seasonsInLibrary = new Set(plex?.seasons ?? []);
  const allSeasonsInPlex =
    type === 'tv' &&
    plex?.found === true &&
    numberOfSeasons !== undefined &&
    seasonsInLibrary.size >= numberOfSeasons;
  const someSeasonsInPlex =
    type === 'tv' && plex?.found === true && seasonsInLibrary.size > 0 && !allSeasonsInPlex;
  const showPlex = forceInLibrary || (type === 'movie' ? plex?.found === true : allSeasonsInPlex);

  useEffect(() => {
    if (type === 'tv' && allSeasonsInPlex && !plexCallbackSent.current) {
      plexCallbackSent.current = true;
      onPlexFound(title, year);
    }
  }, [allSeasonsInPlex, onPlexFound, title, type, year]);

  useEffect(() => {
    if (!forceInLibrary) return;
    if (type === 'movie' && plexRef.current?.found) return;

    let cancelled = false;
    const timeoutIds = new Set<ReturnType<typeof setTimeout>>();
    const controllers = new Set<AbortController>();
    const retryDelays = [2 * 60_000, 10 * 60_000, 60 * 60_000];

    const scheduleAttempt = (index: number) => {
      if (cancelled || index >= retryDelays.length) return;
      if (type === 'movie' && plexRef.current?.found) return;

      const timeoutId = setTimeout(async () => {
        timeoutIds.delete(timeoutId);
        if (cancelled) return;

        const controller = new AbortController();
        controllers.add(controller);

        try {
          const params = new URLSearchParams({ title });
          if (year !== undefined) params.set('year', String(year));
          const url = `/api/plex/check?${params}${type === 'tv' ? '&type=tv' : ''}`;
          const response = await fetch(url, { signal: controller.signal });

          if (!response.ok || cancelled) {
            scheduleAttempt(index + 1);
            return;
          }

          const data: PlexStatus = await response.json();
          if (cancelled) return;

          setPlex(data);

          if (type === 'movie' && data.found) {
            if (!plexCallbackSent.current) {
              plexCallbackSent.current = true;
              onPlexFound(title, year);
            }
            return;
          }

          scheduleAttempt(index + 1);
        } catch (error) {
          if (isAbortError(error)) return;
          if (!cancelled) scheduleAttempt(index + 1);
        } finally {
          controllers.delete(controller);
        }
      }, retryDelays[index]);

      timeoutIds.add(timeoutId);
    };

    scheduleAttempt(0);

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
      controllers.forEach((controller) => controller.abort());
    };
  }, [forceInLibrary, onPlexFound, title, type, year]);

  useEffect(() => {
    if (type !== 'tv') return;
    if (!numberOfSeasons) return;
    if (plexState !== 'done' && plexState !== 'error') return;
    if (showPlex) return;
    if (selectedSeason !== null) return;
    if (autoFetchedSeason.current) return;

    let defaultSeason: number | undefined;
    for (let season = 1; season <= numberOfSeasons; season++) {
      if (!seasonsInLibrary.has(season)) {
        defaultSeason = season;
        break;
      }
    }
    if (defaultSeason === undefined) return;

    autoFetchedSeason.current = true;
    void fetchDefaultSeason(defaultSeason);
  }, [
    fetchDefaultSeason,
    numberOfSeasons,
    plexState,
    seasonsInLibrary,
    selectedSeason,
    showPlex,
    type,
  ]);

  const startMovieDownload = useCallback(async () => {
    setDownloading(true);
    const started = await onDownload(title, year);
    if (!started) setDownloading(false);
  }, [onDownload, title, year]);

  const startTvDownload = useCallback(async () => {
    setTvDownloading(true);
    const started = await onDownload(title, year);
    if (!started) setTvDownloading(false);
  }, [onDownload, title, year]);

  return {
    downloading,
    handleOptionSelect,
    handleSeasonSelect,
    noSuitableQuality,
    numberOfSeasons,
    plex,
    plexState,
    reviewState,
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
  };
}
