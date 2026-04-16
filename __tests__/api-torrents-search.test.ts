/**
 * Integration tests for app/api/torrents/search/route.ts.
 * Focus: movie (YTS) vs TV (EZTV) dispatch, season validation, and the
 * "errors return empty torrents" defensive behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const searchTorrentsMock = vi.fn();
const searchTvSeasonMock = vi.fn();
vi.mock('@/lib/yts', () => ({ searchTorrents: searchTorrentsMock }));
vi.mock('@/lib/eztv', () => ({ searchTvSeason: searchTvSeasonMock }));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function getReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/torrents/search/route').GET;

beforeEach(async () => {
  vi.resetModules();
  searchTorrentsMock.mockReset();
  searchTvSeasonMock.mockReset();
  const mod = await import('@/app/api/torrents/search/route');
  GET = mod.GET;
});

describe('GET /api/torrents/search', () => {
  it('returns 400 when title is missing', async () => {
    const res = await GET(getReq('http://localhost/api/torrents/search'));
    expect(res.status).toBe(400);
  });

  it('movie search: dispatches to YTS with year', async () => {
    searchTorrentsMock.mockResolvedValue({ torrents: [], noSuitableQuality: false });
    await GET(getReq('http://localhost/api/torrents/search?title=Dune&year=2021'));
    expect(searchTorrentsMock).toHaveBeenCalledWith('Dune', 2021, { strictYear: false });
  });

  it('movie search: forwards strictYear for canonical movie matches', async () => {
    searchTorrentsMock.mockResolvedValue({ torrents: [], noSuitableQuality: false });
    await GET(getReq('http://localhost/api/torrents/search?title=Dragonfly&year=2002&strictYear=true'));
    expect(searchTorrentsMock).toHaveBeenCalledWith('Dragonfly', 2002, { strictYear: true });
  });

  it('TV search: dispatches to EZTV with season', async () => {
    searchTvSeasonMock.mockResolvedValue({ torrents: [], noSuitableQuality: false });
    await GET(getReq('http://localhost/api/torrents/search?title=Succession&type=tv&season=3'));
    expect(searchTvSeasonMock).toHaveBeenCalledWith('Succession', 3);
  });

  it('TV search without season returns 400', async () => {
    const res = await GET(getReq('http://localhost/api/torrents/search?title=X&type=tv'));
    expect(res.status).toBe(400);
  });

  it('TV search with non-numeric season returns 400', async () => {
    const res = await GET(getReq('http://localhost/api/torrents/search?title=X&type=tv&season=abc'));
    expect(res.status).toBe(400);
  });

  it('TV search with season < 1 returns 400', async () => {
    const res = await GET(getReq('http://localhost/api/torrents/search?title=X&type=tv&season=0'));
    expect(res.status).toBe(400);
  });

  it('returns empty torrents payload on any upstream error (no 5xx)', async () => {
    searchTorrentsMock.mockRejectedValue(new Error('yts offline'));
    const res = await GET(getReq('http://localhost/api/torrents/search?title=X'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ torrents: [], noSuitableQuality: false });
  });
});
