import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus, listActiveTorrents } from '@/lib/transmission';
import { isAppTorrent, getAppTorrentMeta } from '@/lib/appTorrents';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');

  // No ID → return all active torrents, annotated with isAppTorrent flag.
  // This lets any device (not just the one that initiated the download) recognise
  // which torrents were added through this app and should be tracked/auto-moved.
  if (!id) {
    try {
      const torrents = await listActiveTorrents();
      const annotated = torrents.map((t) => ({ ...t, isAppTorrent: isAppTorrent(t.id), appMeta: getAppTorrentMeta(t.id) }));
      return NextResponse.json(annotated);
    } catch (err) {
      console.error('[transmission/status]', err);
      const message = err instanceof Error ? err.message : 'Failed to list torrents';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (isNaN(Number(id))) {
    return NextResponse.json({ error: 'Valid torrent id required' }, { status: 400 });
  }

  try {
    const status = await getTorrentStatus(Number(id));
    return NextResponse.json(status);
  } catch (err) {
    console.error('[transmission/status]', err);
    const message = err instanceof Error ? err.message : 'Failed to get status';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
