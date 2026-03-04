import { ReviewData } from '@/types';
import { cfg } from '@/lib/config';

const TMDB_BASE = 'https://api.themoviedb.org/3';
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

interface TmdbTvSearchResult {
  id: number;
  name: string;
  first_air_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  genre_ids: number[];
}

interface TmdbTvDetails {
  id: number;
  name: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  number_of_seasons: number;
  seasons: Array<{ season_number: number; episode_count: number }>;
  genres: Array<{ id: number; name: string }>;
}

export async function getMovieDetails(title: string, year?: number): Promise<Partial<ReviewData>> {
  const tmdbApiKey = cfg('tmdbApiKey', 'TMDB_API_KEY');
  if (!tmdbApiKey) return {};

  // Step 1: Search for the movie
  const searchUrl = new URL(`${TMDB_BASE}/search/movie`);
  searchUrl.searchParams.set('api_key', tmdbApiKey);
  searchUrl.searchParams.set('query', title);
  if (year) searchUrl.searchParams.set('year', String(year));

  const searchRes = await fetch(searchUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) return {};

  let results: TmdbSearchResult[] = (await searchRes.json()).results ?? [];

  // If the year-qualified search found nothing, retry without the year constraint.
  // The LLM sometimes guesses the wrong year for recent releases.
  if (results.length === 0 && year) {
    const fallbackUrl = new URL(`${TMDB_BASE}/search/movie`);
    fallbackUrl.searchParams.set('api_key', tmdbApiKey);
    fallbackUrl.searchParams.set('query', title);
    const fbRes = await fetch(fallbackUrl.toString(), { signal: AbortSignal.timeout(8000) });
    if (fbRes.ok) results = (await fbRes.json()).results ?? [];
  }

  if (results.length === 0) return {};

  const movie = results[0];

  // Step 2: Fetch full details including credits
  const detailUrl = new URL(`${TMDB_BASE}/movie/${movie.id}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);
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

export async function getTvDetails(title: string, year?: number): Promise<Partial<ReviewData>> {
  const tmdbApiKey = cfg('tmdbApiKey', 'TMDB_API_KEY');
  if (!tmdbApiKey) return {};

  // Step 1: Search for the TV show
  const searchUrl = new URL(`${TMDB_BASE}/search/tv`);
  searchUrl.searchParams.set('api_key', tmdbApiKey);
  searchUrl.searchParams.set('query', title);
  if (year) searchUrl.searchParams.set('first_air_date_year', String(year));

  const searchRes = await fetch(searchUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) return {};

  let results: TmdbTvSearchResult[] = (await searchRes.json()).results ?? [];

  // If the year-qualified search found nothing, retry without the year constraint.
  // The LLM sometimes guesses the wrong year for recent releases.
  if (results.length === 0 && year) {
    const fallbackUrl = new URL(`${TMDB_BASE}/search/tv`);
    fallbackUrl.searchParams.set('api_key', tmdbApiKey);
    fallbackUrl.searchParams.set('query', title);
    const fbRes = await fetch(fallbackUrl.toString(), { signal: AbortSignal.timeout(8000) });
    if (fbRes.ok) results = (await fbRes.json()).results ?? [];
  }

  if (results.length === 0) return {};

  const show = results[0];

  // Step 2: Fetch full TV details
  const detailUrl = new URL(`${TMDB_BASE}/tv/${show.id}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);

  const detailRes = await fetch(detailUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!detailRes.ok) {
    return {
      tmdbScore: Math.round(show.vote_average * 10),
      overview: show.overview,
      poster: show.poster_path ? `${TMDB_IMAGE_BASE}${show.poster_path}` : undefined,
      tmdbId: show.id,
    };
  }

  const details: TmdbTvDetails = await detailRes.json();

  return {
    tmdbScore: Math.round(details.vote_average * 10),
    overview: details.overview,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : undefined,
    genres: details.genres.map((g) => g.name),
    // Only count seasons that have actually aired (episode_count > 0, skip season 0 "Specials")
    numberOfSeasons: details.seasons?.filter((s) => s.season_number > 0 && s.episode_count > 0).length
      ?? details.number_of_seasons,
    tmdbId: details.id,
  };
}
