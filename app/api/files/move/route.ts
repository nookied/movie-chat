import { NextRequest, NextResponse } from 'next/server';
import { moveTorrentFiles, MoveError } from '@/lib/moveFiles';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { torrentId, mediaType, season } = body as {
    torrentId: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
  };

  if (!torrentId || typeof torrentId !== 'number') {
    return NextResponse.json({ error: 'torrentId required' }, { status: 400 });
  }

  try {
    const result = await moveTorrentFiles(torrentId, mediaType, season);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[files/move]', err);
    const message = err instanceof Error ? err.message : 'Failed to move file';
    const status = err instanceof MoveError ? err.httpStatus : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
