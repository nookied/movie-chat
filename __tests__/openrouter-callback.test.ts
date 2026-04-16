/**
 * Tests for app/api/openrouter/callback/route.ts — OAuth PKCE key exchange
 * with CSRF state validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const readConfigMock = vi.fn();
const writeConfigMock = vi.fn();
vi.mock('@/lib/config', () => ({
  readConfig: readConfigMock,
  writeConfig: writeConfigMock,
}));

// Capture fetch calls to OpenRouter
const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

const TEST_STATE = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function getReq(url: string, cookies: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value !== undefined ? { name, value } : undefined;
      },
    },
  } as unknown as NextRequest;
}

/** Build a request with valid CSRF state so the callback proceeds to code exchange. */
function getAuthReq(params: string, extraCookies: Record<string, string> = {}): NextRequest {
  const sep = params.includes('?') ? '&' : '?';
  return getReq(
    `http://localhost/api/openrouter/callback${sep}${params}&state=${TEST_STATE}`,
    { openrouter_oauth_state: TEST_STATE, ...extraCookies },
  );
}

let GET: typeof import('@/app/api/openrouter/callback/route').GET;

beforeEach(async () => {
  vi.resetModules();
  readConfigMock.mockReturnValue({});
  writeConfigMock.mockReset();
  fetchSpy.mockReset();
  const mod = await import('@/app/api/openrouter/callback/route');
  GET = mod.GET;
});

describe('GET /api/openrouter/callback', () => {
  it('redirects to /setup?error=state_mismatch when no state is provided', async () => {
    const res = await GET(getReq('http://localhost/api/openrouter/callback'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
  });

  it('redirects to /setup?error=no_code when code param is missing', async () => {
    const res = await GET(getAuthReq(''));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('no_code');
  });

  it('exchanges code for API key and saves to config', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'sk-or-test-key-123' }),
    });

    const res = await GET(getAuthReq('code=auth-code-456'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).searchParams.get('openrouter')).toBe('connected');

    // Verify config was saved with the key
    expect(writeConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ openRouterApiKey: 'sk-or-test-key-123' }),
    );
  });

  it('passes code_verifier to OpenRouter when provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'sk-or-key' }),
    });

    await GET(getAuthReq('code=abc&code_verifier=verifier123'));

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.code_verifier).toBe('verifier123');
    expect(body.code_challenge_method).toBe('S256');
  });

  it('redirects with error when exchange returns non-ok', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false });

    const res = await GET(getAuthReq('code=bad'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('exchange_failed');
    expect(writeConfigMock).not.toHaveBeenCalled();
  });

  it('redirects with error when response has no key', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ someOtherField: 'value' }),
    });

    const res = await GET(getAuthReq('code=no-key'));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('no_key');
  });

  it('redirects with error on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('fetch failed'));

    const res = await GET(getAuthReq('code=net-err'));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('network');
  });

  it('handles malformed JSON from exchange gracefully', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('bad json'); },
    });

    const res = await GET(getAuthReq('code=bad-json'));
    // Falls through to no_key since data becomes {}
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('no_key');
  });
});

describe('CSRF state validation', () => {
  it('rejects when URL has state but cookie is missing', async () => {
    const res = await GET(getReq(
      'http://localhost/api/openrouter/callback?code=x&state=abc123',
    ));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
    expect(writeConfigMock).not.toHaveBeenCalled();
  });

  it('rejects when cookie has state but URL does not', async () => {
    const res = await GET(getReq(
      'http://localhost/api/openrouter/callback?code=x',
      { openrouter_oauth_state: 'abc123' },
    ));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
  });

  it('rejects when state values do not match', async () => {
    const res = await GET(getReq(
      'http://localhost/api/openrouter/callback?code=x&state=attacker-state',
      { openrouter_oauth_state: 'legitimate-state' },
    ));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
  });

  it('allows request when state values match', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'sk-or-valid' }),
    });

    const res = await GET(getAuthReq('code=good'));
    expect(new URL(res.headers.get('location')!).searchParams.get('openrouter')).toBe('connected');
    expect(writeConfigMock).toHaveBeenCalled();
  });

  it('rejects requests without any state', async () => {
    // No state in URL, no cookie — must be rejected
    const res = await GET(getReq('http://localhost/api/openrouter/callback?code=legacy'));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
    expect(writeConfigMock).not.toHaveBeenCalled();
  });
});
