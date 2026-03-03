import { PlexStatus } from '@/types';
import { cfg } from '@/lib/config';

export async function searchLibrary(title: string, year?: number): Promise<PlexStatus> {
  const plexBaseUrl = cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400');
  const plexToken   = cfg('plexToken',   'PLEX_TOKEN');

  if (!plexToken) {
    return { found: false };
  }

  const url = new URL(`${plexBaseUrl}/search`);
  url.searchParams.set('query', title);
  url.searchParams.set('X-Plex-Token', plexToken);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    // Plex is on the local network — don't follow redirects blindly
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
