import { NextRequest, NextResponse } from 'next/server';
import { getMovieDetails, getTvDetails } from '@/lib/tmdb';
import { getOmdbRatings } from '@/lib/omdb';
import { ReviewData } from '@/types';
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

  const reviews: ReviewData = { ...tmdbData, ...omdbData } as ReviewData;
  return NextResponse.json(reviews);
}
