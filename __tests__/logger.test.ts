/**
 * Unit tests for lib/logger.ts
 *
 * Covers the structured JSONL logger:
 * - Log entry format (ts, level, source, msg, meta)
 * - Console mirror (pm2 stdout capture compatibility)
 * - Daily filename rotation
 * - Log directory resolution (MOVIE_CHAT_LOG_DIR → CONFIG_PATH → cwd)
 * - Per-entry size cap (truncation)
 * - Per-file size cap (drop with one-time warn)
 * - Day-rollover cache reset (regression for the midnight bug)
 * - Retention pruning (files older than 7 days unlinked)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs mock — observes writes, stats, and directory reads
// ---------------------------------------------------------------------------

const fsMock = {
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn<(path: string) => string[]>(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => true),
};
vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, default: actual, join: (...args: string[]) => args.join('/') };
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

type Logger = import('@/lib/logger').Logger;

async function loadLogger(): Promise<{
  getLogger: (source: string) => Logger;
  getLogDir: () => string;
}> {
  const mod = await import('@/lib/logger');
  return { getLogger: mod.getLogger, getLogDir: mod.getLogDir };
}

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
    fsMock.appendFileSync.mockReset();
    fsMock.mkdirSync.mockReset();
    fsMock.statSync.mockReset();
    fsMock.readdirSync.mockReset();
    fsMock.unlinkSync.mockReset();
    fsMock.statSync.mockReturnValue({ size: 0 } as ReturnType<typeof import('fs').statSync>);
    fsMock.readdirSync.mockReturnValue([]);
    delete process.env.MOVIE_CHAT_LOG_DIR;
    delete process.env.CONFIG_PATH;
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── getLogDir ────────────────────────────────────────────────────────────

  describe('getLogDir', () => {
    it('uses MOVIE_CHAT_LOG_DIR env var when set', async () => {
      process.env.MOVIE_CHAT_LOG_DIR = '/custom/logs';
      const { getLogDir } = await loadLogger();
      expect(getLogDir()).toBe('/custom/logs');
    });

    it('derives from CONFIG_PATH dirname when MOVIE_CHAT_LOG_DIR absent', async () => {
      process.env.CONFIG_PATH = '/app/config.local.json';
      const { getLogDir } = await loadLogger();
      expect(getLogDir()).toBe('/app/logs');
    });

    it('falls back to ./logs under cwd', async () => {
      const { getLogDir } = await loadLogger();
      expect(getLogDir()).toMatch(/logs$/);
    });
  });

  // ─── Entry format ────────────────────────────────────────────────────────

  describe('log entry format', () => {
    it('writes JSONL with ts, level, source, msg', async () => {
      const { getLogger } = await loadLogger();
      const log = getLogger('test');
      log.info('hello');
      expect(fsMock.appendFileSync).toHaveBeenCalledTimes(1);
      const [, body] = fsMock.appendFileSync.mock.calls[0];
      const line = JSON.parse(body as string);
      expect(line.level).toBe('info');
      expect(line.source).toBe('test');
      expect(line.msg).toBe('hello');
      expect(typeof line.ts).toBe('string');
      expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes meta when provided', async () => {
      const { getLogger } = await loadLogger();
      getLogger('test').info('event', { id: 42, name: 'x' });
      const line = JSON.parse(fsMock.appendFileSync.mock.calls[0][1] as string);
      expect(line.meta).toEqual({ id: 42, name: 'x' });
    });

    it('omits meta when empty or undefined', async () => {
      const { getLogger } = await loadLogger();
      const log = getLogger('test');
      log.info('no-meta');
      log.info('empty-meta', {});
      const line1 = JSON.parse(fsMock.appendFileSync.mock.calls[0][1] as string);
      const line2 = JSON.parse(fsMock.appendFileSync.mock.calls[1][1] as string);
      expect(line1).not.toHaveProperty('meta');
      expect(line2).not.toHaveProperty('meta');
    });

    it('each line ends in newline (valid JSONL)', async () => {
      const { getLogger } = await loadLogger();
      getLogger('x').info('msg');
      const body = fsMock.appendFileSync.mock.calls[0][1] as string;
      expect(body.endsWith('\n')).toBe(true);
    });

    it('supports info, warn, error levels', async () => {
      const { getLogger } = await loadLogger();
      const log = getLogger('test');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(fsMock.appendFileSync).toHaveBeenCalledTimes(3);
      const [i, w, e] = fsMock.appendFileSync.mock.calls.map(
        (c) => JSON.parse(c[1] as string).level
      );
      expect(i).toBe('info');
      expect(w).toBe('warn');
      expect(e).toBe('error');
    });
  });

  // ─── Console mirror ──────────────────────────────────────────────────────

  describe('console mirror', () => {
    it('mirrors info to console.info with prefix', async () => {
      const spy = vi.spyOn(console, 'info');
      const { getLogger } = await loadLogger();
      getLogger('test').info('hello');
      expect(spy).toHaveBeenCalledWith('[test] hello');
    });

    it('mirrors warn to console.warn and error to console.error', async () => {
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');
      const { getLogger } = await loadLogger();
      const log = getLogger('x');
      log.warn('w');
      log.error('e');
      expect(warnSpy).toHaveBeenCalledWith('[x] w');
      expect(errorSpy).toHaveBeenCalledWith('[x] e');
    });

    it('passes meta as second console arg when present', async () => {
      const spy = vi.spyOn(console, 'info');
      const { getLogger } = await loadLogger();
      getLogger('x').info('event', { id: 1 });
      expect(spy).toHaveBeenCalledWith('[x] event', { id: 1 });
    });
  });

  // ─── Daily filename ──────────────────────────────────────────────────────

  describe('daily rotation', () => {
    it('writes to movie-chat-YYYY-MM-DD.jsonl for today', async () => {
      const { getLogger } = await loadLogger();
      getLogger('x').info('m');
      const filePath = fsMock.appendFileSync.mock.calls[0][0] as string;
      expect(filePath).toMatch(/movie-chat-\d{4}-\d{2}-\d{2}\.jsonl$/);
    });

    it('filename reflects current date', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      const { getLogger } = await loadLogger();
      getLogger('x').info('m');
      const filePath = fsMock.appendFileSync.mock.calls[0][0] as string;
      // Date formatting uses local time — just check YYYY-MM-DD shape
      expect(filePath).toMatch(/movie-chat-2026-06-\d{2}\.jsonl$/);
    });
  });

  // ─── Per-entry size cap ──────────────────────────────────────────────────

  describe('per-entry size cap', () => {
    it('truncates msg when serialized entry exceeds 32 KB', async () => {
      const { getLogger } = await loadLogger();
      const huge = 'x'.repeat(40 * 1024);
      getLogger('t').info(huge);
      const line = JSON.parse(fsMock.appendFileSync.mock.calls[0][1] as string);
      expect(line._truncated).toBe(true);
      expect(line.msg.length).toBeLessThan(huge.length);
      expect(line.msg).toMatch(/\[truncated\]$/);
      expect(line._originalBytes).toBeGreaterThan(40 * 1024);
    });

    it('leaves entries under cap untouched', async () => {
      const { getLogger } = await loadLogger();
      getLogger('t').info('short message');
      const line = JSON.parse(fsMock.appendFileSync.mock.calls[0][1] as string);
      expect(line).not.toHaveProperty('_truncated');
      expect(line._originalBytes).toBeUndefined();
    });

    it('truncation also fires when large meta pushes entry over cap', async () => {
      const { getLogger } = await loadLogger();
      const bigMeta = { blob: 'x'.repeat(40 * 1024) };
      getLogger('t').info('small', bigMeta);
      const line = JSON.parse(fsMock.appendFileSync.mock.calls[0][1] as string);
      expect(line._truncated).toBe(true);
      // Truncated entry drops the oversized meta
      expect(line.meta).toBeUndefined();
    });
  });

  // ─── Per-file size cap ───────────────────────────────────────────────────

  describe('per-file size cap', () => {
    it('drops writes when file >= 50 MB', async () => {
      fsMock.statSync.mockReturnValue({ size: 60 * 1024 * 1024 } as ReturnType<typeof import('fs').statSync>);
      const { getLogger } = await loadLogger();
      getLogger('t').info('first');
      expect(fsMock.appendFileSync).not.toHaveBeenCalled();
    });

    it('warns exactly once per day when cap is hit', async () => {
      fsMock.statSync.mockReturnValue({ size: 60 * 1024 * 1024 } as ReturnType<typeof import('fs').statSync>);
      const warnSpy = vi.spyOn(console, 'warn');
      const { getLogger } = await loadLogger();
      const log = getLogger('t');
      log.info('one');
      log.info('two');
      log.info('three');
      // Only one warning for the cap regardless of how many writes land on the cap
      const capWarnings = warnSpy.mock.calls.filter((c) =>
        typeof c[0] === 'string' && c[0].includes('File size cap')
      );
      expect(capWarnings.length).toBe(1);
    });

    it('still writes when file is under the cap', async () => {
      fsMock.statSync.mockReturnValue({ size: 1024 } as ReturnType<typeof import('fs').statSync>);
      const { getLogger } = await loadLogger();
      getLogger('t').info('ok');
      expect(fsMock.appendFileSync).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Day-rollover cache fix ─────────────────────────────────────────────

  describe('day rollover cache (regression: midnight bug)', () => {
    it('stale same-day cache is reused within 10s window', async () => {
      fsMock.statSync.mockReturnValue({ size: 100 } as ReturnType<typeof import('fs').statSync>);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T10:00:00'));
      const { getLogger } = await loadLogger();
      const log = getLogger('t');
      log.info('a');
      fsMock.statSync.mockClear();
      // Within 10s window, same day → no fresh stat
      vi.setSystemTime(new Date('2026-06-15T10:00:05'));
      log.info('b');
      expect(fsMock.statSync).not.toHaveBeenCalled();
    });

    it('forces fresh stat when the day changes even within 10s window', async () => {
      // Yesterday's file was at cap; today's fresh file must not be blocked.
      fsMock.statSync.mockReturnValue({ size: 60 * 1024 * 1024 } as ReturnType<typeof import('fs').statSync>);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-14T23:59:58'));
      const { getLogger } = await loadLogger();
      const log = getLogger('t');
      log.info('before-midnight'); // primes cache with yesterday's 60MB

      // Cross midnight; today's file is empty
      fsMock.statSync.mockReturnValue({ size: 0 } as ReturnType<typeof import('fs').statSync>);
      vi.setSystemTime(new Date('2026-06-15T00:00:01'));
      fsMock.appendFileSync.mockClear();

      log.info('after-midnight');
      // Should hit the real stat (new day forces cache bust) and succeed
      expect(fsMock.appendFileSync).toHaveBeenCalled();
    });
  });

  // ─── Retention / pruning ────────────────────────────────────────────────

  describe('retention pruning', () => {
    it('deletes files older than 7 days on first write', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      fsMock.readdirSync.mockReturnValue([
        'movie-chat-2026-06-14.jsonl', // 1 day old — keep
        'movie-chat-2026-06-08.jsonl', // 7 days old — keep (boundary)
        'movie-chat-2026-06-01.jsonl', // 14 days old — delete
        'movie-chat-2026-05-20.jsonl', // 26 days old — delete
        'pm2-out.log',                  // non-jsonl — keep
        'random.txt',                   // non-jsonl — keep
      ]);
      const { getLogger } = await loadLogger();
      getLogger('t').info('triggers prune');
      const unlinked = fsMock.unlinkSync.mock.calls.map((c) => c[0] as string);
      expect(unlinked).toEqual(expect.arrayContaining([
        expect.stringMatching(/movie-chat-2026-06-01\.jsonl$/),
        expect.stringMatching(/movie-chat-2026-05-20\.jsonl$/),
      ]));
      expect(unlinked.some((p) => p.includes('2026-06-14'))).toBe(false);
      expect(unlinked.some((p) => p.includes('pm2-out.log'))).toBe(false);
    });

    it('only prunes once per 24 h', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      fsMock.readdirSync.mockReturnValue(['movie-chat-2026-05-01.jsonl']);
      const { getLogger } = await loadLogger();
      const log = getLogger('t');
      log.info('first');
      log.info('second');
      log.info('third');
      // readdirSync runs once (first call populates lastPruneAt, subsequent bail)
      expect(fsMock.readdirSync).toHaveBeenCalledTimes(1);
    });

    it('ignores non-matching filenames during prune', async () => {
      fsMock.readdirSync.mockReturnValue([
        'README.md',
        'custom.jsonl',            // different pattern
        'custom.1.jsonl',
        'pm2-out.log',
        'movie-chat-backup.jsonl', // malformed date
      ]);
      const { getLogger } = await loadLogger();
      getLogger('t').info('prune');
      // None of these match the YYYY-MM-DD pattern in the prune regex
      expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ─── Directory creation ─────────────────────────────────────────────────

  describe('directory management', () => {
    it('creates log dir on first write if missing', async () => {
      const { getLogger } = await loadLogger();
      getLogger('t').info('first');
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/logs$/),
        { recursive: true }
      );
    });
  });

  // ─── Robustness ─────────────────────────────────────────────────────────

  describe('robustness', () => {
    it('survives appendFileSync throwing (e.g. disk full)', async () => {
      fsMock.appendFileSync.mockImplementation(() => {
        throw new Error('ENOSPC');
      });
      const { getLogger } = await loadLogger();
      // Should not throw
      expect(() => getLogger('t').info('m')).not.toThrow();
    });

    it('survives readdirSync throwing during prune', async () => {
      fsMock.readdirSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      const { getLogger } = await loadLogger();
      expect(() => getLogger('t').info('m')).not.toThrow();
    });
  });
});
