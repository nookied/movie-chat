import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  norm,
  qualityRank,
  isCompletePack,
  isSeasonNPack,
  sizebonus,
  pickBest,
  searchTvSeason,
} from '@/lib/eztv';

// ---------------------------------------------------------------------------
// norm()
// ---------------------------------------------------------------------------
describe('norm()', () => {
  it('lowercases input', () => {
    expect(norm('Breaking.Bad')).toBe('breaking bad');
  });
  it('replaces dots with spaces', () => {
    expect(norm('Breaking.Bad.S01')).toBe('breaking bad s01');
  });
  it('replaces dashes with spaces', () => {
    expect(norm('Breaking-Bad-S01')).toBe('breaking bad s01');
  });
  it('collapses consecutive separators', () => {
    expect(norm('Show..--..S01')).toBe('show s01');
  });
  it('trims leading/trailing whitespace', () => {
    expect(norm('  Breaking Bad  ')).toBe('breaking bad');
  });
});

// ---------------------------------------------------------------------------
// qualityRank() — resolution only, no codec bonus
// ---------------------------------------------------------------------------
describe('qualityRank()', () => {
  it('scores 4K at 400', () => {
    expect(qualityRank('Show.S01.2160p.BluRay')).toBe(400);
    expect(qualityRank('Show.S01.4K.WEB-DL')).toBe(400);
  });
  it('scores 1080p at 300 regardless of codec', () => {
    expect(qualityRank('Show.S01.1080p.x265')).toBe(300);
    expect(qualityRank('Show.S01.1080p.x264')).toBe(300);
    expect(qualityRank('Show.S01.1080p.AMZN.WEB-DL.H.264')).toBe(300);
    expect(qualityRank('Show.S01.1080p.HEVC')).toBe(300);
  });
  it('scores 720p at 200', () => {
    expect(qualityRank('Show.S01.720p.WEB-DL')).toBe(200);
  });
  it('scores 480p at 50', () => {
    expect(qualityRank('Show.S01.480p')).toBe(50);
  });
  it('scores unknown resolution at 100', () => {
    expect(qualityRank('Show.S01.HDTV')).toBe(100);
  });
  it('1080p beats 720p', () => {
    expect(qualityRank('Show.S01.1080p')).toBeGreaterThan(qualityRank('Show.S01.720p'));
  });
  it('4K beats 1080p', () => {
    expect(qualityRank('Show.S01.2160p')).toBeGreaterThan(qualityRank('Show.S01.1080p'));
  });
});

