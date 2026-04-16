import { NextRequest, NextResponse } from 'next/server';
import { searchLibrary, searchLibraryWithOptions, searchTvLibrary } from '@/lib/plex';
import { getLogger } from '@/lib/logger';

const log = getLogger('plex');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year  = searchParams.get('year');
  const type  = searchParams.get('type'); // 'tv' | 'movie' (default movie)
  const strictYear = searchParams.get('strictYear') === 'true';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    if (type === 'tv') {
      const status = await searchTvLibrary(title);
      return NextResponse.json(status);
    }
    const yearNum = year ? Number(year) : undefined;
    const parsedYear = yearNum && !isNaN(yearNum) ? yearNum : undefined;
    const status = strictYear
      ? await searchLibraryWithOptions(title, parsedYear, { strictYear: true })
      : await searchLibrary(title, parsedYear);
    return NextResponse.json(status);
  } catch (err) {
    log.error('check failed', { title, type, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ found: false });
  }
}
