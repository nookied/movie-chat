/**
 * Unit tests for lib/moveFiles.ts — the shared move logic used by the HTTP
 * route and the auto-move poller.
 *
 * Covers:
 * - Concurrent-move prevention (movingSet guard)
 * - Missing library / download dir → MoveError(400)
 * - Incomplete torrent → MoveError(400)
 * - Movie vs TV destination layout (Season N subdir, season=0 = show root)
 * - Extension allowlist (media + subtitles, junk skipped)
 * - Symlink skip
 * - Path-traversal defence
 * - Unlink-failure rollback (copied file is removed)
 * - Transmission + registry cleanup after a successful move
 * - Plex refresh fire-and-forget
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs.promises mock
// ---------------------------------------------------------------------------

const fsPromisesMock = {
  mkdir: vi.fn<(p: string, opts?: unknown) => Promise<void>>(),
  lstat: vi.fn<(p: string) => Promise<{ isSymbolicLink: () => boolean }>>(),
  copyFile: vi.fn<(src: string, dst: string) => Promise<void>>(),
  unlink: vi.fn<(p: string) => Promise<void>>(),
  rm: vi.fn<(p: string, opts?: unknown) => Promise<void>>(),
};

vi.mock('fs', () => ({
  promises: fsPromisesMock,
  default: { promises: fsPromisesMock },
}));

// ---------------------------------------------------------------------------
// Other module mocks
// ---------------------------------------------------------------------------

const getTorrentStatusMock = vi.fn();
const removeTorrentMock = vi.fn();
vi.mock('@/lib/transmission', () => ({
  getTorrentStatus: getTorrentStatusMock,
  removeTorrent: removeTorrentMock,
}));

const triggerLibraryRefreshMock = vi.fn();
vi.mock('@/lib/plex', () => ({
  triggerLibraryRefresh: triggerLibraryRefreshMock,
}));

const unregisterAppTorrentMock = vi.fn();
vi.mock('@/lib/appTorrents', () => ({
  unregisterAppTorrent: unregisterAppTorrentMock,
}));

const cfgMock = vi.fn<(key: string, envVar: string, def?: string) => string>();
vi.mock('@/lib/config', () => ({ cfg: cfgMock }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MoveTorrentFiles = typeof import('@/lib/moveFiles').moveTorrentFiles;
type MoveError = typeof import('@/lib/moveFiles').MoveError;

let moveTorrentFiles: MoveTorrentFiles;
let MoveErrorCtor: MoveError;

beforeEach(async () => {
  vi.resetModules();
  Object.values(fsPromisesMock).forEach((m) => (m as ReturnType<typeof vi.fn>).mockReset());
  getTorrentStatusMock.mockReset();
  removeTorrentMock.mockReset();
  triggerLibraryRefreshMock.mockReset();
  unregisterAppTorrentMock.mockReset();
  cfgMock.mockReset();

  // Sensible defaults: happy path with both libraries configured
  cfgMock.mockImplementation((key) => {
    if (key === 'libraryDir') return '/library/movies';
    if (key === 'tvLibraryDir') return '/library/tv';
    if (key === 'transmissionDownloadDir') return '/downloads';
    return '';
  });
  fsPromisesMock.mkdir.mockResolvedValue(undefined);
  fsPromisesMock.lstat.mockResolvedValue({ isSymbolicLink: () => false });
  fsPromisesMock.copyFile.mockResolvedValue(undefined);
  fsPromisesMock.unlink.mockResolvedValue(undefined);
  fsPromisesMock.rm.mockResolvedValue(undefined);
  removeTorrentMock.mockResolvedValue(undefined);
  triggerLibraryRefreshMock.mockResolvedValue(undefined);

  const mod = await import('@/lib/moveFiles');
  moveTorrentFiles = mod.moveTorrentFiles;
  MoveErrorCtor = mod.MoveError;
});

function torrentStatus(overrides: Partial<{
  name: string;
  percentDone: number;
  downloadDir: string;
  files: Array<{ name: string; length: number; bytesCompleted: number }>;
}> = {}) {
  return {
    id: 1,
    name: overrides.name ?? 'Arrival (2016) [1080p] [WEBRip]',
    percentDone: overrides.percentDone ?? 1,
    status: 6,
    eta: 0,
    rateDownload: 0,
    downloadDir: overrides.downloadDir,
    files: overrides.files ?? [{ name: 'Arrival.2016.1080p.mkv', length: 1000, bytesCompleted: 1000 }],
  };
}

// ─── Pre-flight validation ───────────────────────────────────────────────

describe('pre-flight validation', () => {
  it('rejects with MoveError(400) when no movie library dir is configured', async () => {
    cfgMock.mockImplementation((key) => (key === 'tvLibraryDir' ? '/tv' : ''));
    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/library directory/);
  });

  it('rejects with MoveError(400) when TV library missing for TV content', async () => {
    cfgMock.mockImplementation((key) => (key === 'libraryDir' ? '/movies' : ''));
    // With no TV dir, falls through to movie library; if that's also missing, error.
    cfgMock.mockImplementation(() => '');
    await expect(moveTorrentFiles(1, 'tv', 1)).rejects.toThrow(/library directory/);
  });

  it('rejects when torrent is not fully downloaded', async () => {
    getTorrentStatusMock.mockResolvedValue(torrentStatus({ percentDone: 0.5 }));
    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/not fully downloaded/);
  });

  it('rejects when torrent has no files', async () => {
    getTorrentStatusMock.mockResolvedValue(torrentStatus({ files: [] }));
    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/No files/);
  });

  it('rejects when no download directory is resolvable', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'libraryDir') return '/library/movies';
      return ''; // no transmissionDownloadDir
    });
    getTorrentStatusMock.mockResolvedValue(torrentStatus({ downloadDir: undefined }));
    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/download directory/);
  });
});

// ─── Movie flow ──────────────────────────────────────────────────────────

describe('movie move flow', () => {
  it('creates a clean dest folder under the movie library', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({ name: 'Arrival (2016) [1080p] [WEBRip]' })
    );
    const result = await moveTorrentFiles(1, 'movie');
    expect(fsPromisesMock.mkdir).toHaveBeenCalledWith(
      '/library/movies/Arrival (2016)',
      { recursive: true }
    );
    expect(result.destFolder).toBe('/library/movies/Arrival (2016)');
  });

  it('copies allowed media + subtitle files and skips junk', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({
        name: 'Movie',
        files: [
          { name: 'movie.mkv', length: 1, bytesCompleted: 1 },
          { name: 'movie.en.srt', length: 1, bytesCompleted: 1 },
          { name: 'poster.jpg', length: 1, bytesCompleted: 1 }, // skipped
          { name: 'sample.nfo', length: 1, bytesCompleted: 1 }, // skipped
        ],
      })
    );
    const result = await moveTorrentFiles(1, 'movie');
    expect(result.moved).toEqual(['movie.mkv', 'movie.en.srt']);
    expect(result.skipped).toEqual(['poster.jpg', 'sample.nfo']);
    expect(fsPromisesMock.copyFile).toHaveBeenCalledTimes(2);
    expect(fsPromisesMock.unlink).toHaveBeenCalledTimes(2);
  });

  it('skips symlinks defensively (crafted torrent mitigation)', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({
        files: [
          { name: 'legit.mkv', length: 1, bytesCompleted: 1 },
          { name: 'symlink.mkv', length: 1, bytesCompleted: 1 },
        ],
      })
    );
    fsPromisesMock.lstat.mockImplementation(async (p: string) => ({
      isSymbolicLink: () => p.endsWith('symlink.mkv'),
    }));
    const result = await moveTorrentFiles(1, 'movie');
    expect(result.moved).toEqual(['legit.mkv']);
    expect(result.skipped).toEqual(['symlink.mkv']);
  });
});

// ─── TV flow ─────────────────────────────────────────────────────────────

describe('TV move flow', () => {
  it('places Season N content under <Show>/Season N', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({
        name: 'Succession S03 Complete [1080p] [BluRay]',
        files: [{ name: 'S03E01.mkv', length: 1, bytesCompleted: 1 }],
      })
    );
    const result = await moveTorrentFiles(2, 'tv', 3);
    expect(result.destFolder).toBe('/library/tv/Succession/Season 3');
  });

  it('places season=0 content directly under <Show> (all-seasons pack)', async () => {
    // cleanTvFolderName only strips a trailing " S\d\d..." suffix; square
    // brackets are not stripped for TV (unlike movie folder cleaning), so
    // the full name including the quality tag is preserved as the folder.
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({
        name: 'The Wire Complete Series [1080p]',
        files: [{ name: 'S01E01.mkv', length: 1, bytesCompleted: 1 }],
      })
    );
    const result = await moveTorrentFiles(3, 'tv', 0);
    expect(result.destFolder).toBe('/library/tv/The Wire Complete Series [1080p]');
  });

  it('falls back to movie library when tvLibraryDir is unset', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'libraryDir') return '/library/movies';
      if (key === 'transmissionDownloadDir') return '/downloads';
      return ''; // tvLibraryDir empty
    });
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({ name: 'Breaking Bad S01', files: [{ name: 'S01E01.mkv', length: 1, bytesCompleted: 1 }] })
    );
    const result = await moveTorrentFiles(4, 'tv', 1);
    expect(result.destFolder).toBe('/library/movies/Breaking Bad/Season 1');
  });
});

// ─── Concurrency guard ──────────────────────────────────────────────────

describe('concurrent-move prevention', () => {
  it('throws MoveError(400) when a move is already in progress for the same torrent', async () => {
    let releaseFirst: (() => void) | undefined;
    getTorrentStatusMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve(torrentStatus({ files: [{ name: 'a.mkv', length: 1, bytesCompleted: 1 }] }));
        })
    );
    const first = moveTorrentFiles(99, 'movie');

    // Second call while first is stalled — should reject immediately
    const err = await moveTorrentFiles(99, 'movie').catch((e) => e);
    expect(err).toBeInstanceOf(MoveErrorCtor);
    expect(err.httpStatus).toBe(400);
    expect(err.message).toMatch(/already in progress/);

    releaseFirst!();
    await first;
  });

  it('releases the guard after a failed move, allowing retry', async () => {
    getTorrentStatusMock.mockResolvedValueOnce(torrentStatus({ percentDone: 0.5 }));
    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/not fully downloaded/);

    // Retry on same id should now proceed (guard cleared in finally)
    getTorrentStatusMock.mockResolvedValueOnce(torrentStatus());
    await expect(moveTorrentFiles(1, 'movie')).resolves.toBeDefined();
  });
});

// ─── Rollback on unlink failure ─────────────────────────────────────────

describe('rollback on unlink failure', () => {
  it('removes the destination copy when source unlink fails (no duplication)', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({ files: [{ name: 'movie.mkv', length: 1, bytesCompleted: 1 }] })
    );
    fsPromisesMock.unlink.mockImplementation(async (p: string) => {
      if (p.includes('/downloads/')) throw new Error('EACCES');
      return undefined;
    });

    await expect(moveTorrentFiles(1, 'movie')).rejects.toThrow(/failed to remove source/);

    // Rollback: dest should have been unlinked. unlink was called at least twice
    // (once for source → threw, once for dest → rollback).
    const calls = fsPromisesMock.unlink.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.includes('/library/movies/'))).toBe(true);
  });
});

// ─── Post-move cleanup ──────────────────────────────────────────────────

describe('post-move cleanup', () => {
  it('removes the torrent from Transmission + registry after successful move', async () => {
    getTorrentStatusMock.mockResolvedValue(torrentStatus());
    await moveTorrentFiles(42, 'movie');
    expect(removeTorrentMock).toHaveBeenCalledWith(42);
    expect(unregisterAppTorrentMock).toHaveBeenCalledWith(42);
  });

  it('fires triggerLibraryRefresh (fire-and-forget; does not block or throw)', async () => {
    getTorrentStatusMock.mockResolvedValue(torrentStatus());
    triggerLibraryRefreshMock.mockRejectedValue(new Error('plex offline'));
    // Even if Plex refresh rejects, the move itself resolves
    await expect(moveTorrentFiles(1, 'movie')).resolves.toBeDefined();
    expect(triggerLibraryRefreshMock).toHaveBeenCalled();
  });

  it('cleans up the source torrent folder with fs.rm recursive', async () => {
    getTorrentStatusMock.mockResolvedValue(torrentStatus({ name: 'Movie Name' }));
    await moveTorrentFiles(1, 'movie');
    expect(fsPromisesMock.rm).toHaveBeenCalledWith(
      '/downloads/Movie Name',
      { recursive: true, force: true }
    );
  });
});

// ─── Path traversal defence ─────────────────────────────────────────────

describe('path-traversal defence', () => {
  it('sanitizes forward slashes in torrent names (no escape from library dir)', async () => {
    getTorrentStatusMock.mockResolvedValue(
      torrentStatus({
        name: '../etc/passwd',
        files: [{ name: 'movie.mkv', length: 1, bytesCompleted: 1 }],
      })
    );
    const result = await moveTorrentFiles(1, 'movie');
    // The dest folder must start with /library/movies/; the escape attempt
    // is neutralised by sanitizeName which replaces / and \ with -.
    expect(result.destFolder.startsWith('/library/movies/')).toBe(true);
    expect(result.destFolder).not.toContain('/etc/');
  });
});
