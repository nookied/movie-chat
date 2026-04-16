/**
 * Integration tests for app/api/transmission/control/route.ts.
 * Focus: action dispatch (pause/resume/remove), app-torrent ownership gate,
 * and registry cleanup on remove.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const pauseMock = vi.fn();
const resumeMock = vi.fn();
const removeMock = vi.fn();
vi.mock('@/lib/transmission', () => ({
  pauseTorrent: pauseMock,
  resumeTorrent: resumeMock,
  removeTorrent: removeMock,
}));

const isAppTorrentMock = vi.fn<(id: number) => boolean>();
const unregisterAppTorrentMock = vi.fn();
vi.mock('@/lib/appTorrents', () => ({
  isAppTorrent: isAppTorrentMock,
  unregisterAppTorrent: unregisterAppTorrentMock,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function postReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/transmission/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function rawPostReq(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request('http://localhost/api/transmission/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as NextRequest;
}

let POST: typeof import('@/app/api/transmission/control/route').POST;

beforeEach(async () => {
  vi.resetModules();
  [pauseMock, resumeMock, removeMock, isAppTorrentMock, unregisterAppTorrentMock].forEach((m) => m.mockReset());
  pauseMock.mockResolvedValue(undefined);
  resumeMock.mockResolvedValue(undefined);
  removeMock.mockResolvedValue(undefined);
  isAppTorrentMock.mockReturnValue(true);
  const mod = await import('@/app/api/transmission/control/route');
  POST = mod.POST;
});

describe('POST /api/transmission/control', () => {
  it('returns 400 when id or action is missing', async () => {
    expect((await POST(postReq({ action: 'pause' }))).status).toBe(400);
    expect((await POST(postReq({ id: 1 }))).status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    expect((await POST(rawPostReq('{'))).status).toBe(400);
  });

  it('returns 413 on oversized JSON', async () => {
    const huge = `"${'x'.repeat(70_000)}"`;
    expect((await POST(rawPostReq(huge, { 'Content-Length': String(huge.length) }))).status).toBe(413);
  });

  it('returns 400 when id is not a positive integer', async () => {
    expect((await POST(postReq({ id: 0, action: 'pause' }))).status).toBe(400);
  });

  it('returns 403 when the torrent is not managed by this app', async () => {
    isAppTorrentMock.mockReturnValue(false);
    const res = await POST(postReq({ id: 1, action: 'pause' }));
    expect(res.status).toBe(403);
  });

  it('routes "pause" to pauseTorrent', async () => {
    await POST(postReq({ id: 1, action: 'pause' }));
    expect(pauseMock).toHaveBeenCalledWith(1);
  });

  it('routes "resume" to resumeTorrent', async () => {
    await POST(postReq({ id: 2, action: 'resume' }));
    expect(resumeMock).toHaveBeenCalledWith(2);
  });

  it('routes "remove" to removeTorrent AND unregisters from app registry', async () => {
    await POST(postReq({ id: 3, action: 'remove' }));
    expect(removeMock).toHaveBeenCalledWith(3, true); // delete partial files
    expect(unregisterAppTorrentMock).toHaveBeenCalledWith(3);
  });

  it('rejects unknown actions with 400', async () => {
    const res = await POST(postReq({ id: 1, action: 'nuke' }));
    expect(res.status).toBe(400);
  });

  it('returns 502 when the transmission library throws', async () => {
    pauseMock.mockRejectedValue(new Error('RPC failed'));
    const res = await POST(postReq({ id: 1, action: 'pause' }));
    expect(res.status).toBe(502);
  });
});
