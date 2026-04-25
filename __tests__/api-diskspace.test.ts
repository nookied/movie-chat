/**
 * Tests for app/api/files/diskspace/route.ts — focus on the path allowlist
 * check, which gates a readable-filesystem probe. A bare startsWith() would
 * let "/media/lib" also authorise "/media/library-private".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const cfgMock = vi.fn<(key: string) => string>();

vi.mock('@/lib/config', () => ({
  cfg: (key: string) => cfgMock(key),
}));

// statfsSync is only hit on the happy path, but we stub it so the allowed
// path returns plausible numbers instead of surfacing a real filesystem error
// on whatever CI box happens to run.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: { ...actual, statfsSync: vi.fn(() => ({ blocks: 1000, bsize: 4096, bavail: 500 })) },
    statfsSync: vi.fn(() => ({ blocks: 1000, bsize: 4096, bavail: 500 })),
    existsSync: vi.fn(() => true),
  };
});

function getReq(pathParam: string): NextRequest {
  const u = new URL('http://localhost/api/files/diskspace');
  u.searchParams.set('path', pathParam);
  return { nextUrl: u } as unknown as NextRequest;
}

let GET: typeof import('@/app/api/files/diskspace/route').GET;

beforeEach(async () => {
  vi.resetModules();
  cfgMock.mockReset();
  cfgMock.mockImplementation((key) => {
    if (key === 'libraryDir') return '/media/lib';
    if (key === 'tvLibraryDir') return '/media/tv';
    return '';
  });
  const mod = await import('@/app/api/files/diskspace/route');
  GET = mod.GET;
});

describe('GET /api/files/diskspace — path allowlist', () => {
  it('allows the exact configured libraryDir', async () => {
    const res = await GET(getReq('/media/lib'));
    expect(res.status).toBe(200);
  });

  it('allows a true child of the configured libraryDir', async () => {
    const res = await GET(getReq('/media/lib/movies'));
    expect(res.status).toBe(200);
  });

  it('rejects a sibling whose name merely starts with the configured prefix', async () => {
    // Regression guard: a naive startsWith("/media/lib") would wrongly allow this.
    const res = await GET(getReq('/media/library-private'));
    expect(res.status).toBe(403);
  });

  it('rejects a relative path', async () => {
    const res = await GET(getReq('not/absolute'));
    expect(res.status).toBe(400);
  });

  it('rejects when no path param is present', async () => {
    const res = await GET({ nextUrl: new URL('http://localhost/api/files/diskspace') } as unknown as NextRequest);
    expect(res.status).toBe(400);
  });
});
