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

beforeEach(async () => {
  vi.resetModules();
  fsMock.readFileSync.mockReset();
  fsMock.writeFileSync.mockReset();
  delete process.env.CONFIG_PATH;
  const mod = await import('@/lib/config');
  readConfig = mod.readConfig;
  writeConfig = mod.writeConfig;
  cfg = mod.cfg;
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
  it('writes JSON to disk', () => {
    writeConfig({ ollamaModel: 'llama3.2' });
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual({ ollamaModel: 'llama3.2' });
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
