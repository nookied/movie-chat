import { NextRequest, NextResponse } from 'next/server';
import { searchTorrents } from '@/lib/yts';
import { searchTvSeason } from '@/lib/eztv';
import { getLogger } from '@/lib/logger';

const log = getLogger('torrents');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const type = searchParams.get('type') ?? 'movie';
  const season = searchParams.get('season');

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    if (type === 'tv') {
      if (!season) {
        return NextResponse.json({ error: 'season is required for TV' }, { status: 400 });
      }
      const seasonNum = Number(season);
      if (isNaN(seasonNum) || seasonNum < 1) {
        return NextResponse.json({ error: 'season must be a positive integer' }, { status: 400 });
      }
      const result = await searchTvSeason(title, seasonNum);
      return NextResponse.json(result);
    }

    const result = await searchTorrents(title, year ? Number(year) : undefined);
    return NextResponse.json(result);
  } catch (err) {
    log.error('search failed', { title, type, season, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ torrents: [], noSuitableQuality: false });
  }
}
