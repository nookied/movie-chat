import { NextRequest, NextResponse } from 'next/server';
import { searchLibrary, searchTvLibrary } from '@/lib/plex';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year  = searchParams.get('year');
  const type  = searchParams.get('type'); // 'tv' | 'movie' (default movie)

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    if (type === 'tv') {
      const status = await searchTvLibrary(title);
      return NextResponse.json(status);
    }
    const yearNum = year ? Number(year) : undefined;
    const status = await searchLibrary(title, yearNum && !isNaN(yearNum) ? yearNum : undefined);
    return NextResponse.json(status);
  } catch (err) {
    console.error('[plex/check]', err);
    return NextResponse.json({ found: false });
  }
}
