import { NextRequest, NextResponse } from 'next/server';
import { fetchPopularMovies } from '@/lib/yts';
import { getLogger } from '@/lib/logger';
import type { YtsPopularSortBy } from '@/types';

const log = getLogger('torrents');

const ALLOWED_SORTS: ReadonlySet<YtsPopularSortBy> = new Set([
  'download_count',
  'rating',
  'date_added',
  'seeds',
  'year',
]);

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const rawSort = searchParams.get('sort_by');
  const sortBy: YtsPopularSortBy = rawSort && ALLOWED_SORTS.has(rawSort as YtsPopularSortBy)
    ? (rawSort as YtsPopularSortBy)
    : 'download_count';

  const rawLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? clamp(Math.floor(rawLimit), 1, 50) : 20;

  const rawPage = Number(searchParams.get('page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const ratingStr = searchParams.get('minimum_rating');
  const ratingNum = ratingStr !== null ? Number(ratingStr) : NaN;
  const minimumRating = Number.isFinite(ratingNum) ? clamp(ratingNum, 0, 9) : undefined;

  const yearStr = searchParams.get('minimum_year');
  const yearNum = yearStr !== null ? Number(yearStr) : NaN;
  const minimumYear = Number.isFinite(yearNum) && yearNum > 1900 ? Math.floor(yearNum) : undefined;

  const genre = searchParams.get('genre') ?? undefined;

  try {
    const result = await fetchPopularMovies({ sortBy, limit, page, minimumRating, minimumYear, genre });
    return NextResponse.json(result);
  } catch (err) {
    log.error('popular movies fetch failed', {
      sortBy,
      limit,
      page,
      minimumRating,
      minimumYear,
      genre,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'YTS unavailable' }, { status: 502 });
  }
}
