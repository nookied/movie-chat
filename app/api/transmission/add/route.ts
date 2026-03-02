import { NextRequest, NextResponse } from 'next/server';
import { addTorrent } from '@/lib/transmission';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { magnet } = body as { magnet: string };

  if (!magnet || !magnet.startsWith('magnet:')) {
    return NextResponse.json({ error: 'Valid magnet link required' }, { status: 400 });
  }

  try {
    const id = await addTorrent(magnet);
    return NextResponse.json({ id });
  } catch (err) {
    console.error('[transmission/add]', err);
    const message = err instanceof Error ? err.message : 'Failed to add torrent';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
