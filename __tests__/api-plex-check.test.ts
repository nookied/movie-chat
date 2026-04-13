/**
 * Integration tests for app/api/plex/check/route.ts.
 * Focus: movie vs TV routing, year coercion, and the "errors return found:false"
 * defensive behaviour so the chat UI never hangs on a Plex outage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const searchLibraryMock = vi.fn();
const searchTvLibraryMock = vi.fn();
vi.mock('@/lib/plex', () => ({
  searchLibrary: searchLibraryMock,
  searchTvLibrary: searchTvLibraryMock,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function getReq(url: string): NextRequest {
  // NextRequest exposes `.nextUrl` (a NextURL) for query parsing; the bare
  // Request from fetch API only has `.url`. URL has the same searchParams API.
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/plex/check/route').GET;

beforeEach(async () => {
  vi.resetModules();
  searchLibraryMock.mockReset();
  searchTvLibraryMock.mockReset();
  const mod = await import('@/app/api/plex/check/route');
  GET = mod.GET;
});

describe('GET /api/plex/check', () => {
  it('returns 400 when title is missing', async () => {
    const res = await GET(getReq('http://localhost/api/plex/check'));
    expect(res.status).toBe(400);
  });

  it('dispatches to searchLibrary for movies by default', async () => {
    searchLibraryMock.mockResolvedValue({ found: true });
    await GET(getReq('http://localhost/api/plex/check?title=Arrival&year=2016'));
    expect(searchLibraryMock).toHaveBeenCalledWith('Arrival', 2016);
    expect(searchTvLibraryMock).not.toHaveBeenCalled();
  });

  it('dispatches to searchTvLibrary when type=tv', async () => {
    searchTvLibraryMock.mockResolvedValue({ found: true, seasons: [1, 2] });
    await GET(getReq('http://localhost/api/plex/check?title=Succession&type=tv'));
    expect(searchTvLibraryMock).toHaveBeenCalledWith('Succession');
    expect(searchLibraryMock).not.toHaveBeenCalled();
  });

  it('passes undefined year when not a number', async () => {
    searchLibraryMock.mockResolvedValue({ found: false });
    await GET(getReq('http://localhost/api/plex/check?title=X&year=abc'));
    expect(searchLibraryMock).toHaveBeenCalledWith('X', undefined);
  });

  it('returns {found:false} rather than propagating Plex errors', async () => {
    // Chat UI depends on this defensive fallback — a Plex outage should not
    // block the user from getting a tag rendered.
    searchLibraryMock.mockRejectedValue(new Error('Plex offline'));
    const res = await GET(getReq('http://localhost/api/plex/check?title=X'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
  });
});
