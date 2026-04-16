import { NextRequest, NextResponse } from 'next/server';
import { addTorrent } from '@/lib/transmission';
import { registerAppTorrent } from '@/lib/appTorrents';
import { getLogger } from '@/lib/logger';
import { isPlainObject, readJsonBody, RequestBodyError } from '@/lib/requestBody';

const log = getLogger('transmission');

// Validates a magnet URI has a well-formed xt=urn:btih: infohash.
// Accepts 40-char hex (SHA1) or 32-char uppercase base32 (BitTorrent v2).
const MAGNET_RE = /^magnet:\?.*xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i;

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

  const { magnet, mediaType, season, title, year } = body as {
    magnet: string;
    mediaType?: 'movie' | 'tv';
    season?: number;
    title?: string;
    year?: number;
  };

  if (!magnet || typeof magnet !== 'string' || !MAGNET_RE.test(magnet)) {
    return NextResponse.json({ error: 'Valid magnet link required' }, { status: 400 });
  }
  if (mediaType !== undefined && mediaType !== 'movie' && mediaType !== 'tv') {
    return NextResponse.json({ error: 'mediaType must be "movie" or "tv"' }, { status: 400 });
  }
  if (season !== undefined && (!Number.isInteger(season) || season < 0)) {
    return NextResponse.json({ error: 'season must be a non-negative integer' }, { status: 400 });
  }
  if (mediaType !== 'tv' && season !== undefined) {
    return NextResponse.json({ error: 'season is only valid for TV downloads' }, { status: 400 });
  }
  if (mediaType === 'tv' && season === undefined) {
    return NextResponse.json({ error: 'season is required for TV downloads' }, { status: 400 });
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0 || title.length > 500)) {
    return NextResponse.json({ error: 'title must be a non-empty string up to 500 characters' }, { status: 400 });
  }
  if (year !== undefined && (!Number.isInteger(year) || year < 1888 || year > 3000)) {
    return NextResponse.json({ error: 'year must be a reasonable integer' }, { status: 400 });
  }

  try {
    const id = await addTorrent(magnet);
    // Persist ownership + metadata so the auto-move poller knows where to put the file
    registerAppTorrent(id, mediaType, season, title, year);
    log.info('torrent added', { id, mediaType, season, title, year });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add torrent';
    log.error('add failed', { error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
