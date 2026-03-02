import { NextRequest, NextResponse } from 'next/server';
import { searchLibrary } from '@/lib/plex';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title');
  const year = searchParams.get('year');

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const status = await searchLibrary(title, year ? Number(year) : undefined);
    return NextResponse.json(status);
  } catch (err) {
    console.error('[plex/check]', err);
    return NextResponse.json({ found: false });
  }
}
