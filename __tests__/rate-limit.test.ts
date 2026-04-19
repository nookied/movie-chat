import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '@/lib/rateLimit';

describe('createRateLimiter', () => {
  it('allows calls up to the configured limit', () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(check('1.1.1.1')).toBe(true);
    expect(check('1.1.1.1')).toBe(true);
    expect(check('1.1.1.1')).toBe(true);
    expect(check('1.1.1.1')).toBe(false);
  });

  it('tracks counts per-IP independently', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check('a')).toBe(true);
    expect(check('a')).toBe(true);
    expect(check('a')).toBe(false);
    expect(check('b')).toBe(true);
    expect(check('b')).toBe(true);
    expect(check('b')).toBe(false);
  });

  it('resets after the window elapses', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 10 });
    expect(check('x')).toBe(true);
    expect(check('x')).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(check('x')).toBe(true);
        resolve();
      }, 20);
    });
  });

  it('returns isolated limiters so multiple routes do not share state', () => {
    const checkA = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const checkB = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(checkA('ip')).toBe(true);
    expect(checkA('ip')).toBe(false);
    expect(checkB('ip')).toBe(true);
    expect(checkB('ip')).toBe(false);
  });
});
