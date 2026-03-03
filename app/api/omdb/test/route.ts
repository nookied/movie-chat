import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const apiKey = cfg('omdbApiKey', 'OMDB_API_KEY');

  if (!apiKey) {
    return NextResponse.json({ error: 'OMDB API key not configured' }, { status: 400 });
  }

  try {
    // Use a known title as a probe — OMDB validates the key regardless of result
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&t=Inception&y=2010`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `OMDB returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    if (data.Error === 'Invalid API key!') {
      return NextResponse.json({ error: 'Invalid OMDB API key' }, { status: 401 });
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
