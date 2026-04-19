/**
 * Unit tests for fetchPopularMovies in lib/yts.ts.
 * - URL params built correctly for each option
 * - Response mapping from raw YTS schema to YtsMovieEntry
 * - Error + missing-field handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPopularMovies } from '@/lib/yts';

interface FetchCapture {
  url?: string;
  init?: RequestInit;
}

function mockYtsPopular(payload: unknown, opts: { ok?: boolean; status?: number } = {}): FetchCapture {
  const capture: FetchCapture = {};
  vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    capture.url = typeof input === 'string' ? input : input.toString();
    capture.init = init;
    return { ok: opts.ok ?? true, status: opts.status ?? 200, json: async () => payload } as Response;
  });
  return capture;
}

beforeEach(() => vi.restoreAllMocks());

describe('fetchPopularMovies() — URL params', () => {
  it('defaults to sort_by=download_count, order_by=desc, page=1, limit=20', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies();
    const url = new URL(capture.url!);
    expect(url.searchParams.get('sort_by')).toBe('download_count');
    expect(url.searchParams.get('order_by')).toBe('desc');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('genre')).toBeNull();
    expect(url.searchParams.get('minimum_rating')).toBeNull();
  });

  it('forwards sortBy, page, limit, genre, minimumRating', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies({ sortBy: 'rating', page: 3, limit: 40, genre: 'Horror', minimumRating: 7 });
    const url = new URL(capture.url!);
    expect(url.searchParams.get('sort_by')).toBe('rating');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('limit')).toBe('40');
    expect(url.searchParams.get('genre')).toBe('Horror');
    expect(url.searchParams.get('minimum_rating')).toBe('7');
  });

  it('omits minimum_rating when zero', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies({ minimumRating: 0 });
    expect(new URL(capture.url!).searchParams.get('minimum_rating')).toBeNull();
  });

  it('omits genre when not provided', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies({ sortBy: 'seeds' });
    expect(new URL(capture.url!).searchParams.get('genre')).toBeNull();
  });

  it('over-fetches when minimumYear is set so filter has enough results', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies({ limit: 20, minimumYear: 2023 });
    expect(new URL(capture.url!).searchParams.get('limit')).toBe('50');
  });

  it('does not over-fetch when minimumYear is unset', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies({ limit: 20 });
    expect(new URL(capture.url!).searchParams.get('limit')).toBe('20');
  });
});

describe('fetchPopularMovies() — minimumYear filter', () => {
  function movie(id: number, year: number) {
    return { id, title: `M${id}`, year };
  }

  it('drops movies older than minimumYear', async () => {
    mockYtsPopular({
      data: {
        movie_count: 100,
        movies: [movie(1, 2025), movie(2, 1980), movie(3, 2024), movie(4, 1999)],
      },
    });
    const result = await fetchPopularMovies({ minimumYear: 2023, limit: 20 });
    expect(result.movies.map((m) => m.year)).toEqual([2025, 2024]);
  });

  it('scales totalCount by the filter hit-rate for sensible pagination', async () => {
    mockYtsPopular({
      data: {
        movie_count: 10000,
        movies: [movie(1, 2025), movie(2, 1980), movie(3, 2024), movie(4, 1999)],
      },
    });
    const result = await fetchPopularMovies({ minimumYear: 2023, limit: 20 });
    expect(result.totalCount).toBe(5000);
  });

  it('caps returned movies at limit even after filtering', async () => {
    const movies = Array.from({ length: 50 }, (_, i) => movie(i, 2025));
    mockYtsPopular({ data: { movie_count: 50, movies } });
    const result = await fetchPopularMovies({ minimumYear: 2023, limit: 20 });
    expect(result.movies).toHaveLength(20);
  });

  it('leaves totalCount unchanged when minimumYear is not provided', async () => {
    mockYtsPopular({
      data: {
        movie_count: 10000,
        movies: [movie(1, 1980), movie(2, 2025)],
      },
    });
    const result = await fetchPopularMovies({ limit: 20 });
    expect(result.totalCount).toBe(10000);
  });
});

describe('fetchPopularMovies() — response mapping', () => {
  it('maps YTS fields to YtsMovieEntry shape', async () => {
    mockYtsPopular({
      data: {
        movie_count: 1,
        movies: [
          {
            id: 42,
            title: 'Inception',
            year: 2010,
            rating: 8.8,
            imdb_code: 'tt1375666',
            genres: ['Action', 'Sci-Fi'],
            large_cover_image: 'https://example.com/inception.jpg',
            synopsis: 'A thief who steals corporate secrets...',
            download_count: 12345,
            torrents: [
              { hash: 'abc', quality: '1080p', type: 'bluray', video_codec: 'x265', size: '2.0 GB', seeds: 100 },
            ],
          },
        ],
      },
    });

    const result = await fetchPopularMovies();
    expect(result.totalCount).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0]).toEqual({
      ytsId: 42,
      title: 'Inception',
      year: 2010,
      imdbCode: 'tt1375666',
      imdbRating: 8.8,
      genres: ['Action', 'Sci-Fi'],
      poster: 'https://example.com/inception.jpg',
      synopsis: 'A thief who steals corporate secrets...',
      downloadCount: 12345,
      torrents: [
        { hash: 'abc', quality: '1080p', type: 'bluray', codec: 'x265', size: '2.0 GB', seeders: 100 },
      ],
    });
  });

  it('fills safe defaults when optional fields are missing', async () => {
    mockYtsPopular({
      data: {
        movie_count: 1,
        movies: [{ id: 1, title: 'Bare', year: 2000 }],
      },
    });

    const result = await fetchPopularMovies();
    expect(result.movies[0]).toMatchObject({
      imdbCode: '',
      imdbRating: 0,
      genres: [],
      poster: '',
      synopsis: '',
      downloadCount: 0,
      torrents: [],
    });
  });

  it('returns empty movies array when data.movies is missing', async () => {
    mockYtsPopular({ data: { movie_count: 0 } });
    const result = await fetchPopularMovies();
    expect(result.movies).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('echoes requested page and limit in the result', async () => {
    mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    const result = await fetchPopularMovies({ page: 5, limit: 10 });
    expect(result.page).toBe(5);
    expect(result.limit).toBe(10);
  });
});

describe('fetchPopularMovies() — errors and cache', () => {
  it('throws on non-OK HTTP response', async () => {
    mockYtsPopular({}, { ok: false, status: 503 });
    await expect(fetchPopularMovies()).rejects.toThrow(/503/);
  });

  it('passes next.revalidate cache directive', async () => {
    const capture = mockYtsPopular({ data: { movies: [], movie_count: 0 } });
    await fetchPopularMovies();
    const init = capture.init as RequestInit & { next?: { revalidate?: number } };
    expect(init?.next?.revalidate).toBe(14400);
  });
});
