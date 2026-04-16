import { NextRequest, NextResponse } from 'next/server';
import { getMovieDetails, getTvDetails, resolveMovieLookup } from '@/lib/tmdb';
import { getOmdbRatings } from '@/lib/omdb';
import { Recommendation, ReviewData, ReviewLookupResponse } from '@/types';
import { getLogger } from '@/lib/logger';

const log = getLogger('reviews');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const type = searchParams.get('type') ?? 'movie';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const yearNum = year ? Number(year) : undefined;

  if (type === 'movie' && yearNum === undefined) {
    let tmdbData: Partial<ReviewData> = {};
    let omdbData: Partial<ReviewData> = {};
    let resolvedRecommendation: Recommendation | undefined;

    try {
      const lookup = await resolveMovieLookup(title);
      if (lookup?.kind === 'ambiguous') {
        return NextResponse.json({ ambiguityCandidates: lookup.candidates } satisfies ReviewLookupResponse);
      }

      if (lookup?.kind === 'resolved') {
        tmdbData = lookup.details;
        resolvedRecommendation = {
          ...lookup.recommendation,
          strictYear: lookup.recommendation.year !== undefined,
        };
      }
    } catch (error) {
      log.error('TMDB failed', { title, year: yearNum, error: String(error) });
    }

    try {
      omdbData = await getOmdbRatings(
        resolvedRecommendation?.title ?? title,
        resolvedRecommendation?.year
      );
    } catch (error) {
      log.error('OMDB failed', { title, year: resolvedRecommendation?.year, error: String(error) });
    }

    return NextResponse.json({
      ...tmdbData,
      ...omdbData,
      ...(resolvedRecommendation ? { resolvedRecommendation } : {}),
    } satisfies ReviewLookupResponse);
  }

  // Use allSettled so one provider failing doesn't block the other
  const [tmdbResult, omdbResult] = await Promise.allSettled(
    type === 'tv'
      ? [getTvDetails(title, yearNum), getOmdbRatings(title, yearNum, 'series')]
      : [getMovieDetails(title, yearNum), getOmdbRatings(title, yearNum)]
  );

  const tmdbData = tmdbResult.status === 'fulfilled' ? tmdbResult.value : {};
  const omdbData = omdbResult.status === 'fulfilled' ? omdbResult.value : {};

  if (tmdbResult.status === 'rejected') {
    log.error('TMDB failed', { title, year: yearNum, error: String(tmdbResult.reason) });
  }
  if (omdbResult.status === 'rejected') {
    log.error('OMDB failed', { title, year: yearNum, error: String(omdbResult.reason) });
  }

  const reviews: ReviewLookupResponse = { ...tmdbData, ...omdbData };
  return NextResponse.json(reviews);
}
