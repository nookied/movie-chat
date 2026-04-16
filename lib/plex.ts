import { PlexStatus } from '@/types';
import { cfg } from '@/lib/config';

/** Normalise a title for comparison: lowercase, & → and, collapse whitespace. */
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
}

/** True if a Plex item's title (or originalTitle) matches the query — exact or subtitle variant. */
function titleMatches(item: Record<string, unknown>, query: string): boolean {
  const lc = query.toLowerCase();
  const norm = normalizeTitle(query);
  const t = String(item.title ?? '').toLowerCase();
  const o = String(item.originalTitle ?? '').toLowerCase();
  if (t === lc || o === lc) return true;
  if (normalizeTitle(t) === norm || normalizeTitle(o) === norm) return true;
  if (t.startsWith(lc + ':') || t.startsWith(lc + ' -')) return true;
  return false;
}

// Trigger a metadata refresh on every "movie" library section in Plex.
// Fires-and-forgets — never throws; call without awaiting from the move route.
export async function triggerLibraryRefresh(): Promise<void> {
  const plexBaseUrl = cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400');
  const plexToken   = cfg('plexToken',   'PLEX_TOKEN');
  if (!plexToken) return;

  try {
    const res = await fetch(`${plexBaseUrl}/library/sections`, {
      headers: { 'X-Plex-Token': plexToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) return;

    const data = await res.json();
    const sections: Array<Record<string, unknown>> = data?.MediaContainer?.Directory ?? [];
    const movieSections = sections.filter((s) => s.type === 'movie' || s.type === 'show');

    await Promise.all(
      movieSections.map((s) =>
        fetch(`${plexBaseUrl}/library/sections/${s.key}/refresh`, {
          headers: { 'X-Plex-Token': plexToken, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        }).catch(() => {})
      )
    );
  } catch {
    // Plex unreachable — not a critical error, move already succeeded
  }
}

/**
 * Check whether a TV show (and which of its seasons) is in the Plex library.
 * Returns { found: true, seasons: [1, 2, 3] } with the season numbers present,
 * or { found: false } if the show isn't in the library at all.
 */
export async function searchTvLibrary(title: string): Promise<PlexStatus> {
  const plexBaseUrl = cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400');
  const plexToken   = cfg('plexToken',   'PLEX_TOKEN');
  if (!plexToken) return { found: false };

  const url = new URL(`${plexBaseUrl}/search`);
  url.searchParams.set('query', title);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'X-Plex-Token': plexToken },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!res.ok) return { found: false };

  const data = await res.json();
  const items: Array<Record<string, unknown>> = data?.MediaContainer?.Metadata ?? [];

  // Only match show-type items
  const shows = items.filter((item) => item.type === 'show' && titleMatches(item, title));
  if (shows.length === 0) return { found: false };

  // Multiple matches — pick the closest title (exact > subtitle)
  const show = shows[0];

  // Fetch the show's children (seasons)
  const seasonsRes = await fetch(`${plexBaseUrl}/library/metadata/${show.ratingKey}/children`, {
    headers: { Accept: 'application/json', 'X-Plex-Token': plexToken },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!seasonsRes.ok) return { found: true, seasons: [] };

  const seasonsData = await seasonsRes.json();
  const seasonItems: Array<Record<string, unknown>> = seasonsData?.MediaContainer?.Metadata ?? [];

  // index 0 = Specials — skip those, only count real seasons
  const seasons = seasonItems
    .filter((s) => typeof s.index === 'number' && (s.index as number) > 0)
    .map((s) => s.index as number)
    .sort((a, b) => a - b);

  return { found: true, seasons };
}

export async function searchLibrary(title: string, year?: number): Promise<PlexStatus> {
  return searchLibraryWithOptions(title, year);
}

export async function searchLibraryWithOptions(
  title: string,
  year?: number,
  options: { strictYear?: boolean } = {}
): Promise<PlexStatus> {
  const plexBaseUrl = cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400');
  const plexToken   = cfg('plexToken',   'PLEX_TOKEN');

  if (!plexToken) {
    return { found: false };
  }

  const url = new URL(`${plexBaseUrl}/search`);
  url.searchParams.set('query', title);

  const res = await fetch(url.toString(), {
    // Pass token in header — never in URL query params (leaks to server logs / referrer headers)
    headers: { Accept: 'application/json', 'X-Plex-Token': plexToken },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (!res.ok) return { found: false };

  const data = await res.json();
  const items: Array<Record<string, unknown>> =
    data?.MediaContainer?.Metadata ?? [];

  // Step 1: title match + year ±1
  let match = items.find(
    (item) => titleMatches(item, title) && (year === undefined || Math.abs(Number(item.year ?? 0) - year) <= 1)
  );

  if (match) {
    return {
      found: true,
      plexUrl: `${plexBaseUrl}/web/index.html#!/server/${match.librarySectionID}/details/${match.ratingKey}`,
      addedAt: match.addedAt
        ? new Date(Number(match.addedAt) * 1000).toLocaleDateString()
        : undefined,
    };
  }

  if (options.strictYear && year !== undefined) {
    return { found: false };
  }

  // Step 2: fallback — if only one item in the library has this title, use it when
  // the year is unknown OR the gap is small (≤5 years — handles LLM year guesses being
  // slightly off). A large gap means a different version/remake; don't cross-match.
  const candidates = items.filter((item) => titleMatches(item, title));
  if (candidates.length === 1) {
    const candidateYear = Number(candidates[0].year ?? 0);
    if (year === undefined || candidateYear === 0 || Math.abs(candidateYear - year) <= 5) {
      match = candidates[0];
    }
  } else if (candidates.length > 1 && year !== undefined) {
    const sortedCandidates = [...candidates].sort(
      (a, b) => Math.abs(Number(a.year ?? 0) - year) - Math.abs(Number(b.year ?? 0) - year)
    );
    const bestMatch = sortedCandidates[0];
    const bestMatchYear = Number(bestMatch?.year ?? 0);
    if (bestMatch && bestMatchYear !== 0 && Math.abs(bestMatchYear - year) <= 5) {
      match = bestMatch;
    }
  }

  if (!match) return { found: false };

  return {
    found: true,
    plexUrl: `${plexBaseUrl}/web/index.html#!/server/${match.librarySectionID}/details/${match.ratingKey}`,
    addedAt: match.addedAt
      ? new Date(Number(match.addedAt) * 1000).toLocaleDateString()
      : undefined,
  };
}
