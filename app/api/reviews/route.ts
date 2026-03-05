import { NextRequest, NextResponse } from 'next/server';
import { getMovieDetails, getTvDetails } from '@/lib/tmdb';
import { getOmdbRatings } from '@/lib/omdb';
import { ReviewData } from '@/types';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const type = searchParams.get('type') ?? 'movie';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    let reviews: ReviewData;

    if (type === 'tv') {
      const [tmdbData, omdbData] = await Promise.all([
        getTvDetails(title, year ? Number(year) : undefined),
        getOmdbRatings(title, year ? Number(year) : undefined, 'series'),
      ]);
      reviews = { ...tmdbData, ...omdbData };
    } else {
      const [tmdbData, omdbData] = await Promise.all([
        getMovieDetails(title, year ? Number(year) : undefined),
        getOmdbRatings(title, year ? Number(year) : undefined),
      ]);
      reviews = { ...tmdbData, ...omdbData };
    }

    return NextResponse.json(reviews);
  } catch (err) {
    console.error('[reviews]', err);
    return NextResponse.json({});
  }
}
