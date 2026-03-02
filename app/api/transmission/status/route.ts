import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus } from '@/lib/transmission';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');

  if (!id || isNaN(Number(id))) {
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
