import { cfg } from '@/lib/config';

const OMDB_BASE = 'http://www.omdbapi.com';
const METADATA_CACHE_SECONDS = 28800; // 8 hours — ratings rarely change

interface OmdbRating {
  Source: string;
  Value: string;
}

interface OmdbResponse {
  Response: 'True' | 'False';
  imdbRating?: string;
  Ratings?: OmdbRating[];
}

export async function getOmdbRatings(
  title: string,
  year?: number,
  type: 'movie' | 'series' = 'movie'
): Promise<{ imdbScore?: string; rtScore?: string }> {
  const omdbApiKey = cfg('omdbApiKey', 'OMDB_API_KEY');
  if (!omdbApiKey) return {};

  const url = new URL(OMDB_BASE);
  url.searchParams.set('apikey', omdbApiKey);
  url.searchParams.set('t', title);
  url.searchParams.set('type', type);
  if (year) url.searchParams.set('y', String(year));

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(6000),
    next: { revalidate: METADATA_CACHE_SECONDS },
  });
  if (!res.ok) return {};

  const data: OmdbResponse = await res.json();
  if (data.Response !== 'True') return {};

  const rtRating = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');

  return {
    imdbScore: data.imdbRating !== 'N/A' ? data.imdbRating : undefined,
    rtScore: rtRating?.Value,
  };
}
