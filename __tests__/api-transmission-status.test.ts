/**
 * Integration tests for app/api/transmission/status/route.ts.
 * Focus: list vs single-id routing, and app-torrent annotation in list mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const getTorrentStatusMock = vi.fn();
const listActiveTorrentsMock = vi.fn();
vi.mock('@/lib/transmission', () => ({
  getTorrentStatus: getTorrentStatusMock,
  listActiveTorrents: listActiveTorrentsMock,
}));

const isAppTorrentMock = vi.fn<(id: number) => boolean>();
const getAppTorrentMetaMock = vi.fn<(id: number) => unknown>();
vi.mock('@/lib/appTorrents', () => ({
  isAppTorrent: isAppTorrentMock,
  getAppTorrentMeta: getAppTorrentMetaMock,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function getReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/transmission/status/route').GET;

beforeEach(async () => {
  vi.resetModules();
  [getTorrentStatusMock, listActiveTorrentsMock, isAppTorrentMock, getAppTorrentMetaMock].forEach((m) =>
    m.mockReset()
  );
  isAppTorrentMock.mockReturnValue(false);
  getAppTorrentMetaMock.mockReturnValue(undefined);
  const mod = await import('@/app/api/transmission/status/route');
  GET = mod.GET;
});

describe('GET /api/transmission/status', () => {
  it('returns the full list annotated with isAppTorrent + appMeta when no id is given', async () => {
    listActiveTorrentsMock.mockResolvedValue([
      { id: 1, name: 'A', percentDone: 0.5, status: 4, eta: 0, rateDownload: 0, files: [] },
      { id: 2, name: 'B', percentDone: 1, status: 6, eta: 0, rateDownload: 0, files: [] },
    ]);
    isAppTorrentMock.mockImplementation((id) => id === 2);
    getAppTorrentMetaMock.mockImplementation((id) =>
      id === 2 ? { mediaType: 'movie' } : undefined
    );
    const res = await GET(getReq('http://localhost/api/transmission/status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].isAppTorrent).toBe(false);
    expect(body[1].isAppTorrent).toBe(true);
    expect(body[1].appMeta).toEqual({ mediaType: 'movie' });
  });

  it('returns single torrent status when id is given', async () => {
    getTorrentStatusMock.mockResolvedValue({
      id: 5,
      name: 'X',
      percentDone: 1,
      status: 6,
      eta: 0,
      rateDownload: 0,
      files: [],
    });
    const res = await GET(getReq('http://localhost/api/transmission/status?id=5'));
    expect(res.status).toBe(200);
    expect(getTorrentStatusMock).toHaveBeenCalledWith(5);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await GET(getReq('http://localhost/api/transmission/status?id=abc'));
    expect(res.status).toBe(400);
  });

  it('returns 502 when list call fails', async () => {
    listActiveTorrentsMock.mockRejectedValue(new Error('RPC error'));
    const res = await GET(getReq('http://localhost/api/transmission/status'));
    expect(res.status).toBe(502);
  });

  it('returns 502 when single-id call fails', async () => {
    getTorrentStatusMock.mockRejectedValue(new Error('not found'));
    const res = await GET(getReq('http://localhost/api/transmission/status?id=99'));
    expect(res.status).toBe(502);
  });
});
