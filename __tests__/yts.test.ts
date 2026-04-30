/**
 * Unit tests for lib/yts.ts
 *
 * Tests the YTS torrent search logic:
 * - Title matching (exact, case-insensitive, year tolerance)
 * - 1080p quality filtering
 * - Sort order (codec, source, seeders)
 * - Magnet link construction
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchTorrents } from '@/lib/yts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeTorrent {
  hash: string;
  quality: string;
  type: string;
  video_codec: string;
  size: string;
  seeds: number;
}

interface FakeMovie {
  id: number;
  title: string;
  year: number;
  torrents?: FakeTorrent[];
}

function makeTorrent(
  quality: string,
  type: string,
  video_codec: string,
  seeds: number,
  hash = 'deadbeef123',
): FakeTorrent {
  return { hash, quality, type, video_codec, size: '5.0 GB', seeds };
}

function makeMovie(title: string, year: number, torrents: FakeTorrent[] = []): FakeMovie {
  return { id: 1, title, year, torrents };
}

function mockYts(movies: FakeMovie[]) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: { movies } }),
  } as Response);
}

function mockYtsError() {
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
}

beforeEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Title matching
// ---------------------------------------------------------------------------

describe('searchTorrents() — title matching', () => {
  it('matches exact title (case-insensitive)', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('inception', 2010);
    expect(result.torrents).toHaveLength(1);
    expect(result.torrents[0].movieTitle).toBe('Inception');
  });

  it('rejects partial title match (e.g. "Shelter" must not match "Food and Shelter")', async () => {
    mockYts([makeMovie('Food and Shelter', 2020, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Shelter', 2020);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('accepts year within ±1 tolerance', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'web', 'x265', 100)])]);
    const result = await searchTorrents('Inception', 2011);
    expect(result.torrents).toHaveLength(1);
  });

  it('falls back to year-agnostic match when year is outside ±1', async () => {
    // exactWithYear fails (gap=5), but exactAnyYear still finds it
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'web', 'x265', 100)])]);
    const result = await searchTorrents('Inception', 2015);
    expect(result.torrents).toHaveLength(1);
  });

  it('does not fall back across years when strictYear=true', async () => {
    mockYts([makeMovie('Dragonfly', 2025, [makeTorrent('1080p', 'web', 'x265', 100)])]);
    const result = await searchTorrents('Dragonfly', 2002, { strictYear: true });
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('returns empty when movie list is empty', async () => {
    mockYts([]);
    const result = await searchTorrents('Nonexistent Movie', 2020);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('returns empty when movie has no torrents', async () => {
    mockYts([makeMovie('Inception', 2010)]); // no torrents array
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('returns empty when movie has empty torrents array', async () => {
    mockYts([makeMovie('Inception', 2010, [])]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('searches without year when year parameter is undefined', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'web', 'x265', 100)])]);
    const result = await searchTorrents('Inception');
    expect(result.torrents).toHaveLength(1);
  });

  it('matches when LLM emits & but YTS stores "and"', async () => {
    mockYts([makeMovie('Rosencrantz and Guildenstern Are Dead', 1990, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Rosencrantz & Guildenstern Are Dead', 1990);
    expect(result.torrents).toHaveLength(1);
    expect(result.torrents[0].movieTitle).toBe('Rosencrantz and Guildenstern Are Dead');
  });

  it('matches when LLM emits "and" but YTS stores &', async () => {
    mockYts([makeMovie('Rosencrantz & Guildenstern Are Dead', 1990, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Rosencrantz and Guildenstern Are Dead', 1990);
    expect(result.torrents).toHaveLength(1);
  });

  it('matches singular/plural difference (e.g. "Forbidden Fruit" vs YTS "Forbidden Fruits")', async () => {
    mockYts([makeMovie('Forbidden Fruits', 2026, [makeTorrent('1080p', 'web', 'x265', 100)])]);
    const result = await searchTorrents('Forbidden Fruit', 2026);
    expect(result.torrents).toHaveLength(1);
    expect(result.torrents[0].movieTitle).toBe('Forbidden Fruits');
  });

  it('does not prefix-match when length difference exceeds 2 chars', async () => {
    mockYts([makeMovie('The Dark Knight', 2008, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('The Dark', 2008);
    expect(result.torrents).toHaveLength(0);
  });

  it('does not prefix-match when the shorter title is under 8 chars', async () => {
    mockYts([makeMovie('Parasite', 2019, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Parasit', 2019);
    expect(result.torrents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 1080p quality filtering
// ---------------------------------------------------------------------------

describe('searchTorrents() — 1080p quality filtering', () => {
  it('returns noSuitableQuality=true when only 720p is available', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('720p', 'web', 'x264', 50)])]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(true);
  });

  it('returns noSuitableQuality=true when only 480p is available', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('480p', 'web', 'x264', 50)])]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.noSuitableQuality).toBe(true);
  });

  it('filters out 720p when both 720p and 1080p exist', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('720p', 'web', 'x264', 200, 'hash720'),
        makeTorrent('1080p', 'bluray', 'x265', 50, 'hash1080'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(1);
    expect(result.torrents[0].quality).toBe('1080p');
  });

  it('returns all 1080p options when multiple exist', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'bluray', 'x265', 200, 'A'),
        makeTorrent('1080p', 'web', 'x264', 100, 'B'),
        makeTorrent('720p', 'web', 'x264', 500, 'C'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(2);
    expect(result.torrents.every((t) => t.quality === '1080p')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sort order: x265 > x264, bluray > web, seeders tiebreaker
// ---------------------------------------------------------------------------

describe('searchTorrents() — sort order', () => {
  it('places x265 before x264 at same source type', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'web', 'x264', 150, 'A'),
        makeTorrent('1080p', 'web', 'x265', 50, 'B'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0].codec).toBe('x265');
  });

  it('places bluray before web within same codec', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'web', 'x265', 200, 'A'),
        makeTorrent('1080p', 'bluray', 'x265', 50, 'B'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0].type).toBe('bluray');
  });

  it('uses seeders as tiebreaker when codec and type are identical', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'bluray', 'x265', 30, 'low'),
        makeTorrent('1080p', 'bluray', 'x265', 200, 'high'),
        makeTorrent('1080p', 'bluray', 'x265', 100, 'mid'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0].seeders).toBe(200);
  });

  it('x265 beats x264 even when x264 has far more seeders', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'web', 'x264', 1000, 'A'),
        makeTorrent('1080p', 'web', 'x265', 1, 'B'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0].codec).toBe('x265');
  });

  it('overall sort priority: x265-bluray > x265-web > x264-bluray > x264-web', async () => {
    mockYts([
      makeMovie('Inception', 2010, [
        makeTorrent('1080p', 'web', 'x264', 500, 'D'),
        makeTorrent('1080p', 'bluray', 'x264', 400, 'C'),
        makeTorrent('1080p', 'web', 'x265', 300, 'B'),
        makeTorrent('1080p', 'bluray', 'x265', 200, 'A'),
      ]),
    ]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0]).toMatchObject({ codec: 'x265', type: 'bluray' });
    expect(result.torrents[1]).toMatchObject({ codec: 'x265', type: 'web' });
    expect(result.torrents[2]).toMatchObject({ codec: 'x264', type: 'bluray' });
    expect(result.torrents[3]).toMatchObject({ codec: 'x264', type: 'web' });
  });
});

// ---------------------------------------------------------------------------
// Magnet link construction
// ---------------------------------------------------------------------------

describe('searchTorrents() — magnet links', () => {
  it('builds magnet with correct btih hash', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'bluray', 'x265', 100, 'cafebabe')])]);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents[0].magnet).toMatch(/^magnet:\?xt=urn:btih:cafebabe/);
  });

  it('builds magnet with all 8 trackers', async () => {
    mockYts([makeMovie('Inception', 2010, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Inception', 2010);
    const trackerCount = (result.torrents[0].magnet.match(/[?&]tr=/g) ?? []).length;
    expect(trackerCount).toBe(8);
  });

  it('URL-encodes the display name (dn=) in the magnet', async () => {
    mockYts([makeMovie('Avengers: Endgame', 2019, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('Avengers: Endgame', 2019);
    expect(result.torrents[0].magnet).toContain('dn=Avengers%3A%20Endgame');
  });

  it('includes movieTitle in each torrent option', async () => {
    mockYts([makeMovie('The Matrix', 1999, [makeTorrent('1080p', 'bluray', 'x265', 100)])]);
    const result = await searchTorrents('The Matrix', 1999);
    expect(result.torrents[0].movieTitle).toBe('The Matrix');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('searchTorrents() — error handling', () => {
  it('returns empty result on HTTP error', async () => {
    mockYtsError();
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('returns empty result when API response has no data.movies field', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
    expect(result.noSuitableQuality).toBe(false);
  });

  it('returns empty result when API response movies is null', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { movies: null } }),
    } as Response);
    const result = await searchTorrents('Inception', 2010);
    expect(result.torrents).toHaveLength(0);
  });
});
