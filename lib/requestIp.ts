function normalizeIp(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, '');
}

export function extractRequestIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const hops = forwardedFor
      .split(',')
      .map((part) => normalizeIp(part))
      .filter(Boolean);

    if (hops.length > 0) {
      // Use the last hop, which is the closest upstream peer. This avoids
      // trusting a client-injected first value when a proxy/server appends the
      // real remote address to the header.
      return hops[hops.length - 1];
    }
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return normalizeIp(realIp);

  return 'unknown';
}

export function isLocalAddress(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;

  const addr = normalizeIp(ip);
  if (addr === '::1') return true;

  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
