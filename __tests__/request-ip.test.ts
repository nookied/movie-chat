import { describe, it, expect } from 'vitest';
import { extractRequestIp, isLocalAddress } from '@/lib/requestIp';

describe('extractRequestIp()', () => {
  it('returns the last x-forwarded-for hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '8.8.8.8, 192.168.1.20' });
    expect(extractRequestIp(headers)).toBe('192.168.1.20');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '10.0.0.4' });
    expect(extractRequestIp(headers)).toBe('10.0.0.4');
  });

  it('returns unknown when no IP headers are present', () => {
    expect(extractRequestIp(new Headers())).toBe('unknown');
  });
});

describe('isLocalAddress()', () => {
  it('accepts RFC-1918 IPv4 addresses', () => {
    expect(isLocalAddress('192.168.1.5')).toBe(true);
    expect(isLocalAddress('10.0.0.2')).toBe(true);
    expect(isLocalAddress('172.16.5.9')).toBe(true);
  });

  it('accepts loopback IPv4 and IPv6', () => {
    expect(isLocalAddress('127.0.0.1')).toBe(true);
    expect(isLocalAddress('::1')).toBe(true);
    expect(isLocalAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects public addresses and unknown', () => {
    expect(isLocalAddress('8.8.8.8')).toBe(false);
    expect(isLocalAddress('unknown')).toBe(false);
  });
});
