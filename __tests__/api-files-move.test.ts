/**
 * Integration tests for app/api/files/move/route.ts (thin HTTP wrapper over
 * lib/moveFiles.ts — MoveError.httpStatus mapping is the load-bearing logic).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const moveTorrentFilesMock = vi.fn();

class MoveErrorStub extends Error {
  constructor(message: string, readonly httpStatus: 400 | 500) {
    super(message);
    this.name = 'MoveError';
  }
}

vi.mock('@/lib/moveFiles', () => ({
  moveTorrentFiles: moveTorrentFilesMock,
  MoveError: MoveErrorStub,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function postReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/files/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

let POST: typeof import('@/app/api/files/move/route').POST;

beforeEach(async () => {
  vi.resetModules();
  moveTorrentFilesMock.mockReset();
  const mod = await import('@/app/api/files/move/route');
  POST = mod.POST;
});

describe('POST /api/files/move', () => {
  it('returns 400 when torrentId is missing', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when torrentId is not a number', async () => {
    const res = await POST(postReq({ torrentId: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with the move result on success', async () => {
    moveTorrentFilesMock.mockResolvedValue({ moved: ['a.mkv'], skipped: [], destFolder: '/movies/Arrival' });
    const res = await POST(postReq({ torrentId: 5, mediaType: 'movie' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moved).toEqual(['a.mkv']);
    expect(moveTorrentFilesMock).toHaveBeenCalledWith(5, 'movie', undefined);
  });

  it('maps MoveError httpStatus=400 to 400 response', async () => {
    moveTorrentFilesMock.mockRejectedValue(new MoveErrorStub('bad request', 400));
    const res = await POST(postReq({ torrentId: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad request');
  });

  it('maps MoveError httpStatus=500 to 500 response', async () => {
    moveTorrentFilesMock.mockRejectedValue(new MoveErrorStub('server error', 500));
    const res = await POST(postReq({ torrentId: 1 }));
    expect(res.status).toBe(500);
  });

  it('treats arbitrary non-MoveError exceptions as 500', async () => {
    moveTorrentFilesMock.mockRejectedValue(new Error('anything else'));
    const res = await POST(postReq({ torrentId: 1 }));
    expect(res.status).toBe(500);
  });

  it('passes mediaType and season through to the library function', async () => {
    moveTorrentFilesMock.mockResolvedValue({ moved: [], skipped: [], destFolder: '/tv/Show/Season 3' });
    await POST(postReq({ torrentId: 7, mediaType: 'tv', season: 3 }));
    expect(moveTorrentFilesMock).toHaveBeenCalledWith(7, 'tv', 3);
  });
});
