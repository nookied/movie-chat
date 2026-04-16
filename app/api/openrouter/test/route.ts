import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const apiKey = cfg('openRouterApiKey', 'OPENROUTER_API_KEY');

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'No API key configured' }, { status: 400 });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Movie Chat',
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: (body as { error?: { message?: string } })?.error?.message ?? `OpenRouter returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const models: string[] = (data.data ?? [])
      .filter((m: { pricing?: { prompt?: string | number } }) =>
        String(m.pricing?.prompt ?? '1') === '0'
      )
      .map((m: { id: string }) => m.id)
      .sort();

    return NextResponse.json({ ok: true, models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
