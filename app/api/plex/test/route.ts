import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const baseUrl = cfg('plexBaseUrl', 'PLEX_BASE_URL', 'http://localhost:32400');
  const token = cfg('plexToken', 'PLEX_TOKEN');

  if (!token) {
    return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseUrl}/identity`, {
      headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401) {
      return NextResponse.json({ error: 'Invalid Plex token' }, { status: 401 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Plex returned ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    const cause = (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (cause === 'ECONNREFUSED' || msg === 'fetch failed') {
      return NextResponse.json({ error: 'Connection refused — is Plex running?' }, { status: 502 });
    }
    const isTimeout = msg.includes('abort') || msg.includes('timeout');
    return NextResponse.json(
      { error: isTimeout ? 'Connection timed out — is Plex running?' : msg },
      { status: 502 }
    );
  }
}
