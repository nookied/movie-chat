import { NextRequest, NextResponse } from 'next/server';
import { searchTorrents } from '@/lib/yts';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year = searchParams.get('year');

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const result = await searchTorrents(title, year ? Number(year) : undefined);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[torrents/search]', err);
    return NextResponse.json({ torrents: [], noSuitableQuality: false });
  }
}
