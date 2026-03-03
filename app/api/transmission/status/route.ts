import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus, listActiveTorrents } from '@/lib/transmission';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');

  // No ID → return all active torrents
  if (!id) {
    try {
      const torrents = await listActiveTorrents();
      return NextResponse.json(torrents);
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
