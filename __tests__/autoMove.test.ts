/**
 * Unit tests for lib/autoMove.ts — the background poller that moves completed
 * app torrents into the Plex library.
 *
 * Covers:
 * - Idempotent startAutoMovePoller()
 * - tick() skips torrents that aren't done
 * - tick() skips torrents not in the app registry (with info log)
 * - tick() moves completed app torrents and logs start/complete
 * - "already in progress" errors are swallowed (not logged as errors)
 * - Other move errors ARE logged as errors
 * - Transmission RPC failure at list-time is silent (no throw, tick returns)
 * - Registry cleanup (pruneAppTorrents) runs once per 24 h
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const listActiveTorrentsMock = vi.fn();
vi.mock('@/lib/transmission', () => ({ listActiveTorrents: listActiveTorrentsMock }));

const isAppTorrentMock = vi.fn<(id: number) => boolean>();
const getAppTorrentMetaMock = vi.fn();
const pruneAppTorrentsMock = vi.fn<(active: Set<number>) => number>();
vi.mock('@/lib/appTorrents', () => ({
  isAppTorrent: isAppTorrentMock,
  getAppTorrentMeta: getAppTorrentMetaMock,
  pruneAppTorrents: pruneAppTorrentsMock,
}));

const moveTorrentFilesMock = vi.fn();
vi.mock('@/lib/moveFiles', () => ({ moveTorrentFiles: moveTorrentFilesMock }));

const logMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ getLogger: vi.fn(() => logMock) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fixture factory mirroring the shape of DownloadStatus from types/index.ts */
function makeTorrent(overrides: {
  id: number;
  name?: string;
  percentDone?: number;
  status?: number;
}) {
  return {
    id: overrides.id,
    name: overrides.name ?? `torrent-${overrides.id}`,
    percentDone: overrides.percentDone ?? 1, // 100% by default
    status: overrides.status ?? 6, // seeding = done
    eta: 0,
    rateDownload: 0,
    files: [],
  };
}

type TickFn = () => Promise<void>;
type StartFn = () => void;

async function loadModule(): Promise<{ tick: TickFn; start: StartFn }> {
  const mod = await import('@/lib/autoMove');
  return { tick: mod.__testHooks.tick, start: mod.startAutoMovePoller };
}

beforeEach(() => {
  vi.resetModules();
  listActiveTorrentsMock.mockReset();
  isAppTorrentMock.mockReset();
  getAppTorrentMetaMock.mockReset();
  pruneAppTorrentsMock.mockReset();
  moveTorrentFilesMock.mockReset();
  logMock.info.mockReset();
  logMock.warn.mockReset();
  logMock.error.mockReset();

  // Default: empty transmission, no torrents in registry, no moves
  listActiveTorrentsMock.mockResolvedValue([]);
  isAppTorrentMock.mockReturnValue(false);
  getAppTorrentMetaMock.mockReturnValue(undefined);
  pruneAppTorrentsMock.mockReturnValue(0);
  moveTorrentFilesMock.mockResolvedValue(undefined);
});

// ─── startAutoMovePoller idempotence ─────────────────────────────────────

describe('startAutoMovePoller', () => {
  it('logs "poller started" the first time it is called', async () => {
    vi.useFakeTimers();
    const { start } = await loadModule();
    start();
    expect(logMock.info).toHaveBeenCalledWith('poller started');
    vi.useRealTimers();
  });

  it('is idempotent — second call does not re-log', async () => {
    vi.useFakeTimers();
    const { start } = await loadModule();
    start();
    logMock.info.mockClear();
    start();
    expect(logMock.info).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── tick: torrent filtering ─────────────────────────────────────────────

describe('tick() — filtering', () => {
  it('ignores torrents that are not yet done (percentDone < 1)', async () => {
    listActiveTorrentsMock.mockResolvedValue([
      makeTorrent({ id: 1, percentDone: 0.5, status: 4 }),
    ]);
    isAppTorrentMock.mockReturnValue(true);
    const { tick } = await loadModule();
    await tick();
    expect(moveTorrentFilesMock).not.toHaveBeenCalled();
  });

  it('ignores torrents in non-done status values', async () => {
    listActiveTorrentsMock.mockResolvedValue([
      // percentDone=1 but status=4 (downloading metadata) → not actually done
      makeTorrent({ id: 2, percentDone: 1, status: 4 }),
    ]);
    isAppTorrentMock.mockReturnValue(true);
    const { tick } = await loadModule();
    await tick();
    expect(moveTorrentFilesMock).not.toHaveBeenCalled();
  });

  it('skips done torrents not in the app registry and logs info', async () => {
    listActiveTorrentsMock.mockResolvedValue([
      makeTorrent({ id: 3, name: 'external', percentDone: 1, status: 6 }),
    ]);
    isAppTorrentMock.mockReturnValue(false);
    const { tick } = await loadModule();
    await tick();
    expect(moveTorrentFilesMock).not.toHaveBeenCalled();
    expect(logMock.info).toHaveBeenCalledWith(
      'skipping (not in registry)',
      expect.objectContaining({ id: 3, name: 'external' })
    );
  });
});

// ─── tick: successful moves ──────────────────────────────────────────────

describe('tick() — moving torrents', () => {
  it('calls moveTorrentFiles with id + mediaType + season from registry', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 10, name: 'Arrival' })]);
    isAppTorrentMock.mockReturnValue(true);
    getAppTorrentMetaMock.mockReturnValue({ mediaType: 'movie', season: undefined });
    const { tick } = await loadModule();
    await tick();
    expect(moveTorrentFilesMock).toHaveBeenCalledWith(10, 'movie', undefined);
  });

  it('logs move start and move complete around a successful move', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 20, name: 'Dune' })]);
    isAppTorrentMock.mockReturnValue(true);
    getAppTorrentMetaMock.mockReturnValue({ mediaType: 'movie' });
    const { tick } = await loadModule();
    await tick();
    expect(logMock.info).toHaveBeenCalledWith(
      'move start',
      expect.objectContaining({ id: 20, name: 'Dune', mediaType: 'movie' })
    );
    expect(logMock.info).toHaveBeenCalledWith('move complete', { id: 20 });
  });

  it('passes TV season through to moveTorrentFiles', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 30, name: 'Succession S03' })]);
    isAppTorrentMock.mockReturnValue(true);
    getAppTorrentMetaMock.mockReturnValue({ mediaType: 'tv', season: 3 });
    const { tick } = await loadModule();
    await tick();
    expect(moveTorrentFilesMock).toHaveBeenCalledWith(30, 'tv', 3);
  });
});

