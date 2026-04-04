import { NextResponse } from 'next/server';

/** Try to reach a URL with a short timeout. Returns true if it responds with 2xx or 401/409 (auth required = service exists). */
async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    // 2xx = reachable, 401/409 = reachable but needs auth/session
    return res.ok || res.status === 401 || res.status === 409;
  } catch {
    return false;
  }
}

/** Race all candidate URLs in parallel, return the first one that responds. */
async function detectService(candidates: string[]): Promise<string | null> {
  // Each candidate resolves to its URL on success or null on failure
  const result = await Promise.any(
    candidates.map(async (url) => {
      if (await probe(url)) return url;
      throw new Error('unreachable');
    })
  ).catch(() => null);
  return result;
}

/**
 * Auto-detect reachable services on the network.
 * Returns URLs for any services found.
 */
export async function GET() {
  const [ollama, plex, transmission] = await Promise.all([
    detectService([
      'http://ollama:11434',       // Docker service name
      'http://localhost:11434',    // Local install
    ]),
    detectService([
      'http://plex:32400',         // Docker service name
      'http://localhost:32400',    // Local install
    ]),
    detectService([
      'http://transmission:9091',  // Docker service name
      'http://localhost:9091',     // Local install
    ]),
  ]);

  return NextResponse.json({
    ...(ollama && { ollama }),
    ...(plex && { plex }),
    ...(transmission && { transmission }),
  });
}
