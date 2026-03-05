import { NextRequest, NextResponse } from 'next/server';

/**
 * Local-network access guard.
 *
 * Allows requests from:
 *   • 127.x.x.x / ::1            — loopback (localhost)
 *   • 10.x.x.x                   — RFC-1918 class A
 *   • 172.16–31.x.x              — RFC-1918 class B
 *   • 192.168.x.x                — RFC-1918 class C
 *   • ::ffff: variants of all of the above (IPv4-mapped IPv6)
 *   • *.local Host header         — mDNS/Bonjour hostnames (e.g. MBPi5.local)
 *
 * Everything else gets a 403.
 */
function isLocalAddress(ip: string): boolean {
  if (!ip) return false;

  // Strip IPv4-mapped IPv6 prefix so the rest of the checks work uniformly
  const addr = ip.replace(/^::ffff:/i, '');

  // IPv6 loopback
  if (addr === '::1') return true;

  // IPv4 checks
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;

  return (
    a === 127 ||                          // 127.0.0.0/8  loopback
    a === 10 ||                           // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
    (a === 192 && b === 168)              // 192.168.0.0/16
  );
}

export function middleware(req: NextRequest) {
  // Allow mDNS .local hostnames (e.g. MBPi5.local:3000) — .local is a reserved
  // TLD only resolvable on the local network via Bonjour/mDNS, never on the internet
  const host = (req.headers.get('host') ?? '').split(':')[0];
  if (host.endsWith('.local')) return NextResponse.next();

  // Next.js 15+ no longer exposes req.ip; read from standard proxy / forwarded headers
  // (Next.js's own server populates x-forwarded-for for direct connections too)
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '';

  if (isLocalAddress(raw)) return NextResponse.next();

  // Return a minimal HTML page for browser requests, plain text for API calls
  const wantHtml = req.headers.get('accept')?.includes('text/html');
  if (wantHtml) {
    return new NextResponse(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>403 — Local network only</title>
  <style>
    body { margin: 0; background: #1a1a1a; color: #ccc; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; height: 100vh; }
    .box { text-align: center; }
    h1 { color: #e5a00d; font-size: 3rem; margin: 0 0 .5rem; }
    p  { font-size: 1rem; margin: 0; color: #666; }
  </style>
</head>
<body>
  <div class="box">
    <h1>403</h1>
    <p>Movie Chat is only accessible on the local network.</p>
  </div>
</body>
</html>`,
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  return new NextResponse('403 — Local network only.', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export const config = {
  // Apply to all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
