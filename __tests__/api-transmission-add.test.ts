/**
 * Integration tests for app/api/transmission/add/route.ts.
 * Focus: magnet URI validation (SHA1 hex + BitTorrent v2 base32) and registry
 * registration after a successful add.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const addTorrentMock = vi.fn<(magnet: string) => Promise<number>>();
const registerAppTorrentMock = vi.fn();

vi.mock('@/lib/transmission', () => ({ addTorrent: addTorrentMock }));
vi.mock('@/lib/appTorrents', () => ({ registerAppTorrent: registerAppTorrentMock }));
vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function postReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/transmission/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const SHA1_HEX = '0123456789abcdef0123456789abcdef01234567'; // 40 hex chars
const V2_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // 32 upper base32 chars

let POST: typeof import('@/app/api/transmission/add/route').POST;

beforeEach(async () => {
  vi.resetModules();
  addTorrentMock.mockReset();
  registerAppTorrentMock.mockReset();
  addTorrentMock.mockResolvedValue(42);
  const mod = await import('@/app/api/transmission/add/route');
  POST = mod.POST;
});

describe('POST /api/transmission/add — magnet validation', () => {
  it('accepts a valid SHA1-hex magnet', async () => {
    const res = await POST(postReq({ magnet: `magnet:?xt=urn:btih:${SHA1_HEX}` }));
    expect(res.status).toBe(200);
    expect(addTorrentMock).toHaveBeenCalled();
  });

  it('accepts a BitTorrent v2 base32 magnet', async () => {
    const res = await POST(postReq({ magnet: `magnet:?xt=urn:btih:${V2_BASE32}` }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing magnet', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('rejects a non-magnet URL', async () => {
    const res = await POST(postReq({ magnet: 'https://example.com/torrent' }));
    expect(res.status).toBe(400);
  });

  it('rejects a magnet with a too-short infohash', async () => {
    const res = await POST(postReq({ magnet: 'magnet:?xt=urn:btih:abcdef' }));
    expect(res.status).toBe(400);
  });

  it('rejects a magnet without xt=urn:btih:', async () => {
    const res = await POST(postReq({ magnet: `magnet:?dn=foo&tr=http://x` }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transmission/add — registry + errors', () => {
  it('registers the returned torrent ID with full metadata', async () => {
    addTorrentMock.mockResolvedValue(99);
    await POST(postReq({
      magnet: `magnet:?xt=urn:btih:${SHA1_HEX}`,
      mediaType: 'tv',
      season: 3,
      year: 2024,
    }));
    expect(registerAppTorrentMock).toHaveBeenCalledWith(99, 'tv', 3, 2024);
  });

  it('returns 502 with the library error message when addTorrent fails', async () => {
    addTorrentMock.mockRejectedValue(new Error('Transmission unreachable'));
    const res = await POST(postReq({ magnet: `magnet:?xt=urn:btih:${SHA1_HEX}` }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Transmission unreachable');
  });
});
