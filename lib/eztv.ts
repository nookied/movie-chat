export interface TvTorrentResult {
  found: boolean;
  magnet?: string;
  quality?: string;
  sizeBytes?: number;
  seeders?: number;
  /** Show exists on EZTV but no complete season pack for this season */
  noSeasonPack?: boolean;
}

interface EztvTorrent {
  title: string;
  magnet_url: string;
  season: string;
  episode: string;
  seeds: number;
  size_bytes: number;
  quality: string;
}

interface EztvResponse {
  torrents?: EztvTorrent[];
}

// Normalise a string for fuzzy title matching: lowercase, strip punctuation, collapse spaces.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export async function searchTvSeason(title: string, season: number): Promise<TvTorrentResult> {
  const url = new URL('https://eztv.re/api/get-torrents');
  url.searchParams.set('query', title);
  url.searchParams.set('limit', '100');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { found: false };

  const data: EztvResponse = await res.json();
  const all = data.torrents ?? [];

  if (all.length === 0) return { found: false };

  const normTitle = norm(title);

  // Filter to torrents whose title starts with the normalised show name
  // (EZTV titles look like "Breaking Bad S05 Complete [1080p] [BluRay]")
  const matchingShow = all.filter((t) => norm(t.title).startsWith(normTitle));

  if (matchingShow.length === 0) return { found: false };

  // Filter further: season packs only (episode === '0') for the requested season
  const seasonPacks = matchingShow.filter(
    (t) => t.episode === '0' && t.season === String(season)
  );

  if (seasonPacks.length === 0) {
    // Show is on EZTV but no complete pack for this season
    return { found: true, noSeasonPack: true };
  }

  // Prefer 1080p; then sort by seeders descending
  const prefer1080 = seasonPacks.filter((t) => t.quality === '1080p');
  const candidates = prefer1080.length > 0 ? prefer1080 : seasonPacks;
  candidates.sort((a, b) => b.seeds - a.seeds);

  const best = candidates[0];
  return {
    found: true,
    magnet: best.magnet_url,
    quality: best.quality,
    sizeBytes: best.size_bytes,
    seeders: best.seeds,
  };
}
