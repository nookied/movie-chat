const OMDB_BASE = 'http://www.omdbapi.com';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';

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
  year?: number
): Promise<{ imdbScore?: string; rtScore?: string }> {
  if (!OMDB_API_KEY) return {};

  const url = new URL(OMDB_BASE);
  url.searchParams.set('apikey', OMDB_API_KEY);
  url.searchParams.set('t', title);
  url.searchParams.set('type', 'movie');
  if (year) url.searchParams.set('y', String(year));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return {};

  const data: OmdbResponse = await res.json();
  if (data.Response !== 'True') return {};

  const rtRating = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');

  return {
    imdbScore: data.imdbRating !== 'N/A' ? data.imdbRating : undefined,
    rtScore: rtRating?.Value,
  };
}
