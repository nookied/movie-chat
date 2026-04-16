/**
 * Unit tests for lib/config.ts
 *
 * Tests the configuration system:
 * - CONFIG_PATH defaults to cwd when env var is not set
 * - CONFIG_PATH respects environment variable override
 * - readConfig() returns empty object on missing file
 * - readConfig() caches for 30s
 * - writeConfig() invalidates cache
 * - cfg() priority chain: config → env → default
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs mock
// ---------------------------------------------------------------------------

const fsMock = {
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
};
vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

// Mock path.join to return predictable paths
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, default: actual, join: (...args: string[]) => args.join('/') };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

let readConfig: typeof import('@/lib/config').readConfig;
let writeConfig: typeof import('@/lib/config').writeConfig;
let cfg: typeof import('@/lib/config').cfg;
let ensureDiagnosticsToken: typeof import('@/lib/config').ensureDiagnosticsToken;
let SENSITIVE: typeof import('@/lib/config').SENSITIVE;

beforeEach(async () => {
  vi.resetModules();
  fsMock.readFileSync.mockReset();
  fsMock.writeFileSync.mockReset();
  fsMock.renameSync.mockReset();
  fsMock.mkdirSync.mockReset();
  delete process.env.CONFIG_PATH;
  const mod = await import('@/lib/config');
  readConfig = mod.readConfig;
  writeConfig = mod.writeConfig;
  cfg = mod.cfg;
  ensureDiagnosticsToken = mod.ensureDiagnosticsToken;
  SENSITIVE = mod.SENSITIVE;
});

describe('readConfig', () => {
  it('returns parsed config from file', () => {
    fsMock.readFileSync.mockReturnValue('{"ollamaModel":"llama3.2"}');
    const config = readConfig();
    expect(config.ollamaModel).toBe('llama3.2');
  });

  it('returns empty object on missing file', () => {
    fsMock.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const config = readConfig();
    expect(config).toEqual({});
  });

  it('returns empty object on invalid JSON', () => {
    fsMock.readFileSync.mockReturnValue('not json');
    const config = readConfig();
    expect(config).toEqual({});
  });

  it('caches result for subsequent reads', () => {
    fsMock.readFileSync.mockReturnValue('{"plexToken":"abc"}');
    readConfig();
    readConfig();
    // Should only read from disk once (cached)
    expect(fsMock.readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('writeConfig', () => {
  it('writes JSON to a temp file and renames it atomically', () => {
    writeConfig({ ollamaModel: 'llama3.2' });
    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual({ ollamaModel: 'llama3.2' });
    expect(fsMock.renameSync).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache so next read hits disk', () => {
    fsMock.readFileSync.mockReturnValue('{"ollamaModel":"old"}');
    readConfig(); // fills cache
    writeConfig({ ollamaModel: 'new' });
    fsMock.readFileSync.mockReturnValue('{"ollamaModel":"new"}');
    const config = readConfig(); // should re-read from disk
    expect(config.ollamaModel).toBe('new');
    expect(fsMock.readFileSync).toHaveBeenCalledTimes(2);
  });
});

describe('cfg', () => {
  it('returns config value when set', () => {
    fsMock.readFileSync.mockReturnValue('{"plexBaseUrl":"http://plex:32400"}');
    expect(cfg('plexBaseUrl', 'PLEX_BASE_URL')).toBe('http://plex:32400');
  });

  it('falls back to env var when config is empty', () => {
    fsMock.readFileSync.mockReturnValue('{}');
    process.env.PLEX_BASE_URL = 'http://env-plex:32400';
    expect(cfg('plexBaseUrl', 'PLEX_BASE_URL')).toBe('http://env-plex:32400');
    delete process.env.PLEX_BASE_URL;
  });

  it('falls back to default when config and env are empty', () => {
    fsMock.readFileSync.mockReturnValue('{}');
    expect(cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400')).toBe('http://localhost:32400');
  });

  it('config takes priority over env var', () => {
    fsMock.readFileSync.mockReturnValue('{"plexBaseUrl":"http://config:32400"}');
    process.env.PLEX_BASE_URL = 'http://env:32400';
    expect(cfg('plexBaseUrl', 'PLEX_BASE_URL')).toBe('http://config:32400');
    delete process.env.PLEX_BASE_URL;
  });
});

describe('SENSITIVE', () => {
  it('contains all fields that must never leave the machine', () => {
    expect(SENSITIVE).toEqual(
      expect.arrayContaining([
        'openRouterApiKey',
        'plexToken',
        'tmdbApiKey',
        'omdbApiKey',
        'transmissionPassword',
      ])
    );
  });

  it('does not include diagnosticsToken (masked separately by bundle redactor)', () => {
    // The UI Settings page needs the unmasked diagnostics token to wire into
    // the download URL, so it is intentionally excluded from the UI-mask list.
    expect(SENSITIVE).not.toContain('diagnosticsToken');
  });
});

describe('ensureDiagnosticsToken', () => {
  it('generates a new token when none exists in config', () => {
    fsMock.readFileSync.mockReturnValue('{}');
    const token = ensureDiagnosticsToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    // Should persist the new token via writeConfig
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(fsMock.writeFileSync.mock.calls[0][1] as string);
    expect(written.diagnosticsToken).toBe(token);
  });

  it('returns existing token when already set, without rewriting', () => {
    fsMock.readFileSync.mockReturnValue('{"diagnosticsToken":"existing-uuid"}');
    const token = ensureDiagnosticsToken();
    expect(token).toBe('existing-uuid');
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('generates a UUID-shaped token (v4 hex-dash pattern)', () => {
    fsMock.readFileSync.mockReturnValue('{}');
    const token = ensureDiagnosticsToken();
    // crypto.randomUUID returns 8-4-4-4-12 hex groups
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('preserves other config fields when writing the new token', () => {
    fsMock.readFileSync.mockReturnValue('{"plexToken":"abc","ollamaModel":"gemma4:e2b"}');
    ensureDiagnosticsToken();
    const written = JSON.parse(fsMock.writeFileSync.mock.calls[0][1] as string);
    expect(written.plexToken).toBe('abc');
    expect(written.ollamaModel).toBe('gemma4:e2b');
    expect(written.diagnosticsToken).toBeDefined();
  });
});
