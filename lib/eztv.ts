// TV torrent search via Knaben (https://api.knaben.org).
// Knaben aggregates TPB, 1337x, EZTV and other trackers with real full-text search,
// pre-built magnet URLs, and seeder counts — far more reliable than TPB directly.

export interface TvTorrentResult {
  found: boolean;
  magnet?: string;
  quality?: string;
  sizeBytes?: number;
  seeders?: number;
  /** Show/season exists on trackers but no complete pack was found */
  noSeasonPack?: boolean;
}

interface KnabenHit {
  title: string;
  hash: string;
  magnetUrl: string;
  bytes: number;
  seeders: number;
}

interface KnabenResponse {
  hits: KnabenHit[];
}

async function knabSearch(query: string, size = 30): Promise<KnabenHit[]> {
  const res = await fetch('https://api.knaben.org/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, orderBy: 'seeders', orderDirection: 'desc', size }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data: KnabenResponse = await res.json();
  // Only keep hits with a valid magnet link
  return (data.hits ?? []).filter((h) => h.magnetUrl?.startsWith('magnet:'));
}

// Normalise a string for title matching: lowercase, replace separators with spaces.
// Using replace(/[^a-z0-9]+/g, ' ') so "Breaking.Bad" and "Breaking-Bad" both become "breaking bad".
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Quality tier score — higher = better.
// Resolution only: 4K=400, 1080p=300, 720p=200, unknown=100, 480p/SD=50.
// No codec bonus: a WEB-DL x264 is a cleaner source than an x265 re-encode,
// so codec efficiency is not a reliable quality signal. Size bonus in pickBest()
// handles the preference for higher-bitrate encodes within a resolution tier.
function qualityRank(name: string): number {
  const n = name.toLowerCase();
  return /2160p|4k\b/.test(n) ? 400
       : /1080p/.test(n)       ? 300
       : /720p/.test(n)        ? 200
       : /480p/.test(n)        ? 50
       : 100;
}

function parseQualityLabel(name: string): string {
  const n = name.toLowerCase();
  if (/2160p|4k\b/.test(n)) return '4K';
  if (/1080p/.test(n)) return '1080p';
  if (/720p/.test(n))  return '720p';
  if (/480p/.test(n))  return '480p';
  return 'HD';
}

// True if the torrent looks like a complete-series / multi-season pack.
function isCompletePack(name: string): boolean {
  const n = name.toLowerCase();
  // "seasons?\s+\d+" must be followed by an explicit range separator (-, to, through)
  // before a second digit — prevents "Season 1 S01 + Extras ... x265" from matching.
  return /complete|s\d{2}-s\d{2}|seasons?\s+\d+\s*([-–]|to|through)\s*\d+|the complete series/.test(n);
}

// True if the torrent is a season pack for season N — not a single episode, not a different season.
function isSeasonNPack(name: string, season: number): boolean {
  const n   = name.toLowerCase();
  const pad = String(season).padStart(2, '0');

  // Exclude individual episodes: S01E01, 1x01
  if (new RegExp(`s${pad}e\\d{2}|\\b${season}x\\d{2}\\b`).test(n)) return false;
  // Exclude cross-season ranges like "S01-S05" (complete-series packs, not a single season)
  if (/s\d{2}-s\d{2}/.test(n)) return false;
  // Exclude prose multi-season ranges: "Season 1 to 5", "Season 1 through 3", "Season 1-5"
  if (/season\s*\d+\s*(to|through|-)\s*\d+/.test(n)) return false;
  // Exclude comma-listed multi-season packs: "Season 1, 2, 3"
  if (/season\s*\d+(\s*,\s*\d+){2,}/.test(n)) return false;

  // Must contain a season-N marker: "Season 1", "S01", or standalone "S1"
  return new RegExp(`season\\s*${season}\\b|\\bs${pad}\\b|\\bs${season}\\b`).test(n);
}

// Size bonus: prefer higher-bitrate encodes within the same quality tier.
// Capped at 60 GB so monster packs (3D SBS, multi-season bundles) don't dominate.
// Max bonus ≈ 23 pts (60 GB) vs ~11 pts (5 GB) — enough to beat a re-encode but
// never enough to overcome a quality-tier difference (50+ pts between tiers).
const SIZE_CAP_BYTES = 60_000_000_000;
function sizebonus(bytes: number): number {
  return Math.log10(Math.min(bytes, SIZE_CAP_BYTES) / 1e9 + 1) * 15;
}

function pickBest(candidates: KnabenHit[]): TvTorrentResult {
  // Prefer seeded results; among those, highest (quality + size bonus) then most seeders.
  const seeded = candidates.filter((h) => h.seeders > 0);
  const pool   = seeded.length > 0 ? seeded : candidates;

  pool.sort((a, b) => {
    const scoreA = qualityRank(a.title) + sizebonus(a.bytes);
    const scoreB = qualityRank(b.title) + sizebonus(b.bytes);
    const sd = scoreB - scoreA;
    if (Math.abs(sd) > 0.01) return sd;
    return b.seeders - a.seeders;
  });

  const best = pool[0];
  return {
    found:     true,
    magnet:    best.magnetUrl,
    quality:   parseQualityLabel(best.title),
    sizeBytes: best.bytes,
    seeders:   best.seeders,
  };
}

// Exported for unit tests only — not part of the public API.
export { norm, qualityRank, isCompletePack, isSeasonNPack, sizebonus, pickBest };

/**
 * Search for a TV season pack via Knaben.
 * season = 0  →  complete series
 * season > 0  →  specific season N
 */
export async function searchTvSeason(title: string, season: number): Promise<TvTorrentResult> {
  const normTitle = norm(title);

  if (season === 0) {
    const results = await knabSearch(`${title} complete series 1080p`);
    const matches = results.filter((h) => norm(h.title).includes(normTitle) && isCompletePack(h.title));
    if (matches.length > 0) return pickBest(matches);

    // Fallback: any title match from the same query
    const any = results.filter((h) => norm(h.title).includes(normTitle));
    if (any.length > 0) return pickBest(any);

    return { found: false };
  }

  // Season-specific: parallel search with "Season N" and "SNN" notations
  const seasonPad = String(season).padStart(2, '0');
  const [byName, byCode] = await Promise.all([
    knabSearch(`${title} Season ${season} 1080p`),
    knabSearch(`${title} S${seasonPad} 1080p`),
  ]);

  // Merge, deduplicate by hash, require title match
  const seen   = new Set<string>();
  const merged: KnabenHit[] = [];
  for (const h of [...byName, ...byCode]) {
    if (h.hash && !seen.has(h.hash) && norm(h.title).includes(normTitle)) {
      seen.add(h.hash);
      merged.push(h);
    }
  }

  if (merged.length === 0) return { found: false };

  const packs = merged.filter((h) => isSeasonNPack(h.title, season));
  if (packs.length === 0) {
    // Show exists on trackers but no season pack found (only individual episodes)
    return { found: true, noSeasonPack: true };
  }

  return pickBest(packs);
}
