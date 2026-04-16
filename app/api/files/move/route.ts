import { NextRequest, NextResponse } from 'next/server';
import { moveTorrentFiles, MoveError } from '@/lib/moveFiles';
import { getLogger } from '@/lib/logger';
import { isPlainObject, readJsonBody, RequestBodyError } from '@/lib/requestBody';

const log = getLogger('move');

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'JSON object body required' }, { status: 400 });
  }

  const { torrentId, mediaType, season } = body as {
    torrentId: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
  };

  if (!Number.isInteger(torrentId) || torrentId < 1) {
    return NextResponse.json({ error: 'torrentId required' }, { status: 400 });
  }
  if (mediaType !== undefined && mediaType !== 'movie' && mediaType !== 'tv') {
    return NextResponse.json({ error: 'mediaType must be "movie" or "tv"' }, { status: 400 });
  }
  if (season !== undefined && (!Number.isInteger(season) || season < 0)) {
    return NextResponse.json({ error: 'season must be a non-negative integer' }, { status: 400 });
  }
  if (mediaType !== 'tv' && season !== undefined) {
    return NextResponse.json({ error: 'season is only valid for TV moves' }, { status: 400 });
  }

  try {
    const result = await moveTorrentFiles(torrentId, mediaType, season);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move file';
    log.error('move failed', { torrentId, error: message });
    const status = err instanceof MoveError ? err.httpStatus : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
