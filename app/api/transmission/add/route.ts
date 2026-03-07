import { NextRequest, NextResponse } from 'next/server';
import { addTorrent } from '@/lib/transmission';
import { registerAppTorrent } from '@/lib/appTorrents';

// Validates a magnet URI has a well-formed xt=urn:btih: infohash.
// Accepts 40-char hex (SHA1) or 32-char uppercase base32 (BitTorrent v2).
const MAGNET_RE = /^magnet:\?.*xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { magnet, mediaType, season, year } = body as {
    magnet: string;
    mediaType?: 'movie' | 'tv';
    season?: number;
    year?: number;
  };

  if (!magnet || typeof magnet !== 'string' || !MAGNET_RE.test(magnet)) {
    return NextResponse.json({ error: 'Valid magnet link required' }, { status: 400 });
  }

  try {
    const id = await addTorrent(magnet);
    // Persist ownership + metadata so the auto-move poller knows where to put the file
    registerAppTorrent(id, mediaType, season, year);
    return NextResponse.json({ id });
  } catch (err) {
    console.error('[transmission/add]', err);
    const message = err instanceof Error ? err.message : 'Failed to add torrent';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
