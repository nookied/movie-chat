import { PlexStatus } from '@/types';

const PLEX_BASE_URL = process.env.PLEX_BASE_URL || 'http://localhost:32400';
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';

export async function searchLibrary(title: string, year?: number): Promise<PlexStatus> {
  if (!PLEX_TOKEN) {
    return { found: false };
  }

  const url = new URL(`${PLEX_BASE_URL}/search`);
  url.searchParams.set('query', title);
  url.searchParams.set('X-Plex-Token', PLEX_TOKEN);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    // Plex is on the local network — don't follow redirects blindly
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return { found: false };

  const data = await res.json();
  const items: Array<Record<string, unknown>> =
    data?.MediaContainer?.Metadata ?? [];

  // Find a result that matches title and optionally year
  const match = items.find((item) => {
    const titleMatch =
      String(item.title ?? '').toLowerCase() === title.toLowerCase() ||
      String(item.originalTitle ?? '').toLowerCase() === title.toLowerCase();
    const yearMatch =
      year === undefined || Math.abs(Number(item.year ?? 0) - year) <= 1;
    return titleMatch && yearMatch;
  });

  if (!match) return { found: false };

  return {
    found: true,
    plexUrl: `${PLEX_BASE_URL}/web/index.html#!/server/${match.librarySectionID}/details/${match.ratingKey}`,
    addedAt: match.addedAt
      ? new Date(Number(match.addedAt) * 1000).toLocaleDateString()
      : undefined,
  };
}
