/**
 * Integration tests for app/api/diagnostics/bundle/route.ts
 *
 * Covers the admin-gated bundle endpoint:
 * - 401 paths (no token, wrong token, server token unset)
 * - Filename shape (movie-chat-diagnostics-YYYY-MM-DD_HHMMSS.json)
 * - Config redaction (SENSITIVE fields + diagnosticsToken itself)
 * - Log file collection (.jsonl + .log in log dir)
 * - 50 MB bundle cap and _truncated flag
 * - Missing log dir handled gracefully
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const fsMock = {
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn<(p: string) => string[]>(),
  readFileSync: vi.fn<(p: string, enc?: string) => string>(),
  statSync: vi.fn(),
};
vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, default: actual, join: (...args: string[]) => args.join('/') };
});

const cfgMock = vi.fn<(key: string, envVar: string, def?: string) => string>();
const readConfigMock = vi.fn();
vi.mock('@/lib/config', () => ({
  cfg: cfgMock,
  readConfig: readConfigMock,
  SENSITIVE: ['openRouterApiKey', 'plexToken', 'tmdbApiKey', 'omdbApiKey', 'transmissionPassword'],
}));

vi.mock('@/lib/logger', () => ({
  getLogDir: vi.fn(() => '/tmp/movie-chat/logs'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(token?: string): NextRequest {
  const base = 'http://localhost/api/diagnostics/bundle';
  const url = token !== undefined ? `${base}?token=${encodeURIComponent(token)}` : base;
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  fsMock.existsSync.mockReset();
  fsMock.readdirSync.mockReset();
  fsMock.readFileSync.mockReset();
  fsMock.statSync.mockReset();
  cfgMock.mockReset();
  readConfigMock.mockReset();

  // Sensible defaults
  fsMock.existsSync.mockReturnValue(true);
  fsMock.readdirSync.mockReturnValue([]);
  fsMock.readFileSync.mockImplementation((p: string) => {
    if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
    return '';
  });
  cfgMock.mockImplementation((key: string) =>
    key === 'diagnosticsToken' ? 'secret-token-abc' : ''
  );
  readConfigMock.mockReturnValue({});

  const mod = await import('@/app/api/diagnostics/bundle/route');
  GET = mod.GET;
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe('auth', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when the provided token is wrong', async () => {
    const res = await GET(makeReq('wrong-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the server-side token is not configured', async () => {
    cfgMock.mockReturnValue(''); // token unset
    const res = await GET(makeReq('any-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when server and client tokens differ only in length', async () => {
    // Constant-time compare short-circuits on length; must NOT treat shorter token as a prefix match
    const res = await GET(makeReq('secret-token'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with the correct token', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Response headers & filename
// ---------------------------------------------------------------------------

describe('response headers', () => {
  it('uses application/json content type', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
  });

  it('marks the response as a download attachment with YYYY-MM-DD_HHMMSS filename', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toMatch(
      /attachment; filename="movie-chat-diagnostics-\d{4}-\d{2}-\d{2}_\d{6}\.json"/
    );
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// Bundle shape
// ---------------------------------------------------------------------------

describe('bundle body shape', () => {
  it('contains generatedAt, app, config, logs fields', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(typeof body.generatedAt).toBe('string');
    expect(body.app).toBeDefined();
    expect(body.config).toBeDefined();
    expect(body.logs).toBeDefined();
  });

  it('reads version from package.json', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.app.version).toBe('2.0.1');
  });

  it('falls back to "unknown" when package.json read fails', async () => {
    // npm sets npm_package_version when running tests, which would otherwise
    // satisfy the source's secondary fallback path (`process.env.npm_package_version`).
    const orig = process.env.npm_package_version;
    delete process.env.npm_package_version;
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    try {
      const res = await GET(makeReq('secret-token-abc'));
      const body = await res.json();
      expect(body.app.version).toBe('unknown');
    } finally {
      if (orig !== undefined) process.env.npm_package_version = orig;
    }
  });

  it('includes platform metadata (node, platform, arch, uptimeSec)', async () => {
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.app.nodeVersion).toBe(process.version);
    expect(body.app.platform).toBe(process.platform);
    expect(body.app.arch).toBe(process.arch);
    expect(typeof body.app.uptimeSec).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Config redaction
// ---------------------------------------------------------------------------

describe('config redaction', () => {
  it('redacts every SENSITIVE field that has a value', async () => {
    readConfigMock.mockReturnValue({
      openRouterApiKey: 'sk-real',
      plexToken: 'plx-token',
      tmdbApiKey: 'tmdb-key',
      omdbApiKey: 'omdb-key',
      transmissionPassword: 'tr-pw',
      plexBaseUrl: 'http://plex:32400',
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.config.openRouterApiKey).toBe('[REDACTED]');
    expect(body.config.plexToken).toBe('[REDACTED]');
    expect(body.config.tmdbApiKey).toBe('[REDACTED]');
    expect(body.config.omdbApiKey).toBe('[REDACTED]');
    expect(body.config.transmissionPassword).toBe('[REDACTED]');
    // Non-sensitive fields stay as-is
    expect(body.config.plexBaseUrl).toBe('http://plex:32400');
  });

  it('redacts diagnosticsToken in the bundle even though SENSITIVE does not include it', async () => {
    readConfigMock.mockReturnValue({
      diagnosticsToken: 'secret-token-abc',
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.config.diagnosticsToken).toBe('[REDACTED]');
  });

  it('leaves empty sensitive fields as empty (no false "[REDACTED]")', async () => {
    readConfigMock.mockReturnValue({
      openRouterApiKey: '',
      plexToken: '',
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    // Unset fields should not be populated as "[REDACTED]"
    expect(body.config.openRouterApiKey ?? '').not.toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Log file collection
// ---------------------------------------------------------------------------

describe('log collection', () => {
  it('includes every .jsonl and .log file in the log dir', async () => {
    fsMock.readdirSync.mockReturnValue([
      'movie-chat-2026-04-13.jsonl',
      'movie-chat-2026-04-12.jsonl',
      'electron.jsonl',
      'electron.1.jsonl',
      'pm2-out.log',
      'pm2-error.log',
      'README.txt', // excluded by extension
    ]);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
      return 'sample-log-line\n';
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.logs).toHaveProperty('movie-chat-2026-04-13.jsonl');
    expect(body.logs).toHaveProperty('movie-chat-2026-04-12.jsonl');
    expect(body.logs).toHaveProperty('electron.jsonl');
    expect(body.logs).toHaveProperty('electron.1.jsonl');
    expect(body.logs).toHaveProperty('pm2-out.log');
    expect(body.logs).toHaveProperty('pm2-error.log');
    expect(body.logs).not.toHaveProperty('README.txt');
  });

  it('emits log entries in chronological order (oldest first) for readability', async () => {
    fsMock.readdirSync.mockReturnValue([
      'movie-chat-2026-04-13.jsonl',
      'movie-chat-2026-04-11.jsonl',
      'movie-chat-2026-04-12.jsonl',
    ]);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
      return 'x\n';
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    const keys = Object.keys(body.logs);
    expect(keys).toEqual([
      'movie-chat-2026-04-11.jsonl',
      'movie-chat-2026-04-12.jsonl',
      'movie-chat-2026-04-13.jsonl',
    ]);
  });

  it('returns empty logs object when the log directory does not exist (ENOENT)', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    fsMock.readdirSync.mockImplementation(() => { throw enoent; });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.logs).toEqual({});
  });

  it('skips unreadable files without aborting the bundle', async () => {
    fsMock.readdirSync.mockReturnValue([
      'movie-chat-2026-04-13.jsonl',
      'movie-chat-2026-04-12.jsonl',
    ]);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
      if (p.endsWith('2026-04-12.jsonl')) throw new Error('EACCES');
      return 'ok\n';
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body.logs).toHaveProperty('movie-chat-2026-04-13.jsonl');
    expect(body.logs).not.toHaveProperty('movie-chat-2026-04-12.jsonl');
  });
});

// ---------------------------------------------------------------------------
// Size cap
// ---------------------------------------------------------------------------

describe('50 MB bundle cap', () => {
  it('drops oldest files first and sets _truncated when over cap', async () => {
    const bigChunk = 'x'.repeat(30 * 1024 * 1024); // 30 MB per file
    fsMock.readdirSync.mockReturnValue([
      'movie-chat-2026-04-13.jsonl', // newest — keep
      'movie-chat-2026-04-12.jsonl', // dropped (pushes past cap)
      'movie-chat-2026-04-11.jsonl', // dropped
    ]);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
      return bigChunk;
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body._truncated).toBe(true);
    expect(body.logs).toHaveProperty('movie-chat-2026-04-13.jsonl');
    // The 2nd file would push total over 50 MB — dropped
    const keys = Object.keys(body.logs);
    expect(keys.length).toBeLessThan(3);
  });

  it('does not set _truncated when under cap', async () => {
    fsMock.readdirSync.mockReturnValue(['movie-chat-2026-04-13.jsonl']);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"2.0.1"}';
      return 'small\n';
    });
    const res = await GET(makeReq('secret-token-abc'));
    const body = await res.json();
    expect(body._truncated).toBeUndefined();
  });
});
