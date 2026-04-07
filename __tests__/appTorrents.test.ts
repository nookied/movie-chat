/**
 * Unit tests for lib/appTorrents.ts
 *
 * Tests the server-side torrent registry:
 * - CRUD operations (register, lookup, unregister)
 * - Backward-compatible loading (old number[] format)
 * - Cache TTL expiry behaviour
 * - pruneAppTorrents() grace-period and active-torrent protection
 * - Atomic write (temp-file + rename) resilience
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs mock — set up before any imports from appTorrents
// ---------------------------------------------------------------------------

const fsMock = {
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
};

vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

// We reset modules in beforeEach so the module-level `cache` variable is
// cleared between tests.  Each test re-imports a fresh copy of appTorrents.
beforeEach(() => {
  vi.resetModules();
  // Default: file is missing → start with empty registry
  fsMock.readFileSync.mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
  fsMock.writeFileSync.mockReset();
  fsMock.renameSync.mockReset();
  fsMock.unlinkSync.mockReset();
});

async function fresh() {
  return await import('@/lib/appTorrents');
}

// ---------------------------------------------------------------------------
// isAppTorrent / registerAppTorrent
// ---------------------------------------------------------------------------

describe('isAppTorrent()', () => {
  it('returns false for an id that was never registered', async () => {
    const { isAppTorrent } = await fresh();
    expect(isAppTorrent(999)).toBe(false);
  });

  it('returns true after registering an id', async () => {
    const { isAppTorrent, registerAppTorrent } = await fresh();
    registerAppTorrent(42, 'movie');
    expect(isAppTorrent(42)).toBe(true);
  });

  it('returns false after unregistering an id', async () => {
    const { isAppTorrent, registerAppTorrent, unregisterAppTorrent } = await fresh();
    registerAppTorrent(42, 'movie');
    unregisterAppTorrent(42);
    expect(isAppTorrent(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAppTorrentMeta
// ---------------------------------------------------------------------------

describe('getAppTorrentMeta()', () => {
  it('returns undefined for an unknown id', async () => {
    const { getAppTorrentMeta } = await fresh();
    expect(getAppTorrentMeta(99)).toBeUndefined();
  });

  it('returns stored mediaType', async () => {
    const { registerAppTorrent, getAppTorrentMeta } = await fresh();
    registerAppTorrent(10, 'tv', 3);
    const meta = getAppTorrentMeta(10);
    expect(meta?.mediaType).toBe('tv');
    expect(meta?.season).toBe(3);
  });

  it('stores year when provided', async () => {
    const { registerAppTorrent, getAppTorrentMeta } = await fresh();
    registerAppTorrent(20, 'movie', undefined, 2024);
    expect(getAppTorrentMeta(20)?.year).toBe(2024);
  });

  it('stores registeredAt timestamp on registration', async () => {
    const before = Date.now();
    const { registerAppTorrent, getAppTorrentMeta } = await fresh();
    registerAppTorrent(30, 'movie');
    const after = Date.now();
    const meta = getAppTorrentMeta(30);
    expect(meta?.registeredAt).toBeGreaterThanOrEqual(before);
    expect(meta?.registeredAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: old number[] format
// ---------------------------------------------------------------------------

describe('backward-compat — old number[] format', () => {
  it('loads IDs from old plain number[] format', async () => {
    fsMock.readFileSync.mockReturnValue('[42, 99, 7]');
    const { isAppTorrent, getAppTorrentMeta } = await fresh();
    expect(isAppTorrent(42)).toBe(true);
    expect(isAppTorrent(99)).toBe(true);
    expect(isAppTorrent(7)).toBe(true);
    // Old format produces empty metadata objects
    expect(getAppTorrentMeta(42)).toEqual({});
  });

  it('returns false for ids not in old format', async () => {
    fsMock.readFileSync.mockReturnValue('[42]');
    const { isAppTorrent } = await fresh();
    expect(isAppTorrent(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Current JSON object format
// ---------------------------------------------------------------------------

describe('loading current StoredFormat', () => {
  it('loads mediaType and season from JSON object format', async () => {
    fsMock.readFileSync.mockReturnValue(
      JSON.stringify({ '42': { mediaType: 'tv', season: 2 }, '99': { mediaType: 'movie' } })
    );
    const { isAppTorrent, getAppTorrentMeta } = await fresh();
    expect(isAppTorrent(42)).toBe(true);
    expect(getAppTorrentMeta(42)?.mediaType).toBe('tv');
    expect(getAppTorrentMeta(42)?.season).toBe(2);
    expect(getAppTorrentMeta(99)?.mediaType).toBe('movie');
  });

  it('handles corrupted JSON gracefully — starts with empty registry', async () => {
    fsMock.readFileSync.mockReturnValue('NOT_VALID_JSON{{{');
    const { isAppTorrent } = await fresh();
    expect(isAppTorrent(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Atomic write behaviour
// ---------------------------------------------------------------------------

describe('write behaviour', () => {
  it('calls writeFileSync and renameSync on register', async () => {
    const { registerAppTorrent } = await fresh();
    registerAppTorrent(55, 'movie');
    expect(fsMock.writeFileSync).toHaveBeenCalledOnce();
    expect(fsMock.renameSync).toHaveBeenCalledOnce();
  });

  it('written JSON contains the registered id', async () => {
    const { registerAppTorrent } = await fresh();
    registerAppTorrent(77, 'tv', 1);
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed['77']).toBeDefined();
    expect(parsed['77'].mediaType).toBe('tv');
    expect(parsed['77'].season).toBe(1);
  });

  it('written JSON does not contain unregistered id', async () => {
    const { registerAppTorrent, unregisterAppTorrent } = await fresh();
    registerAppTorrent(88);
    unregisterAppTorrent(88);
    // The second write (after unregister) should not have id 88
    const lastWrite = fsMock.writeFileSync.mock.calls.at(-1)![1] as string;
    const parsed = JSON.parse(lastWrite);
    expect(parsed['88']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pruneAppTorrents()
// ---------------------------------------------------------------------------

describe('pruneAppTorrents()', () => {
  it('returns 0 when registry is empty', async () => {
    const { pruneAppTorrents } = await fresh();
    expect(pruneAppTorrents(new Set())).toBe(0);
  });

  it('does not prune active torrents', async () => {
    const { registerAppTorrent, isAppTorrent, pruneAppTorrents } = await fresh();
    registerAppTorrent(10, 'movie');
    registerAppTorrent(20, 'tv');
    // Both are "active" in Transmission
    const pruned = pruneAppTorrents(new Set([10, 20]), 0); // graceMs=0 to skip grace period
    expect(pruned).toBe(0);
    expect(isAppTorrent(10)).toBe(true);
    expect(isAppTorrent(20)).toBe(true);
  });

  it('prunes inactive entries older than graceMs', async () => {
    // Pre-load file with an entry that has a past registeredAt (2 hours ago)
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    fsMock.readFileSync.mockReturnValue(
      JSON.stringify({ '10': { mediaType: 'movie', registeredAt: twoHoursAgo } })
    );
    const { isAppTorrent, pruneAppTorrents } = await fresh();
    expect(isAppTorrent(10)).toBe(true); // confirm entry loaded

    // Not in active Transmission list — should be pruned (grace period expired)
    const pruned = pruneAppTorrents(new Set(), 60 * 60 * 1000); // 1h grace
    expect(pruned).toBe(1);
    expect(isAppTorrent(10)).toBe(false);
  });

  it('respects grace period — does not prune recent entries', async () => {
    const { registerAppTorrent, isAppTorrent, pruneAppTorrents } = await fresh();
    registerAppTorrent(10, 'movie'); // registered just now
    // Not in active list, but registered within grace period
    const pruned = pruneAppTorrents(new Set(), 60 * 60 * 1000); // 1h grace
    expect(pruned).toBe(0);
    expect(isAppTorrent(10)).toBe(true);
  });

  it('prunes entries with undefined registeredAt (legacy) when not active', async () => {
    // Load legacy entry without registeredAt
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ '10': { mediaType: 'movie' } }));
    const { isAppTorrent, pruneAppTorrents } = await fresh();
    expect(isAppTorrent(10)).toBe(true);
    // undefined registeredAt → no grace period → prune immediately
    const pruned = pruneAppTorrents(new Set(), 60 * 60 * 1000);
    expect(pruned).toBe(1);
    expect(isAppTorrent(10)).toBe(false);
  });

  it('does not prune legacy entry if it is still active in Transmission', async () => {
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ '10': { mediaType: 'movie' } }));
    const { isAppTorrent, pruneAppTorrents } = await fresh();
    const pruned = pruneAppTorrents(new Set([10]), 60 * 60 * 1000);
    expect(pruned).toBe(0);
    expect(isAppTorrent(10)).toBe(true);
  });

  it('returns correct count when multiple entries are pruned', async () => {
    // Pre-load file with three old entries (all 2 hours past grace period)
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    fsMock.readFileSync.mockReturnValue(JSON.stringify({
      '1': { mediaType: 'movie', registeredAt: twoHoursAgo },
      '2': { mediaType: 'movie', registeredAt: twoHoursAgo },
      '3': { mediaType: 'tv', registeredAt: twoHoursAgo },
    }));
    const { pruneAppTorrents } = await fresh();

    const pruned = pruneAppTorrents(new Set(), 60 * 60 * 1000);
    expect(pruned).toBe(3);
  });

  it('does not write to disk when nothing was pruned', async () => {
    const { registerAppTorrent, pruneAppTorrents } = await fresh();
    registerAppTorrent(10, 'movie'); // active
    fsMock.writeFileSync.mockClear();
    pruneAppTorrents(new Set([10])); // nothing to prune
    // Only the initial register write should exist, none from prune
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('only prunes inactive entries, leaves active ones intact', async () => {
    // Pre-load two old entries; id=10 will be reported as active, id=20 will not
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    fsMock.readFileSync.mockReturnValue(JSON.stringify({
      '10': { mediaType: 'movie', registeredAt: twoHoursAgo },
      '20': { mediaType: 'movie', registeredAt: twoHoursAgo },
    }));
    const { isAppTorrent, pruneAppTorrents } = await fresh();

    // 10 is active in Transmission, 20 is not
    const pruned = pruneAppTorrents(new Set([10]), 60 * 60 * 1000);
    expect(pruned).toBe(1);
    expect(isAppTorrent(10)).toBe(true);
    expect(isAppTorrent(20)).toBe(false);
  });
});
