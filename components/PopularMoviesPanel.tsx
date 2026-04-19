'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { YtsMovieEntry, YtsPopularResult, YtsPopularSortBy } from '@/types';
import PopularMovieCard from './PopularMovieCard';

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
] as const;

// Top-level tabs. The Newest tab's actual sort_by is driven by NEWEST_SUB_SORTS
// below; this value (`year`) is only used to identify the tab and as its
// initial sub-sort.
const SORT_OPTIONS: Array<{ value: 'download_count' | 'year'; label: string }> = [
  { value: 'download_count', label: 'Most Downloaded' },
  { value: 'year', label: 'Newest' },
];

const YEAR_OPTIONS: Array<{ value: number; label: string }> = (() => {
  const cy = new Date().getFullYear();
  return [
    { value: 0, label: 'Any year' },
    { value: cy - 3, label: `${cy - 3}+` },
    { value: cy - 5, label: `${cy - 5}+` },
    { value: cy - 10, label: `${cy - 10}+` },
    { value: 2000, label: '2000+' },
  ];
})();

// Newest tab's secondary sort. 'year' is the tab's implicit default (most recent
// releases first); 'rating' lets the user re-rank the same newest-first slice by
// review score, which is more useful than download_count here because recent
// releases haven't accumulated downloads yet.
const NEWEST_SUB_SORTS: Array<{ value: YtsPopularSortBy; label: string }> = [
  { value: 'year', label: 'Sort by year' },
  { value: 'rating', label: 'Sort by popularity' },
];

// The Newest tab is implicitly scoped to the last few years. Without this
// the 'rating' sort surfaces all-time high-rated concerts/kids titles from
// any decade, which defeats the point of a "Newest" tab.
const NEWEST_MIN_YEAR = new Date().getFullYear() - 3;

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;

export default function PopularMoviesPanel() {
  const [activeTab, setActiveTab] = useState<'download_count' | 'year'>('download_count');
  const [newestSort, setNewestSort] = useState<YtsPopularSortBy>('year');
  const [genre, setGenre] = useState<string>('');
  const [minYear, setMinYear] = useState<number>(0);
  const [page, setPage] = useState(1);

  const sortBy: YtsPopularSortBy = activeTab === 'download_count' ? 'download_count' : newestSort;

  const handleTabChange = (next: 'download_count' | 'year') => {
    if (next === activeTab) return;
    setActiveTab(next);
    setGenre('');
    setMinYear(0);
    setNewestSort('year');
  };

  const [movies, setMovies] = useState<YtsMovieEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [sortBy, genre, minYear]);

  useEffect(() => () => {
    activeControllerRef.current?.abort();
  }, []);

  const fetchKey = `${sortBy}|${genre}|${minYear}|${page}`;

  const loadPage = useCallback(
    async () => {
      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('sort_by', sortBy);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (activeTab === 'download_count') {
        if (genre) params.set('genre', genre);
        if (minYear > 0) params.set('minimum_year', String(minYear));
      } else {
        params.set('minimum_year', String(NEWEST_MIN_YEAR));
      }
      try {
        const res = await fetch(`/api/yts/popular?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as YtsPopularResult;
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setMovies(data.movies);
        setTotalCount(data.totalCount);
      } catch (err) {
        if (
          controller.signal.aborted
          || requestId !== requestIdRef.current
          || (err instanceof DOMException && err.name === 'AbortError')
        ) {
          return;
        }
        setError('YTS may be unavailable. Try again in a moment.');
      } finally {
        if (requestId === requestIdRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    },
    [sortBy, genre, minYear, page, activeTab],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void loadPage();
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = from === 0 ? 0 : Math.min(from - 1 + movies.length, totalCount);

  const retry = () => {
    void loadPage();
  };

  const selectClass =
    'rounded-lg bg-plex-card border border-plex-border text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-plex-accent';

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex rounded-lg bg-plex-card border border-plex-border overflow-hidden">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => handleTabChange(o.value)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                activeTab === o.value
                  ? 'bg-plex-accent text-black font-medium'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {activeTab === 'year' ? (
          <select
            value={newestSort}
            onChange={(e) => setNewestSort(e.target.value as YtsPopularSortBy)}
            className={selectClass}
            aria-label="Newest sort order"
          >
            {NEWEST_SUB_SORTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className={selectClass}
              aria-label="Filter by genre"
            >
              <option value="">All genres</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            <select
              value={minYear}
              onChange={(e) => setMinYear(Number(e.target.value))}
              className={selectClass}
              aria-label="Minimum release year"
            >
              {YEAR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        )}

        <div className="ml-auto text-xs text-gray-400">
          {totalCount > 0 && !error
            ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${totalCount.toLocaleString()}`
            : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-plex-border bg-plex-card p-6 text-center">
          <p className="text-gray-300 mb-3">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="px-4 py-2 rounded-lg bg-plex-accent text-black text-sm font-medium hover:bg-plex-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      ) : (
        <div
          key={fetchKey}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
        >
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="rounded-lg overflow-hidden bg-plex-card border border-plex-border"
                >
                  <div className="aspect-[2/3] bg-gray-800 animate-pulse" />
                  <div className="p-2 space-y-2">
                    <div className="h-3 bg-gray-700 rounded animate-pulse w-3/4" />
                    <div className="h-2 bg-gray-800 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))
            : movies.map((m) => <PopularMovieCard key={m.ytsId} movie={m} />)}
        </div>
      )}

      {!error && totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg bg-plex-card border border-plex-border text-sm text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-plex-accent transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-plex-card border border-plex-border text-sm text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-plex-accent transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
