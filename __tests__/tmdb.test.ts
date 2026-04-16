import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMovieDetails, getTvDetails, resolveMovieLookup } from '@/lib/tmdb';

// Mock lib/config so TMDB_API_KEY is always "test-key"
vi.mock('@/lib/config', () => ({ cfg: () => 'test-key' }));

const MOVIE_SEARCH_HIT = {
  id: 1396,
  title: 'Breaking Bad',
  release_date: '2008-01-20',
  vote_average: 9.5,
  overview: 'A chemistry teacher turns to cooking meth.',
  poster_path: '/poster.jpg',
  genre_ids: [18, 80],
};

const MOVIE_DETAIL = {
  id: 1396,
  title: 'Breaking Bad',
  vote_average: 9.5,
  overview: 'A chemistry teacher turns to cooking meth.',
  poster_path: '/poster.jpg',
  runtime: 47,
  genres: [{ id: 18, name: 'Drama' }],
  credits: { crew: [{ job: 'Director', name: 'Vince Gilligan' }] },
};

const TV_SEARCH_HIT = {
  id: 1396,
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  vote_average: 9.5,
  overview: 'A chemistry teacher turns to cooking meth.',
  poster_path: '/poster.jpg',
  genre_ids: [18],
};

const TV_DETAIL = {
  id: 1396,
  name: 'Breaking Bad',
  vote_average: 9.5,
  overview: 'A chemistry teacher turns to cooking meth.',
  poster_path: '/poster.jpg',
  number_of_seasons: 5,
  seasons: [
    { season_number: 0, episode_count: 1 },  // Specials — filtered out
    { season_number: 1, episode_count: 7 },
    { season_number: 2, episode_count: 13 },
    { season_number: 3, episode_count: 13 },
    { season_number: 4, episode_count: 13 },
    { season_number: 5, episode_count: 16 },
  ],
  genres: [{ id: 18, name: 'Drama' }],
};

function mockFetch(...responses: Array<{ ok: boolean; body?: unknown }>) {
  let i = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.ok, json: async () => r.body } as Response;
  });
}

beforeEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// getMovieDetails()
// ---------------------------------------------------------------------------
describe('getMovieDetails()', () => {
  it('returns metadata when year search succeeds', async () => {
    mockFetch(
      { ok: true, body: { results: [MOVIE_SEARCH_HIT] } },
      { ok: true, body: MOVIE_DETAIL },
    );
    const result = await getMovieDetails('Breaking Bad', 2008);
    expect(result.tmdbScore).toBe(95);
    expect(result.director).toBe('Vince Gilligan');
    expect(result.runtime).toBe(47);
    expect(result.genres).toContain('Drama');
  });

  it('falls back to year-free search when year search returns empty', async () => {
    mockFetch(
      { ok: true, body: { results: [] } },          // year-qualified → empty
      { ok: true, body: { results: [MOVIE_SEARCH_HIT] } }, // fallback → hit
      { ok: true, body: MOVIE_DETAIL },
    );
    const result = await getMovieDetails('Breaking Bad', 2023); // wrong year
    expect(result.tmdbScore).toBe(95);
    expect(result.tmdbId).toBe(1396);
  });

  it('returns empty object when both searches fail', async () => {
    mockFetch(
      { ok: true, body: { results: [] } },
      { ok: true, body: { results: [] } },
    );
    const result = await getMovieDetails('Unknown Movie', 2099);
    expect(result).toEqual({});
  });

  it('returns empty when no year provided and search fails', async () => {
    mockFetch({ ok: true, body: { results: [] } });
    const result = await getMovieDetails('Unknown Movie');
    expect(result).toEqual({});
  });

  it('returns partial data if detail fetch fails', async () => {
    mockFetch(
      { ok: true, body: { results: [MOVIE_SEARCH_HIT] } },
      { ok: false, body: null },
    );
    const result = await getMovieDetails('Breaking Bad', 2008);
    expect(result.tmdbScore).toBe(95);
    expect(result.overview).toBeDefined();
    expect(result.director).toBeUndefined(); // no credits in partial data
  });
});