// ─── tick: error handling ───────────────────────────────────────────────

describe('tick() — error handling', () => {
  it('silently swallows "already in progress" errors (not logged as error)', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 40 })]);
    isAppTorrentMock.mockReturnValue(true);
    moveTorrentFilesMock.mockRejectedValue(new Error('already in progress'));
    const { tick } = await loadModule();
    await tick();
    expect(logMock.error).not.toHaveBeenCalled();
  });

  it('logs other move errors at error level with id and message', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 50 })]);
    isAppTorrentMock.mockReturnValue(true);
    moveTorrentFilesMock.mockRejectedValue(new Error('disk full'));
    const { tick } = await loadModule();
    await tick();
    expect(logMock.error).toHaveBeenCalledWith(
      'move failed',
      expect.objectContaining({ id: 50, error: 'disk full' })
    );
  });

  it('returns silently when listActiveTorrents throws (transmission unreachable)', async () => {
    listActiveTorrentsMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { tick } = await loadModule();
    await expect(tick()).resolves.toBeUndefined();
    expect(moveTorrentFilesMock).not.toHaveBeenCalled();
  });
});

// ─── tick: concurrent-guard ─────────────────────────────────────────────

describe('tick() — concurrency guard', () => {
  it('second tick call while first is still running is a no-op', async () => {
    // First tick stalls on a manual promise we control
    let release: (() => void) | undefined;
    listActiveTorrentsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        })
    );
    const { tick } = await loadModule();

    const inflight = tick();
    await tick(); // second call — should bail because ticking=true
    release!();
    await inflight;

    // Only one actual list call despite two tick invocations
    expect(listActiveTorrentsMock).toHaveBeenCalledTimes(1);
  });
});

// ─── tick: daily cleanup ────────────────────────────────────────────────

describe('tick() — registry cleanup', () => {
  it('calls pruneAppTorrents on first tick (24h interval cold start)', async () => {
    listActiveTorrentsMock.mockResolvedValue([
      makeTorrent({ id: 60, percentDone: 0.5 }),
      makeTorrent({ id: 61, percentDone: 0.5 }),
    ]);
    pruneAppTorrentsMock.mockReturnValue(0);
    const { tick } = await loadModule();
    await tick();
    expect(pruneAppTorrentsMock).toHaveBeenCalledWith(new Set([60, 61]));
  });

  it('logs cleanup info only when prunedCount > 0', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 70, percentDone: 0.5 })]);
    pruneAppTorrentsMock.mockReturnValue(3);
    const { tick } = await loadModule();
    await tick();
    expect(logMock.info).toHaveBeenCalledWith('registry cleanup', { pruned: 3 });
  });

  it('does not log cleanup info when nothing was pruned', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 71, percentDone: 0.5 })]);
    pruneAppTorrentsMock.mockReturnValue(0);
    const { tick } = await loadModule();
    await tick();
    expect(logMock.info).not.toHaveBeenCalledWith('registry cleanup', expect.anything());
  });

  it('skips cleanup on second tick within 24 h window', async () => {
    listActiveTorrentsMock.mockResolvedValue([makeTorrent({ id: 80, percentDone: 0.5 })]);
    pruneAppTorrentsMock.mockReturnValue(0);
    const { tick } = await loadModule();
    await tick(); // first tick primes lastCleanupAt
    await tick(); // second tick: still within 24 h
    expect(pruneAppTorrentsMock).toHaveBeenCalledTimes(1);
  });
});
