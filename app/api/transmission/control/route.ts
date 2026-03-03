import { NextRequest, NextResponse } from 'next/server';
import { pauseTorrent, resumeTorrent, removeTorrent } from '@/lib/transmission';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, action } = body as { id: number; action: 'pause' | 'resume' | 'remove' };

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  try {
    if (action === 'pause') await pauseTorrent(id);
    else if (action === 'resume') await resumeTorrent(id);
    else if (action === 'remove') await removeTorrent(id);
    else return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[transmission/control]', err);
    const message = err instanceof Error ? err.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