describe('resolveMovieLookup()', () => {
  it('returns ambiguity candidates when multiple exact titles exist', async () => {
    mockFetch({
      ok: true,
      body: {
        results: [
          { ...MOVIE_SEARCH_HIT, id: 1, title: 'Dragonfly', release_date: '2002-02-22' },
          { ...MOVIE_SEARCH_HIT, id: 2, title: 'Dragonfly', release_date: '2025-03-14' },
          { ...MOVIE_SEARCH_HIT, id: 3, title: 'Dragonfly Boy', release_date: '2024-01-01' },
        ],
      },
    });

    const result = await resolveMovieLookup('Dragonfly');
    expect(result).toEqual({
      kind: 'ambiguous',
      candidates: [
        { title: 'Dragonfly', year: 2002, tmdbId: 1, overview: MOVIE_SEARCH_HIT.overview, poster: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
        { title: 'Dragonfly', year: 2025, tmdbId: 2, overview: MOVIE_SEARCH_HIT.overview, poster: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
      ],
    });
  });

  it('resolves a single exact match and returns canonical recommendation data', async () => {
    mockFetch(
      { ok: true, body: { results: [{ ...MOVIE_SEARCH_HIT, title: 'Send Help', release_date: '2026-01-01' }] } },
      { ok: true, body: { ...MOVIE_DETAIL, id: 999, title: 'Send Help' } },
    );

    const result = await resolveMovieLookup('Send Help');
    expect(result).toEqual({
      kind: 'resolved',
      recommendation: { title: 'Send Help', year: 2026, type: 'movie' },
      details: {
        tmdbScore: 95,
        overview: MOVIE_DETAIL.overview,
        poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        genres: ['Drama'],
        runtime: 47,
        director: 'Vince Gilligan',
        tmdbId: 999,
        year: 2026,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// getTvDetails()
// ---------------------------------------------------------------------------
describe('getTvDetails()', () => {
  it('returns TV metadata with correct season count', async () => {
    mockFetch(
      { ok: true, body: { results: [TV_SEARCH_HIT] } },
      { ok: true, body: TV_DETAIL },
    );
    const result = await getTvDetails('Breaking Bad', 2008);
    expect(result.tmdbScore).toBe(95);
    expect(result.numberOfSeasons).toBe(5); // season 0 (Specials) excluded
    expect(result.genres).toContain('Drama');
  });

  it('falls back to year-free search when year search returns empty', async () => {
    mockFetch(
      { ok: true, body: { results: [] } },           // year-qualified → empty
      { ok: true, body: { results: [TV_SEARCH_HIT] } }, // fallback → hit
      { ok: true, body: TV_DETAIL },
    );
    const result = await getTvDetails('Breaking Bad', 2023); // wrong year
    expect(result.tmdbScore).toBe(95);
    expect(result.numberOfSeasons).toBe(5);
  });

  it('excludes specials (season_number=0) from season count', async () => {
    mockFetch(
      { ok: true, body: { results: [TV_SEARCH_HIT] } },
      { ok: true, body: TV_DETAIL },
    );
    const result = await getTvDetails('Breaking Bad', 2008);
    expect(result.numberOfSeasons).toBe(5); // not 6
  });

  it('excludes unaired seasons (episode_count=0) from season count', async () => {
    const detailWithUnaired = {
      ...TV_DETAIL,
      number_of_seasons: 3, // TMDB says 3
      seasons: [
        { season_number: 1, episode_count: 8 },
        { season_number: 2, episode_count: 8 },
        { season_number: 3, episode_count: 0 }, // announced but unaired
      ],
    };
    mockFetch(
      { ok: true, body: { results: [TV_SEARCH_HIT] } },
      { ok: true, body: detailWithUnaired },
    );
    const result = await getTvDetails('Severance', 2022);
    expect(result.numberOfSeasons).toBe(2); // not 3
  });

  it('returns empty object when all searches fail', async () => {
    mockFetch(
      { ok: true, body: { results: [] } },
      { ok: true, body: { results: [] } },
    );
    const result = await getTvDetails('Unknown Show', 2099);
    expect(result).toEqual({});
  });
});
