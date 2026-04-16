import { NextRequest, NextResponse } from 'next/server';
import { pauseTorrent, resumeTorrent, removeTorrent } from '@/lib/transmission';
import { isAppTorrent, unregisterAppTorrent } from '@/lib/appTorrents';
import { getLogger } from '@/lib/logger';
import { isPlainObject, readJsonBody, RequestBodyError } from '@/lib/requestBody';

const log = getLogger('transmission');

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

  const { id, action } = body as { id: number; action: 'pause' | 'resume' | 'remove' };

  if (!Number.isInteger(id) || id < 1 || typeof action !== 'string') {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }
  if (action !== 'pause' && action !== 'resume' && action !== 'remove') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Only allow controlling torrents that were added through this app
  if (!isAppTorrent(id)) {
    return NextResponse.json({ error: 'Torrent not managed by this app' }, { status: 403 });
  }

  try {
    if (action === 'pause') await pauseTorrent(id);
    else if (action === 'resume') await resumeTorrent(id);
    else if (action === 'remove') {
      await removeTorrent(id, true); // delete partial files from disk on cancel
      unregisterAppTorrent(id); // clean up the persistent registry
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    log.error('control failed', { id, action, error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
