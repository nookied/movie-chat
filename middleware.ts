import { NextRequest, NextResponse } from 'next/server';
import { extractRequestIp, isLocalAddress } from '@/lib/requestIp';

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

const INTERNAL_APP_ORIGIN =
  process.env.INTERNAL_APP_ORIGIN ??
  `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

// Paths exempt from setup redirect — these must work before config exists
const SETUP_EXEMPT = ['/setup', '/settings', '/api/', '/_next/', '/favicon.ico', '/icon', '/apple-icon', '/manifest'];

export function middleware(req: NextRequest) {
  // ── Setup redirect: if config is incomplete, send users to the wizard ──────
  const path = req.nextUrl.pathname;
  const isExempt = SETUP_EXEMPT.some((p) => path.startsWith(p));
  if (!isExempt && !req.cookies.has('movie-chat-configured')) {
    // No cookie → check config via internal API (avoids fs in Edge runtime)
    // without reflecting the client-controlled Host header back into fetch().
    const statusUrl = new URL('/api/setup/status', INTERNAL_APP_ORIGIN);
    return fetch(statusUrl, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { complete?: boolean }) => {
        if (data.complete) {
          // Config is fine — set cookie so we skip this check for 24h
          const res = NextResponse.next();
          res.cookies.set('movie-chat-configured', '1', { maxAge: 86400, path: '/' });
          return res;
        }
        // Config incomplete → redirect to setup wizard
        return NextResponse.redirect(new URL('/setup', req.url));
      })
      .catch(() => NextResponse.next()); // if check fails, allow through — don't block the app
  }

  // ── Local-network access guard ─────────────────────────────────────────────
  // Allow mDNS .local hostnames (e.g. MBPi5.local:3000) — .local is a reserved
  // TLD only resolvable on the local network via Bonjour/mDNS, never on the internet
  const host = (req.headers.get('host') ?? '').split(':')[0];
  if (host.endsWith('.local')) return NextResponse.next();

  if (isLocalAddress(extractRequestIp(req.headers))) return NextResponse.next();

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
