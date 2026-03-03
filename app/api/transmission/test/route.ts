import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const baseUrl = cfg('transmissionBaseUrl', 'TRANSMISSION_BASE_URL', 'http://localhost:9091');
  const rpcUrl = `${baseUrl}/transmission/rpc`;

  const username = cfg('transmissionUsername', 'TRANSMISSION_USERNAME');
  const password = cfg('transmissionPassword', 'TRANSMISSION_PASSWORD');
  const authHeader: Record<string, string> = {};
  if (username || password) {
    authHeader['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  try {
    // Step 1: provoke the 409 to get a session ID
    const r1 = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ method: 'session-get', arguments: { fields: ['version', 'rpc-version'] } }),
      signal: AbortSignal.timeout(5000),
    });

    const sessionId = r1.headers.get('X-Transmission-Session-Id') ?? '';
    if (!sessionId) {
      return NextResponse.json({ error: 'No session ID returned — is Transmission running?' }, { status: 502 });
    }

    // Step 2: real request with session ID
    const r2 = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': sessionId,
        ...authHeader,
      },
      body: JSON.stringify({ method: 'session-get', arguments: { fields: ['version', 'rpc-version'] } }),
      signal: AbortSignal.timeout(5000),
    });

    if (r2.status === 401) {
      return NextResponse.json({ error: 'Authentication failed — check username/password' }, { status: 401 });
    }

    const data = await r2.json();
    if (data.result !== 'success') {
      return NextResponse.json({ error: `Transmission returned: ${data.result}` }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      version: data.arguments?.version ?? 'unknown',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    const cause = (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (cause === 'ECONNREFUSED' || msg === 'fetch failed') {
      return NextResponse.json({ error: 'Connection refused — is Transmission running?' }, { status: 502 });
    }
    const isTimeout = msg.includes('abort') || msg.includes('timeout');
    return NextResponse.json(
      { error: isTimeout ? 'Connection timed out — is Transmission running?' : msg },
      { status: 502 }
    );
  }
}
