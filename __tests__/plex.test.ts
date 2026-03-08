/**
 * Unit tests for lib/plex.ts
 *
 * Tests Plex library search logic:
 * - searchLibrary(): movie title matching, year tolerance, multi-candidate selection
 * - searchTvLibrary(): show matching, season number extraction, specials filtering
 * - No-token early-exit
 * - HTTP error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchLibrary, searchTvLibrary } from '@/lib/plex';

// Mock config so cfg() always returns a token (or empty string for no-token tests)
vi.mock('@/lib/config', () => ({
  cfg: vi.fn((key: string) => {
    if (key === 'plexToken') return 'test-token';
    return 'http://plex.local:32400';
  }),
}));

import { cfg } from '@/lib/config';
const mockCfg = vi.mocked(cfg);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PlexItem {
  title?: string;
  originalTitle?: string;
  type?: string;
  year?: number;
  ratingKey?: string | number;
  librarySectionID?: string;
  addedAt?: number;
  index?: number;
}

function makeItem(overrides: PlexItem = {}): PlexItem {
  return {
    title: 'Inception',
    type: 'movie',
    year: 2010,
    ratingKey: '12345',
    librarySectionID: 'movies',
    addedAt: 1700000000,
    ...overrides,
  };
}

function mockPlex(items: PlexItem[]) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ MediaContainer: { Metadata: items } }),
  } as Response);
}

function mockPlexError() {
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
}

function setToken(token: string) {
  mockCfg.mockImplementation((key: string) => {
    if (key === 'plexToken') return token;
    return 'http://plex.local:32400';
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Restore default: token present
  setToken('test-token');
});

// ---------------------------------------------------------------------------
// searchLibrary() — basic matching
// ---------------------------------------------------------------------------

describe('searchLibrary() — basic matching', () => {
  it('returns found:true for exact title match', async () => {
    mockPlex([makeItem()]);
    const result = await searchLibrary('Inception', 2010);
    expect(result.found).toBe(true);
  });

  it('returns found:false when no items returned', async () => {
    mockPlex([]);
    const result = await searchLibrary('Inception', 2010);
    expect(result.found).toBe(false);
  });

  it('returns found:false when no Plex token is configured', async () => {
    setToken('');
    const result = await searchLibrary('Inception', 2010);
    expect(result.found).toBe(false);
  });

  it('returns found:false on HTTP error', async () => {
    mockPlexError();
    const result = await searchLibrary('Inception', 2010);
    expect(result.found).toBe(false);
  });

  it('is case-insensitive for title matching', async () => {
    mockPlex([makeItem({ title: 'INCEPTION' })]);
    const result = await searchLibrary('inception', 2010);
    expect(result.found).toBe(true);
  });

  it('matches by originalTitle field', async () => {
    mockPlex([makeItem({ title: 'Der Untergang', originalTitle: 'downfall', year: 2004 })]);
    const result = await searchLibrary('downfall', 2004);
    expect(result.found).toBe(true);
  });

  it('matches when Plex title starts with query followed by a colon', async () => {
    mockPlex([makeItem({ title: 'Anchorman 2: The Legend Continues', year: 2013 })]);
    const result = await searchLibrary('Anchorman 2', 2013);
    expect(result.found).toBe(true);
  });

  it('matches when Plex title starts with query followed by " -"', async () => {
    mockPlex([makeItem({ title: 'Blade Runner - The Final Cut', year: 1982 })]);
    const result = await searchLibrary('Blade Runner', 1982);
    expect(result.found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchLibrary() — year matching
// ---------------------------------------------------------------------------

describe('searchLibrary() — year matching', () => {
  it('matches when library year is exactly correct', async () => {
    mockPlex([makeItem({ year: 2010 })]);
    const result = await searchLibrary('Inception', 2010);
    expect(result.found).toBe(true);
  });

  it('matches when library year is ±1 from search year', async () => {
    mockPlex([makeItem({ year: 2010 })]);
    expect((await searchLibrary('Inception', 2011)).found).toBe(true);
    expect((await searchLibrary('Inception', 2009)).found).toBe(true);
  });

  it('does NOT match when library year differs by more than ±1 (Step 1)', async () => {
    // With only one candidate, Step 2 will apply — we test Step 1 logic here
    // by providing a year difference > 5 (Step 2 threshold)
    mockPlex([makeItem({ title: 'Beauty and the Beast', year: 1991 })]);
    const result = await searchLibrary('Beauty and the Beast', 2017);
    // Gap = 26 years → exceeds Step 2 ≤5 year threshold → not found
    expect(result.found).toBe(false);
  });

  it('Step 2 matches single candidate when year unknown (no year param)', async () => {
    mockPlex([makeItem({ year: 2010 })]);
    const result = await searchLibrary('Inception'); // no year
    expect(result.found).toBe(true);
  });

  it('Step 2 matches single candidate within ≤5 year gap', async () => {
    mockPlex([makeItem({ title: 'Inception', year: 2010 })]);
    // LLM guessed 2013 but library has 2010 → gap=3 → should match via Step 2
    const result = await searchLibrary('Inception', 2013);
    expect(result.found).toBe(true);
  });

  it('Step 2 rejects single candidate when gap > 5 years', async () => {
    mockPlex([makeItem({ title: 'Inception', year: 2010 })]);
    const result = await searchLibrary('Inception', 2017); // gap=7 → too far
    expect(result.found).toBe(false);
  });

  it('with multiple candidates, picks the closest year', async () => {
    mockPlex([
      makeItem({ title: 'Beauty and the Beast', year: 1991, ratingKey: '1', addedAt: 100 }),
      makeItem({ title: 'Beauty and the Beast', year: 2017, ratingKey: '2', addedAt: 200 }),
    ]);
    // Searching for 2017 → should pick the 2017 version
    const result = await searchLibrary('Beauty and the Beast', 2017);
    expect(result.found).toBe(true);
    // plexUrl should reference ratingKey '2' (the 2017 version)
    expect(result.plexUrl).toContain('2');
  });

  it('with multiple candidates, picks 1991 version when searching for 1991', async () => {
    mockPlex([
      makeItem({ title: 'Beauty and the Beast', year: 1991, ratingKey: '1', addedAt: 100 }),
      makeItem({ title: 'Beauty and the Beast', year: 2017, ratingKey: '2', addedAt: 200 }),
    ]);
    const result = await searchLibrary('Beauty and the Beast', 1991);
    expect(result.found).toBe(true);
    expect(result.plexUrl).toContain('1');
  });
});

// ---------------------------------------------------------------------------
// searchLibrary() — return values
// ---------------------------------------------------------------------------

describe('searchLibrary() — return values', () => {
  it('returns a plexUrl pointing to the matched item', async () => {
    mockPlex([makeItem({ ratingKey: '9999', librarySectionID: 'mymovies' })]);
    const result = await searchLibrary('Inception', 2010);
    expect(result.plexUrl).toContain('9999');
  });

  it('returns formatted addedAt date string', async () => {
    mockPlex([makeItem({ addedAt: 1700000000 })]);
    const result = await searchLibrary('Inception', 2010);
    expect(result.addedAt).toBeDefined();
    expect(typeof result.addedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// searchTvLibrary() — show matching
// ---------------------------------------------------------------------------

describe('searchTvLibrary() — show matching', () => {
  function mockTv(items: PlexItem[], seasons: PlexItem[] = []) {
    let call = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ MediaContainer: { Metadata: items } }) } as Response;
      }
      return { ok: true, json: async () => ({ MediaContainer: { Metadata: seasons } }) } as Response;
    });
  }

  it('returns found:false when show is not in library', async () => {
    mockTv([]);
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(false);
  });

  it('returns found:false when no Plex token configured', async () => {
    setToken('');
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(false);
  });

  it('returns found:true with season list when show is found', async () => {
    mockTv(
      [makeItem({ title: 'Breaking Bad', type: 'show', ratingKey: '100' })],
      [
        { index: 0, title: 'Specials' },     // Should be filtered out
        { index: 1, title: 'Season 1' },
        { index: 2, title: 'Season 2' },
        { index: 3, title: 'Season 3' },
      ],
    );
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(true);
    expect(result.seasons).toEqual([1, 2, 3]);
  });

  it('filters out specials (index 0) from season list', async () => {
    mockTv(
      [makeItem({ title: 'Breaking Bad', type: 'show', ratingKey: '100' })],
      [{ index: 0 }, { index: 1 }, { index: 2 }],
    );
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.seasons).toEqual([1, 2]);
    expect(result.seasons).not.toContain(0);
  });

  it('returns sorted season numbers', async () => {
    mockTv(
      [makeItem({ title: 'Breaking Bad', type: 'show', ratingKey: '100' })],
      [{ index: 3 }, { index: 1 }, { index: 2 }], // out of order
    );
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.seasons).toEqual([1, 2, 3]);
  });

  it('returns found:true with empty seasons if season fetch fails', async () => {
    let call = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ MediaContainer: { Metadata: [makeItem({ title: 'Breaking Bad', type: 'show', ratingKey: '100' })] } }) } as Response;
      }
      return { ok: false } as Response;
    });
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(true);
    expect(result.seasons).toEqual([]);
  });

  it('does not match show-type items to movie search and vice versa', async () => {
    // searchTvLibrary only matches items with type==='show'
    mockTv([makeItem({ title: 'Breaking Bad', type: 'movie' })], []);
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(false);
  });

  it('matches show title starting with query + colon', async () => {
    mockTv(
      [makeItem({ title: 'Dune: Prophecy', type: 'show', ratingKey: '200' })],
      [{ index: 1 }],
    );
    const result = await searchTvLibrary('Dune');
    expect(result.found).toBe(true);
  });

  it('returns found:false on HTTP error', async () => {
    mockPlexError();
    const result = await searchTvLibrary('Breaking Bad');
    expect(result.found).toBe(false);
  });
});
