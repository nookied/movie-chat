/**
 * Integration tests for app/api/reviews/route.ts.
 * Focus: allSettled merge semantics — one provider failing does not block the
 * other — and type-aware dispatch (movie vs TV series).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const getMovieDetailsMock = vi.fn();
const getTvDetailsMock = vi.fn();
vi.mock('@/lib/tmdb', () => ({
  getMovieDetails: getMovieDetailsMock,
  getTvDetails: getTvDetailsMock,
}));

const getOmdbRatingsMock = vi.fn();
vi.mock('@/lib/omdb', () => ({ getOmdbRatings: getOmdbRatingsMock }));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function getReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/reviews/route').GET;

beforeEach(async () => {
  vi.resetModules();
  [getMovieDetailsMock, getTvDetailsMock, getOmdbRatingsMock].forEach((m) => m.mockReset());
  const mod = await import('@/app/api/reviews/route');
  GET = mod.GET;
});

describe('GET /api/reviews', () => {
  it('returns 400 when title is missing', async () => {
    const res = await GET(getReq('http://localhost/api/reviews'));
    expect(res.status).toBe(400);
  });

  it('merges TMDB and OMDB data for a movie', async () => {
    getMovieDetailsMock.mockResolvedValue({ tmdbScore: 8.5, overview: 'great' });
    getOmdbRatingsMock.mockResolvedValue({ imdbScore: '8.7', rtScore: '94%' });
    const res = await GET(getReq('http://localhost/api/reviews?title=Dune&year=2021'));
    const body = await res.json();
    expect(body.tmdbScore).toBe(8.5);
    expect(body.imdbScore).toBe('8.7');
    expect(body.rtScore).toBe('94%');
  });

  it('returns TMDB data even when OMDB fails (allSettled)', async () => {
    getMovieDetailsMock.mockResolvedValue({ tmdbScore: 7.0 });
    getOmdbRatingsMock.mockRejectedValue(new Error('OMDB rate limit'));
    const res = await GET(getReq('http://localhost/api/reviews?title=X'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tmdbScore).toBe(7.0);
    expect(body.imdbScore).toBeUndefined();
  });

  it('returns OMDB data even when TMDB fails', async () => {
    getMovieDetailsMock.mockRejectedValue(new Error('TMDB 500'));
    getOmdbRatingsMock.mockResolvedValue({ rtScore: '88%' });
    const res = await GET(getReq('http://localhost/api/reviews?title=X'));
    expect(res.status).toBe(200);
    expect((await res.json()).rtScore).toBe('88%');
  });

  it('returns empty object when both providers fail', async () => {
    getMovieDetailsMock.mockRejectedValue(new Error('TMDB down'));
    getOmdbRatingsMock.mockRejectedValue(new Error('OMDB down'));
    const res = await GET(getReq('http://localhost/api/reviews?title=X'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('dispatches to getTvDetails when type=tv', async () => {
    getTvDetailsMock.mockResolvedValue({ numberOfSeasons: 4 });
    getOmdbRatingsMock.mockResolvedValue({});
    await GET(getReq('http://localhost/api/reviews?title=Succession&type=tv'));
    expect(getTvDetailsMock).toHaveBeenCalled();
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it('passes "series" type marker to OMDB for TV', async () => {
    getTvDetailsMock.mockResolvedValue({});
    getOmdbRatingsMock.mockResolvedValue({});
    await GET(getReq('http://localhost/api/reviews?title=Succession&year=2018&type=tv'));
    expect(getOmdbRatingsMock).toHaveBeenCalledWith('Succession', 2018, 'series');
  });
});
