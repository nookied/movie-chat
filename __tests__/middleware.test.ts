import { describe, expect, it, vi, beforeEach } from 'vitest';
import { extractRequestIp, isLocalAddress } from '@/lib/requestIp';

// We can't easily run the full Next.js middleware (it depends on NextRequest),
// but we CAN thoroughly test the two gate functions it relies on, since
// the middleware is just: isLocalAddress(extractRequestIp(headers)).

describe('extractRequestIp', () => {
  it('extracts the last hop from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '8.8.8.8, 192.168.1.5' });
    expect(extractRequestIp(headers)).toBe('192.168.1.5');
  });

  it('strips ::ffff: prefix from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '::ffff:192.168.1.5' });
    expect(extractRequestIp(headers)).toBe('192.168.1.5');
  });

  it('uses x-real-ip when x-forwarded-for is missing', () => {
    const headers = new Headers({ 'x-real-ip': '10.0.0.1' });
    expect(extractRequestIp(headers)).toBe('10.0.0.1');
  });

  it('returns unknown when no IP headers present', () => {
    const headers = new Headers();
    expect(extractRequestIp(headers)).toBe('unknown');
  });

  it('handles multiple hops — always picks the last (closest peer)', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.50, 70.41.3.18, 127.0.0.1',
    });
    expect(extractRequestIp(headers)).toBe('127.0.0.1');
  });

  it('handles whitespace in forwarded-for entries', () => {
    const headers = new Headers({
      'x-forwarded-for': '  10.0.0.1 , 192.168.1.1  ',
    });
    expect(extractRequestIp(headers)).toBe('192.168.1.1');
  });

  it('prefers x-forwarded-for over x-real-ip when both are present', () => {
    const headers = new Headers({
      'x-forwarded-for': '192.168.1.100',
      'x-real-ip': '10.0.0.5',
    });
    expect(extractRequestIp(headers)).toBe('192.168.1.100');
  });
});

describe('isLocalAddress', () => {
  it.each([
    '127.0.0.1',
    '127.0.1.1',
    '127.255.255.255',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    '::1',
  ])('allows local address: %s', (ip) => {
    expect(isLocalAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.0.1',    // just below 172.16
    '172.32.0.1',    // just above 172.31
    '192.169.1.1',   // not 192.168
    '11.0.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '203.0.113.50',
  ])('blocks external address: %s', (ip) => {
    expect(isLocalAddress(ip)).toBe(false);
  });

  it('rejects empty, unknown, and garbage input', () => {
    expect(isLocalAddress('')).toBe(false);
    expect(isLocalAddress('unknown')).toBe(false);
    expect(isLocalAddress('not-an-ip')).toBe(false);
    expect(isLocalAddress('999.999.999.999')).toBe(false);
  });

  it('handles ::ffff:-mapped IPv4', () => {
    // normalizeIp strips ::ffff: before checking
    expect(isLocalAddress('::ffff:192.168.1.1')).toBe(true);
    expect(isLocalAddress('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('middleware integration logic', () => {
  // Simulates the middleware's decision path without NextRequest
  function wouldAllow(headers: Record<string, string>, host?: string): boolean {
    const h = new Headers(headers);
    if (host) h.set('host', host);

    // .local hostname check (from middleware.ts:52)
    const hostHeader = (h.get('host') ?? '').split(':')[0];
    if (hostHeader.endsWith('.local')) return true;

    return isLocalAddress(extractRequestIp(h));
  }

  it('allows .local mDNS hostnames', () => {
    expect(wouldAllow({}, 'MBPi5.local:3000')).toBe(true);
    expect(wouldAllow({}, 'plex-server.local')).toBe(true);
  });

  it('blocks .local-like but not actually .local hosts', () => {
    expect(wouldAllow({}, 'evil.notlocal')).toBe(false);
    expect(wouldAllow({}, 'fake.local.evil.com')).toBe(false);
  });

  it('allows LAN clients with proper IP headers', () => {
    expect(wouldAllow({ 'x-forwarded-for': '192.168.1.42' })).toBe(true);
    expect(wouldAllow({ 'x-real-ip': '10.0.0.5' })).toBe(true);
  });

  it('blocks external IPs', () => {
    expect(wouldAllow({ 'x-forwarded-for': '203.0.113.50' })).toBe(false);
  });

  it('blocks when no IP headers and no .local host', () => {
    expect(wouldAllow({}, 'example.com')).toBe(false);
    expect(wouldAllow({})).toBe(false);
  });
});
