/**
 * Integration tests for app/api/yts/popular/route.ts.
 * Focus: param whitelisting, numeric clamping, and 502 on upstream failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const fetchPopularMock = vi.fn();
vi.mock('@/lib/yts', () => ({ fetchPopularMovies: fetchPopularMock }));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function getReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/yts/popular/route').GET;

const emptyResult = { movies: [], totalCount: 0, page: 1, limit: 20 };

beforeEach(async () => {
  vi.resetModules();
  fetchPopularMock.mockReset();
  fetchPopularMock.mockResolvedValue(emptyResult);
  const mod = await import('@/app/api/yts/popular/route');
  GET = mod.GET;
});

describe('GET /api/yts/popular — defaults', () => {
  it('calls fetchPopularMovies with defaults when no params are given', async () => {
    await GET(getReq('http://localhost/api/yts/popular'));
    expect(fetchPopularMock).toHaveBeenCalledWith({
      sortBy: 'download_count',
      limit: 20,
      page: 1,
      minimumRating: undefined,
      genre: undefined,
    });
  });

  it('returns the result payload as JSON', async () => {
    fetchPopularMock.mockResolvedValue({
      movies: [{ ytsId: 1, title: 'X', year: 2024 }],
      totalCount: 1,
      page: 1,
      limit: 20,
    });
    const res = await GET(getReq('http://localhost/api/yts/popular'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCount).toBe(1);
    expect(body.movies).toHaveLength(1);
  });
});

describe('GET /api/yts/popular — sort_by whitelist', () => {
  it('accepts whitelisted sort_by values', async () => {
    await GET(getReq('http://localhost/api/yts/popular?sort_by=rating'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'rating' }));
  });

  it('falls back to download_count when sort_by is not whitelisted', async () => {
    await GET(getReq('http://localhost/api/yts/popular?sort_by=bogus'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'download_count' }));
  });
});

describe('GET /api/yts/popular — numeric clamping', () => {
  it('clamps limit above 50 to 50', async () => {
    await GET(getReq('http://localhost/api/yts/popular?limit=999'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('clamps limit below 1 to default (20)', async () => {
    await GET(getReq('http://localhost/api/yts/popular?limit=0'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('floors non-integer limit', async () => {
    await GET(getReq('http://localhost/api/yts/popular?limit=12.7'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 12 }));
  });

  it('falls back to 1 when page is below 1', async () => {
    await GET(getReq('http://localhost/api/yts/popular?page=0'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('clamps minimum_rating above 9 to 9', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_rating=99'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumRating: 9 }));
  });

  it('clamps minimum_rating below 0 to 0', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_rating=-3'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumRating: 0 }));
  });

  it('leaves minimum_rating undefined when not provided', async () => {
    await GET(getReq('http://localhost/api/yts/popular'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumRating: undefined }));
  });
});

describe('GET /api/yts/popular — genre pass-through', () => {
  it('forwards genre as provided', async () => {
    await GET(getReq('http://localhost/api/yts/popular?genre=Comedy'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Comedy' }));
  });
});

describe('GET /api/yts/popular — minimum_year', () => {
  it('forwards integer minimum_year', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_year=2023'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumYear: 2023 }));
  });

  it('floors fractional minimum_year', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_year=2023.9'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumYear: 2023 }));
  });

  it('ignores minimum_year below 1900', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_year=1700'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumYear: undefined }));
  });

  it('ignores non-numeric minimum_year', async () => {
    await GET(getReq('http://localhost/api/yts/popular?minimum_year=abc'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumYear: undefined }));
  });

  it('leaves minimum_year undefined when not provided', async () => {
    await GET(getReq('http://localhost/api/yts/popular'));
    expect(fetchPopularMock).toHaveBeenCalledWith(expect.objectContaining({ minimumYear: undefined }));
  });
});

describe('GET /api/yts/popular — upstream failure', () => {
  it('returns 502 when fetchPopularMovies throws', async () => {
    fetchPopularMock.mockRejectedValue(new Error('yts offline'));
    const res = await GET(getReq('http://localhost/api/yts/popular'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'YTS unavailable' });
  });
});
