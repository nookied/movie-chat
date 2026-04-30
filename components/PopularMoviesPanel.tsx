'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { YtsMovieEntry, YtsPopularResult, YtsPopularSortBy } from '@/types';
import { YTS_GENRES } from '@/lib/ytsGenres';
import PopularMovieCard from './PopularMovieCard';

type PopularTab = 'download_count' | 'year';

// Top-level tabs. The Newest tab's actual sort_by is driven by NEWEST_SUB_SORTS
// below; this value (`year`) is only used to identify the tab and as its
// initial sub-sort.
const SORT_OPTIONS: Array<{ value: PopularTab; label: string }> = [
  { value: 'download_count', label: 'Most Downloaded' },
  { value: 'year', label: 'Newest' },
];

// 7 year-range options: open top (2025+), 5 closed 5-year buckets, open bottom (before 2000).
// topStart is the nearest multiple-of-5 at or below the current year, so the top bucket
// always starts on a round year regardless of when the page loads.
const YEAR_OPTIONS: Array<{ value: string; label: string; min?: number; max?: number }> = (() => {
  const cy = new Date().getFullYear();
  const top = Math.floor(cy / 5) * 5;
  const opts: Array<{ value: string; label: string; min?: number; max?: number }> = [
    { value: '', label: 'Any year' },
    { value: `${top}-`, label: `${top} and later`, min: top },
  ];
  for (let i = 0; i < 5; i++) {
    const end = top - 5 * i - 1;
    const start = end - 4;
    opts.push({ value: `${start}-${end}`, label: `${start}–${end}`, min: start, max: end });
  }
  const bottomMax = top - 26; // e.g. 1999 when top=2025
  opts.push({ value: `-${bottomMax}`, label: `Before ${bottomMax + 1}`, max: bottomMax });
  return opts;
})();

// Newest tab's secondary sort. 'year' is the tab's implicit default (most recent
// releases first); 'seeds' re-ranks by current seeders (real-time popularity proxy);
// 'rating' re-ranks by IMDb score.
const NEWEST_SUB_SORTS: Array<{ value: YtsPopularSortBy; label: string }> = [
  { value: 'year', label: 'Sort by year' },
  { value: 'seeds', label: 'Sort by popularity' },
  { value: 'rating', label: 'Sort by rating' },
];

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;
const SELECT_CLASS =
  'h-9 min-w-0 rounded-lg bg-plex-card border border-plex-border text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-plex-accent';
const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4';

// The Newest tab is implicitly scoped to the last few years. Without this
// the 'rating' and 'seeds' sorts surface all-time results from any decade,
// which defeats the point of a "Newest" tab.
function newestMinYear(): number {
  return new Date().getFullYear() - 3;
}

function buildPopularMoviesParams({
  activeTab,
  genre,
  page,
  sortBy,
  yearValue,
}: {
  activeTab: PopularTab;
  genre: string;
  page: number;
  sortBy: YtsPopularSortBy;
  yearValue: string;
}) {
  const params = new URLSearchParams({
    sort_by: sortBy,
    page: String(page),
    limit: String(PAGE_SIZE),
  });

  if (activeTab === 'download_count') {
    if (genre) params.set('genre', genre);
    const yearOpt = YEAR_OPTIONS.find((o) => o.value === yearValue);
    if (yearOpt?.min !== undefined) params.set('minimum_year', String(yearOpt.min));
    if (yearOpt?.max !== undefined) params.set('maximum_year', String(yearOpt.max));
  } else {
    params.set('minimum_year', String(newestMinYear()));
  }

  return params;
}

