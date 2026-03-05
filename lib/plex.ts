import { PlexStatus } from '@/types';
import { cfg } from '@/lib/config';

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
  });
  if (!res.ok) return { found: false };

  const data = await res.json();
  const items: Array<Record<string, unknown>> = data?.MediaContainer?.Metadata ?? [];

  const lc = title.toLowerCase();
  function titleMatches(item: Record<string, unknown>): boolean {
    const t = String(item.title ?? '').toLowerCase();
    const o = String(item.originalTitle ?? '').toLowerCase();
    if (t === lc || o === lc) return true;
    if (t.startsWith(lc + ':') || t.startsWith(lc + ' -')) return true;
    return false;
  }

  // Only match show-type items
  const shows = items.filter((item) => item.type === 'show' && titleMatches(item));
  if (shows.length === 0) return { found: false };

  // Multiple matches — pick the closest title (exact > subtitle)
  const show = shows[0];

  // Fetch the show's children (seasons)
  const seasonsRes = await fetch(`${plexBaseUrl}/library/metadata/${show.ratingKey}/children`, {
    headers: { Accept: 'application/json', 'X-Plex-Token': plexToken },
    signal: AbortSignal.timeout(5000),
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
  });

  if (!res.ok) return { found: false };

  const data = await res.json();
  const items: Array<Record<string, unknown>> =
    data?.MediaContainer?.Metadata ?? [];

  const lc = title.toLowerCase();

  // Title passes if it's an exact match or the Plex title starts with the query
  // followed by a colon/dash (handles "Anchorman 2" → "Anchorman 2: The Legend Continues")
  function titleMatches(item: Record<string, unknown>): boolean {
    const t = String(item.title ?? '').toLowerCase();
    const o = String(item.originalTitle ?? '').toLowerCase();
    if (t === lc || o === lc) return true;
    if (t.startsWith(lc + ':') || t.startsWith(lc + ' -')) return true;
    return false;
  }

  // Step 1: title match + year ±1
  let match = items.find(
    (item) => titleMatches(item) && (year === undefined || Math.abs(Number(item.year ?? 0) - year) <= 1)
  );

  // Step 2: year-agnostic fallback — if only one item in the library has this title,
  // use it regardless of year (e.g. LLM says 2014 but library has 2026)
  if (!match) {
    const candidates = items.filter(titleMatches);
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1 && year !== undefined) {
      // Multiple — pick whichever year is closest
      match = candidates.sort(
        (a, b) => Math.abs(Number(a.year ?? 0) - year) - Math.abs(Number(b.year ?? 0) - year)
      )[0];
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
