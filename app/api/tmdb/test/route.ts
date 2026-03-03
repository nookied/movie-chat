import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const apiKey = cfg('tmdbApiKey', 'TMDB_API_KEY');

  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );

    if (res.status === 401) {
      return NextResponse.json({ error: 'Invalid TMDB API key' }, { status: 401 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `TMDB returned ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    const isTimeout = msg.includes('abort') || msg.includes('timeout');
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : msg },
      { status: 502 }
    );
  }
}
