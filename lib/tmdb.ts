import { ReviewData } from '@/types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  genre_ids: number[];
}

interface TmdbDetails {
  id: number;
  title: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  runtime: number;
  genres: Array<{ id: number; name: string }>;
  credits?: {
    crew: Array<{ job: string; name: string }>;
  };
}

export async function getMovieDetails(title: string, year?: number): Promise<Partial<ReviewData>> {
  if (!TMDB_API_KEY) return {};

  // Step 1: Search for the movie
  const searchUrl = new URL(`${TMDB_BASE}/search/movie`);
  searchUrl.searchParams.set('api_key', TMDB_API_KEY);
  searchUrl.searchParams.set('query', title);
  if (year) searchUrl.searchParams.set('year', String(year));

  const searchRes = await fetch(searchUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) return {};

  const searchData = await searchRes.json();
  const results: TmdbSearchResult[] = searchData.results ?? [];
  if (results.length === 0) return {};

  const movie = results[0];

  // Step 2: Fetch full details including credits
  const detailUrl = new URL(`${TMDB_BASE}/movie/${movie.id}`);
  detailUrl.searchParams.set('api_key', TMDB_API_KEY);
  detailUrl.searchParams.set('append_to_response', 'credits');

  const detailRes = await fetch(detailUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!detailRes.ok) {
    // Return partial data from search if detail fetch fails
    return {
      tmdbScore: Math.round(movie.vote_average * 10),
      overview: movie.overview,
      poster: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : undefined,
      tmdbId: movie.id,
    };
  }

  const details: TmdbDetails = await detailRes.json();
  const director = details.credits?.crew.find((c) => c.job === 'Director')?.name;

  return {
    tmdbScore: Math.round(details.vote_average * 10),
    overview: details.overview,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : undefined,
    genres: details.genres.map((g) => g.name),
    runtime: details.runtime,
    director,
    tmdbId: details.id,
  };
}