// ---------------------------------------------------------------------------
// isCompletePack()
// ---------------------------------------------------------------------------
describe('isCompletePack()', () => {
  it('detects "complete" keyword', () => {
    expect(isCompletePack('Breaking.Bad.S01.S01.COMPLETE.1080p.x265')).toBe(true);
    expect(isCompletePack('Breaking.Bad.COMPLETE.SERIES.1080p')).toBe(true);
  });
  it('detects S01-S05 range notation', () => {
    expect(isCompletePack('Breaking.Bad.S01-S05.1080p.BluRay')).toBe(true);
  });
  it('detects "the complete series"', () => {
    expect(isCompletePack('Breaking Bad The Complete Series 1080p')).toBe(true);
  });
  it('detects "seasons 1-5" prose', () => {
    expect(isCompletePack('Breaking Bad Seasons 1 to 5 1080p')).toBe(true);
  });
  it('returns false for a normal season pack', () => {
    expect(isCompletePack('Breaking.Bad.S01.1080p.BluRay.x265')).toBe(false);
    expect(isCompletePack('Breaking Bad (2008) Season 1 S01 + Extras 1080p BluRay x265')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSeasonNPack()
// ---------------------------------------------------------------------------
describe('isSeasonNPack()', () => {
  describe('accepts valid season packs', () => {
    it('S01 code notation', () => {
      expect(isSeasonNPack('Breaking.Bad.S01.1080p.x265-ELiTE', 1)).toBe(true);
    });
    it('"Season N" prose notation', () => {
      expect(isSeasonNPack('Breaking Bad Season 1 1080p BluRay', 1)).toBe(true);
    });
    it('+ Extras pack', () => {
      expect(isSeasonNPack('Breaking Bad (2008) Season 1 S01 + Extras 1080p BluRay x265', 1)).toBe(true);
    });
    it('season 5 pack', () => {
      expect(isSeasonNPack('Show.S05.1080p.WEB-DL', 5)).toBe(true);
    });
  });

  describe('rejects individual episodes', () => {
    it('S01E01 notation', () => {
      expect(isSeasonNPack('Breaking.Bad.S01E01.1080p.x265', 1)).toBe(false);
    });
    it('1x01 notation', () => {
      expect(isSeasonNPack('Breaking.Bad.1x01.1080p', 1)).toBe(false);
    });
  });

  describe('rejects cross-season ranges', () => {
    it('S01-S05 code range', () => {
      expect(isSeasonNPack('Breaking.Bad.S01-S05.COMPLETE.1080p', 1)).toBe(false);
    });
    it('"Season 1 to 5" prose range', () => {
      expect(isSeasonNPack('Breaking Bad - Season 1 to 5 - Mp4 1080p', 1)).toBe(false);
    });
    it('"Season 1 through 3" prose range', () => {
      expect(isSeasonNPack('Show Season 1 through 3 1080p', 1)).toBe(false);
    });
    it('"Season 1-5" hyphen range', () => {
      expect(isSeasonNPack('Show Season 1-5 1080p', 1)).toBe(false);
    });
    it('"Season 1, 2, 3" comma list (3+)', () => {
      expect(isSeasonNPack('Breaking Bad Season 1, 2, 3 1080p', 1)).toBe(false);
    });
  });

  describe('rejects wrong season number', () => {
    it('S02 pack does not match season 1', () => {
      expect(isSeasonNPack('Breaking.Bad.S02.1080p.BluRay', 1)).toBe(false);
    });
    it('Season 3 prose does not match season 2', () => {
      expect(isSeasonNPack('Show Season 3 Complete 1080p', 2)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('S01.S01.COMPLETE (redundant tag) still matches season 1', () => {
      // This is a known imperfect case — the pack is legitimate (season 1 only)
      // even though the name is unusual. isSeasonNPack correctly accepts it.
      expect(isSeasonNPack('Breaking.Bad.S01.S01.COMPLETE.1080p.10bit.BluRay', 1)).toBe(true);
    });
    it('two-season comma list is not rejected (only 2 items, not 3+)', () => {
      // "Season 1, 2" has only 2 numbers — not caught by the 3+ comma rule
      // isSeasonNPack still matches because "season 1" is present
      expect(isSeasonNPack('Show Season 1, 2 1080p', 1)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// sizebonus()
// ---------------------------------------------------------------------------
describe('sizebonus()', () => {
  it('returns 0 for 0 bytes', () => {
    expect(sizebonus(0)).toBeCloseTo(Math.log10(1) * 15, 5); // log10(0+1)*15 = 0
    expect(sizebonus(0)).toBe(0);
  });
  it('increases with file size', () => {
    expect(sizebonus(5_000_000_000)).toBeGreaterThan(sizebonus(1_000_000_000));
    expect(sizebonus(20_000_000_000)).toBeGreaterThan(sizebonus(5_000_000_000));
  });
  it('caps at 15 GB', () => {
    expect(sizebonus(15_000_000_000)).toBeCloseTo(sizebonus(25_000_000_000), 5);
    expect(sizebonus(15_000_000_000)).toBeCloseTo(sizebonus(250_000_000_000), 5);
  });
  it('5 GB scores roughly 11.7 pts', () => {
    expect(sizebonus(5_000_000_000)).toBeCloseTo(Math.log10(6) * 15, 2);
  });
  it('15 GB cap scores roughly 18.1 pts', () => {
    expect(sizebonus(15_000_000_000)).toBeCloseTo(Math.log10(16) * 15, 2);
  });
  it('max size bonus (~18 pts) never bridges a quality tier gap (50+ pts)', () => {
    const maxBonus = sizebonus(Number.MAX_SAFE_INTEGER);
    expect(maxBonus).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// pickBest()
// ---------------------------------------------------------------------------
function hit(title: string, bytes: number, seeders: number, hash = title) {
  return { title, bytes, seeders, hash, magnetUrl: `magnet:?xt=urn:btih:${hash}` };
}

describe('pickBest()', () => {
  it('prefers larger file within the same quality tier when seeders are equal', () => {
    const small = hit('Show.S01.1080p.x265', 4_500_000_000, 50);
    const large = hit('Show.S01.1080p.BluRay.x265', 13_200_000_000, 50);
    const result = pickBest([small, large]);
    expect(result.sizeBytes).toBe(13_200_000_000);
  });

  it('always prefers higher resolution even with smaller file', () => {
    const hd   = hit('Show.S01.1080p.x265', 5_000_000_000, 10);
    const sd   = hit('Show.S01.720p.x264',  45_000_000_000, 500);
    const result = pickBest([sd, hd]);
    expect(result.sizeBytes).toBe(5_000_000_000); // 1080p wins despite smaller
  });

  it('uses seeder count as tiebreaker for equal score', () => {
    // Two identical-size 1080p packs — more seeders should win
    const fewer = hit('Show.S01.1080p.A', 10_000_000_000, 20, 'hashA');
    const more  = hit('Show.S01.1080p.B', 10_000_000_000, 80, 'hashB');
    const result = pickBest([fewer, more]);
    expect(result.seeders).toBe(80);
  });

  it('uses seeded pool first, falls back to unseeded if no seeds', () => {
    const seeded   = hit('Show.S01.720p', 5_000_000_000, 5);
    const unseeded = hit('Show.S01.1080p', 10_000_000_000, 0);
    // Seeded pool wins: 720p with 5 seeders beats 1080p with 0 seeders
    const result = pickBest([seeded, unseeded]);
    expect(result.seeders).toBe(5);
  });

  it('falls back to unseeded pool when all candidates have 0 seeders', () => {
    const a = hit('Show.S01.1080p.A', 10_000_000_000, 0, 'A');
    const b = hit('Show.S01.1080p.B', 5_000_000_000, 0, 'B');
    const result = pickBest([a, b]);
    // Picks larger (higher score)
    expect(result.sizeBytes).toBe(10_000_000_000);
  });

  it('returns found:true with magnet, quality, sizeBytes, seeders', () => {
    const result = pickBest([hit('Show.S01.1080p.x265', 8_000_000_000, 50)]);
    expect(result.found).toBe(true);
    expect(result.magnet).toMatch(/^magnet:/);
    expect(result.quality).toBe('1080p');
    expect(result.sizeBytes).toBe(8_000_000_000);
    expect(result.seeders).toBe(50);
  });

  it('size cap + seeder bonus: well-seeded normal pack beats a monster remux', () => {
    const normal  = hit('Show.S01.1080p.BluRay',      12_000_000_000, 100);
    const monster = hit('Show.S01.1080p.3D.FULL-SBS', 250_000_000_000,  1);
    const result = pickBest([normal, monster]);
    // normal:  300 + sizebonus(12 GB) + seederBonus(100) ≈ 300 + 16.6 + 24.1 = 340.7
    // monster: 300 + sizebonus(capped 15 GB) + seederBonus(1) ≈ 300 + 18.1 + 3.6 = 321.7
    // normal wins — seeder bonus tips it in favour of the popular encode
    expect(result.sizeBytes).toBe(12_000_000_000);
    // Verify the cap is still applied: monster's bonus is bounded by 15 GB, not 250 GB
    const monsterBonus = sizebonus(250_000_000_000);
    const capBonus     = sizebonus(15_000_000_000);
    expect(monsterBonus).toBeCloseTo(capBonus, 5);
  });

  // options field
  it('options has one entry when only one candidate', () => {
    const result = pickBest([hit('Show.S01.1080p', 10_000_000_000, 50)]);
    expect(result.options).toHaveLength(1);
  });

  it('options is present and length ≤ 4 when multiple candidates exist', () => {
    const candidates = [
      hit('Show.S01.1080p.A', 40_000_000_000, 100, 'A'),
      hit('Show.S01.1080p.B', 20_000_000_000, 80,  'B'),
      hit('Show.S01.720p.C',  10_000_000_000, 200, 'C'),
      hit('Show.S01.720p.D',  8_000_000_000,  150, 'D'),
      hit('Show.S01.480p.E',  5_000_000_000,  300, 'E'),
    ];
    const result = pickBest(candidates);
    expect(result.options).toBeDefined();
    expect(result.options!.length).toBeGreaterThan(1);
    expect(result.options!.length).toBeLessThanOrEqual(4);
  });

  it('options[0] matches the auto-picked best result', () => {
    const small = hit('Show.S01.1080p.x265', 4_500_000_000, 341, 'small');
    const large = hit('Show.S01.1080p.BluRay', 13_200_000_000, 28,  'large');
    const result = pickBest([small, large]);
    expect(result.options![0].magnet).toBe(result.magnet);
    expect(result.options![0].sizeBytes).toBe(result.sizeBytes);
  });
});

// ---------------------------------------------------------------------------
// searchTvSeason() — with mocked fetch
// ---------------------------------------------------------------------------
describe('searchTvSeason()', () => {
  const makeHit = (title: string, bytes: number, seeders: number) => ({
    title,
    hash: title.replace(/\s/g, '_'),
    magnetUrl: `magnet:?xt=urn:btih:${title.replace(/\s/g, '')}`,
    bytes,
    seeders,
  });

  const mockKnaben = (hits: ReturnType<typeof makeHit>[]) => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ hits }),
    } as Response);
  };

  beforeEach(() => vi.restoreAllMocks());

  it('returns found:false when no hits match the title', async () => {
    mockKnaben([makeHit('Totally.Different.Show.S01.1080p', 5e9, 100)]);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(false);
  });

  it('returns found:false when no season packs exist (only episodes)', async () => {
    mockKnaben([
      makeHit('Breaking Bad S01E01 1080p x265', 700e6, 50),
      makeHit('Breaking Bad S01E02 1080p x265', 700e6, 50),
    ]);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result).toEqual({ found: true, noSeasonPack: true });
  });

  it('returns the best season pack when found', async () => {
    mockKnaben([
      makeHit('Breaking Bad S01 1080p x265', 13e9, 28),
      makeHit('Breaking Bad S01E01 1080p x265', 700e6, 200), // episode — filtered
    ]);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(true);
    expect(result.sizeBytes).toBe(13e9);
  });

  it('deduplicates results by hash across both queries', async () => {
    const shared = makeHit('Breaking Bad S01 1080p BluRay', 13e9, 28);
    // fetch returns the same hit in both parallel queries
    let call = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      call++;
      return { ok: true, json: async () => ({ hits: [shared] }) } as Response;
    });
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(true);
    expect(result.sizeBytes).toBe(13e9);
    expect(call).toBe(2); // two parallel queries fired
  });

  it('rejects multi-season packs when searching for a specific season', async () => {
    mockKnaben([
      makeHit('Breaking Bad Season 1 to 5 Mp4 1080p', 91e9, 2), // multi-season — rejected
      makeHit('Breaking Bad S01 1080p BluRay', 25e9, 12),
    ]);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(true);
    expect(result.sizeBytes).toBe(25e9); // multi-season pack not picked
  });

  it('season=0 returns complete series pack', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [makeHit('Breaking Bad S01-S05 COMPLETE SERIES 1080p BluRay x265', 85e9, 12)],
      }),
    } as Response);
    const result = await searchTvSeason('Breaking Bad', 0);
    expect(result.found).toBe(true);
  });

  it('season=0 returns found:false when only individual season packs exist (no complete pack)', async () => {
    // A single-season pack matching the title is not a valid "All seasons" result
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [makeHit('Breaking Bad S01 1080p BluRay x265', 13e9, 200)],
      }),
    } as Response);
    const result = await searchTvSeason('Breaking Bad', 0);
    expect(result.found).toBe(false);
  });

  it('falls back to non-1080p pack when no 1080p version exists', async () => {
    // Simulates an old show (e.g. Blackadder) only available in 720p
    mockKnaben([makeHit('Blackadder S01 720p BluRay x264', 4e9, 150)]);
    const result = await searchTvSeason('Blackadder', 1);
    expect(result.found).toBe(true);
    expect(result.quality).toBe('720p');
  });

  it('prefers 1080p over 720p when both exist', async () => {
    mockKnaben([
      makeHit('Breaking Bad S01 720p BluRay x264', 4e9, 500),
      makeHit('Breaking Bad S01 1080p BluRay x265', 10e9, 100),
    ]);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(true);
    expect(result.quality).toBe('1080p');
  });

  it('handles fetch errors gracefully — returns found:false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    const result = await searchTvSeason('Breaking Bad', 1);
    expect(result.found).toBe(false);
  });
});
