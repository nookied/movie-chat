import { Recommendation } from '@/types';

// Strip torrent noise: "Dead Mans Wire (2025) [1080p] [WEBRip]..." → "Dead Mans Wire"
export function cleanTorrentName(raw: string): string {
  return raw.replace(/\s*[\[(]?\d{4}[\])]?.*$/, '').trim() || raw;
}

export function recommendationKey(rec: Recommendation): string {
  // Include `type` so a movie and a TV show sharing the same title+year
  // (e.g. "The Office" 2001 film vs the UK series) render as distinct cards
  // instead of colliding on React's `key`.
  return `${rec.type}-${normalizeComparableTitle(rec.title)}-${rec.year ?? 'unknown'}`;
}

// Optional `season` suffix keeps TV seasons distinct in the pending-torrent map.
export function torrentKey(
  title: string,
  year?: number,
  mediaType?: Recommendation['type'],
  season?: number
): string {
  const base = `${mediaType ?? 'unknown'}-${normalizeComparableTitle(title)}-${year ?? 'unknown'}`;
  return mediaType === 'tv' && season !== undefined ? `${base}-s${season}` : base;
}

export function trackedDownloadLabel(
  title: string,
  mediaType?: 'movie' | 'tv',
  season?: number
): string {
  if (mediaType === 'tv' && season !== undefined) {
    return season === 0 ? `${title} — Complete Series` : `${title} — Season ${season}`;
  }

  return title;
}

export function trackedDownloadBaseTitle(value: string): string {
  return value.replace(/\s+—\s+(?:Complete Series|Season \d+)$/i, '').trim();
}

// "Mrs. Doubtfire" → "mrs doubtfire", "Law & Order" → "law and order", "Amélie" → "amelie"
export function normalizeComparableTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function addCappedSetEntry<T>(current: Set<T>, entry: T, maxSize: number): Set<T> {
  const next = new Set([...current, entry]);
  if (next.size > maxSize) {
    const oldest = next.values().next().value;
    if (oldest !== undefined) next.delete(oldest);
  }
  return next;
}
