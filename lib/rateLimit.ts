// Simple in-memory per-IP rate limiter. Shared across API routes so any
// endpoint exposed on the LAN gets consistent protection.
//
// createRateLimiter({ limit, windowMs }) returns a check(ip) function that
// returns true while the caller is under the limit. Each factory call gets its
// own isolated map so limits don't leak across routes.

// Soft ceiling on tracked IPs. The normal prune runs at most once per window;
// under a burst of unique IPs the map could still grow unboundedly, so force a
// prune (and then evict the oldest insertion-order entries if still over) when
// we exceed this threshold.
const MAX_TRACKED_IPS = 10_000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const map = new Map<string, { count: number; resetAt: number }>();
  let lastPrune = 0;

  function prune(now: number, force = false) {
    if (!force && now - lastPrune < windowMs) return;
    lastPrune = now;
    for (const [ip, entry] of map) {
      if (now > entry.resetAt) map.delete(ip);
    }
  }

  return function check(ip: string): boolean {
    const now = Date.now();
    if (map.size > MAX_TRACKED_IPS) {
      prune(now, true);
      while (map.size > MAX_TRACKED_IPS) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    } else {
      prune(now);
    }
    const entry = map.get(ip);
    if (!entry || now > entry.resetAt) {
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