function PopularTabs({
  activeTab,
  onChange,
}: {
  activeTab: PopularTab;
  onChange: (value: PopularTab) => void;
}) {
  return (
    <div className="grid w-full shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-plex-border bg-plex-card sm:flex sm:w-auto">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={activeTab === option.value}
          onClick={() => onChange(option.value)}
          className={`h-9 min-w-0 px-3 text-sm transition-colors ${
            activeTab === option.value
              ? 'bg-plex-accent font-medium text-black'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NewestSortSelect({
  newestSort,
  onChange,
}: {
  newestSort: YtsPopularSortBy;
  onChange: (value: YtsPopularSortBy) => void;
}) {
  return (
    <select
      value={newestSort}
      onChange={(e) => onChange(e.target.value as YtsPopularSortBy)}
      className={`${SELECT_CLASS} w-full sm:w-auto`}
      aria-label="Newest sort order"
    >
      {NEWEST_SUB_SORTS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function DownloadedFilters({
  genre,
  onGenreChange,
  onYearValueChange,
  yearValue,
}: {
  genre: string;
  onGenreChange: (value: string) => void;
  onYearValueChange: (value: string) => void;
  yearValue: string;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
      <select
        value={genre}
        onChange={(e) => onGenreChange(e.target.value)}
        className={`${SELECT_CLASS} w-full sm:w-auto`}
        aria-label="Filter by genre"
      >
        <option value="">All genres</option>
        {YTS_GENRES.map((genreOption) => (
          <option key={genreOption} value={genreOption}>{genreOption}</option>
        ))}
      </select>

      <select
        value={yearValue}
        onChange={(e) => onYearValueChange(e.target.value)}
        className={`${SELECT_CLASS} w-full sm:w-auto`}
        aria-label="Release year range"
      >
        {YEAR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function ResultCount({
  error,
  from,
  to,
  totalCount,
}: {
  error: string | null;
  from: number;
  to: number;
  totalCount: number;
}) {
  return (
    <div className="mb-3 flex h-4 justify-end">
      <span className="text-xs text-gray-400">
        {totalCount > 0 && !error
          ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${totalCount.toLocaleString()}`
          : null}
      </span>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: PAGE_SIZE }, (_, i) => (
        <div
          key={`skeleton-${i}`}
          className="overflow-hidden rounded-lg border border-plex-border bg-plex-card"
        >
          <div className="aspect-[2/3] animate-pulse bg-gray-800" />
          <div className="p-2">
            <div className="mb-1 h-11">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-700" />
            </div>
            <div className="h-2 w-1/2 animate-pulse rounded bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PopularMoviesPanel() {
  const [activeTab, setActiveTab] = useState<PopularTab>('download_count');
  const [newestSort, setNewestSort] = useState<YtsPopularSortBy>('year');
  const [genre, setGenre] = useState<string>('');
  const [yearValue, setYearValue] = useState<string>('');
  const [page, setPage] = useState(1);

  const sortBy: YtsPopularSortBy = activeTab === 'download_count' ? 'download_count' : newestSort;

  const handleTabChange = (next: PopularTab) => {
    if (next === activeTab) return;
    setActiveTab(next);
    setGenre('');
    setYearValue('');
    setNewestSort('year');
    setPage(1);
  };

  const handleGenreChange = (next: string) => {
    setGenre(next);
    setPage(1);
  };

  const handleYearValueChange = (next: string) => {
    setYearValue(next);
    setPage(1);
  };

  const handleNewestSortChange = (next: YtsPopularSortBy) => {
    setNewestSort(next);
    setPage(1);
  };

  const [movies, setMovies] = useState<YtsMovieEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    activeControllerRef.current?.abort();
  }, []);

  const loadPage = useCallback(
    async () => {
      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      const params = buildPopularMoviesParams({ activeTab, genre, page, sortBy, yearValue });

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
    [sortBy, genre, yearValue, page, activeTab],
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
  // totalCount from fetchPopularMovies can be a bounded estimate when filtered
  // paging terminates early — clamp `to` so the counter never reads "21 of 20".
  const to = from === 0 ? 0 : Math.max(from, Math.min(from - 1 + movies.length, totalCount));
  const showEmptyState = !loading && !error && movies.length === 0;

  const retry = () => {
    void loadPage();
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <PopularTabs activeTab={activeTab} onChange={handleTabChange} />

        {activeTab === 'year' ? (
          <NewestSortSelect
            newestSort={newestSort}
            onChange={handleNewestSortChange}
          />
        ) : (
          <DownloadedFilters
            genre={genre}
            onGenreChange={handleGenreChange}
            onYearValueChange={handleYearValueChange}
            yearValue={yearValue}
          />
        )}
      </div>

      <ResultCount error={error} from={from} to={to} totalCount={totalCount} />

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
      ) : showEmptyState ? (
        <div className="rounded-lg border border-plex-border bg-plex-card p-10 text-center">
          <p className="text-gray-300 mb-1">No matches for this filter.</p>
          <p className="text-gray-500 text-sm">Try a different genre or year range.</p>
        </div>
      ) : loading ? (
        <LoadingGrid />
      ) : (
        <div className={GRID_CLASS}>
          {movies.map((m) => <PopularMovieCard key={m.ytsId} movie={m} />)}
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
