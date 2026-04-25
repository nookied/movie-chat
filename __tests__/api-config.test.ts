/**
 * Integration tests for app/api/config/route.ts.
 *
 * Covers:
 * - GET returns effective config with SENSITIVE fields masked "set"/""
 * - GET includes diagnosticsToken unmasked (needed by Settings UI)
 * - POST merges incoming fields into config
 * - POST rejects malformed / oversized / invalid bodies
 * - POST preserves existing sensitive value when client sends the "set" placeholder
 * - POST clears a field when client sends empty string
 * - POST rejects public/non-RFC1918 URL fields (SSRF defence)
 * - POST accepts localhost / private subnet URLs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const readConfigMock = vi.fn();
const writeConfigMock = vi.fn();
const cfgMock = vi.fn<(key: string, envVar: string, def?: string) => string>();

vi.mock('@/lib/config', () => ({
  readConfig: readConfigMock,
  writeConfig: writeConfigMock,
  cfg: cfgMock,
  SENSITIVE: ['openRouterApiKey', 'plexToken', 'tmdbApiKey', 'omdbApiKey', 'transmissionPassword'],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function rawPostReq(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as NextRequest;
}

let GET: typeof import('@/app/api/config/route').GET;
let POST: typeof import('@/app/api/config/route').POST;

beforeEach(async () => {
  vi.resetModules();
  readConfigMock.mockReset();
  writeConfigMock.mockReset();
  cfgMock.mockReset();

  readConfigMock.mockReturnValue({});
  cfgMock.mockReturnValue('');

  const mod = await import('@/app/api/config/route');
  GET = mod.GET;
  POST = mod.POST;
});

// ─── GET ─────────────────────────────────────────────────────────────────

describe('GET /api/config', () => {
  it('returns "set" for configured sensitive fields', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'openRouterApiKey') return 'real-key';
      if (key === 'plexToken') return 'real-token';
      if (key === 'tmdbApiKey') return 'real-tmdb';
      if (key === 'omdbApiKey') return 'real-omdb';
      if (key === 'transmissionPassword') return 'real-pw';
      return '';
    });
    const res = await GET();
    const body = await res.json();
    expect(body.openRouterApiKey).toBe('set');
    expect(body.plexToken).toBe('set');
    expect(body.tmdbApiKey).toBe('set');
    expect(body.omdbApiKey).toBe('set');
    expect(body.transmissionPassword).toBe('set');
  });

  it('returns empty string for unset sensitive fields', async () => {
    cfgMock.mockReturnValue('');
    const res = await GET();
    const body = await res.json();
    expect(body.openRouterApiKey).toBe('');
    expect(body.plexToken).toBe('');
  });

  it('returns non-sensitive URL/string fields unmasked', async () => {
    cfgMock.mockImplementation((key, envVar, def = '') => {
      if (key === 'plexBaseUrl') return 'http://192.168.1.5:32400';
      if (key === 'ollamaModel') return 'gemma4:e2b';
      return def;
    });
    const res = await GET();
    const body = await res.json();
    expect(body.plexBaseUrl).toBe('http://192.168.1.5:32400');
    expect(body.ollamaModel).toBe('gemma4:e2b');
  });

  it('returns diagnosticsToken unmasked (needed by Settings UI for download URL)', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'diagnosticsToken') return 'abc-123-def';
      return '';
    });
    const res = await GET();
    const body = await res.json();
    expect(body.diagnosticsToken).toBe('abc-123-def');
  });

  it('queries diagnosticsToken under the same env-var name the bundle route reads', async () => {
    // Regression: /api/config read DIAGNOSTICS_TOKEN while the bundle route
    // read MOVIE_CHAT_DIAGNOSTICS_TOKEN — an env-var-only operator saw the
    // token as unset in the UI while the endpoint actually worked.
    await GET();
    const diagnosticsCall = cfgMock.mock.calls.find(([key]) => key === 'diagnosticsToken');
    expect(diagnosticsCall?.[1]).toBe('MOVIE_CHAT_DIAGNOSTICS_TOKEN');
  });
});

// ─── POST: merging ──────────────────────────────────────────────────────

describe('POST /api/config — merging', () => {
  it('writes provided fields and preserves existing config', async () => {
    readConfigMock.mockReturnValue({ ollamaModel: 'old', plexBaseUrl: 'http://localhost:32400' });
    const res = await POST(postReq({ ollamaModel: 'new' }));
    expect(res.status).toBe(200);
    expect(writeConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ ollamaModel: 'new', plexBaseUrl: 'http://localhost:32400' })
    );
  });

  it('ignores undefined fields (partial update)', async () => {
    readConfigMock.mockReturnValue({ plexToken: 'existing' });
    await POST(postReq({ ollamaModel: 'gemma' }));
    expect(writeConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ plexToken: 'existing', ollamaModel: 'gemma' })
    );
  });

  it('preserves existing sensitive value when client sends the "set" placeholder', async () => {
    readConfigMock.mockReturnValue({ plexToken: 'secret' });
    await POST(postReq({ plexToken: 'set' }));
    expect(writeConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ plexToken: 'secret' })
    );
  });

  it('overwrites sensitive value when client sends a new actual string', async () => {
    readConfigMock.mockReturnValue({ plexToken: 'old-token' });
    await POST(postReq({ plexToken: 'new-token' }));
    expect(writeConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ plexToken: 'new-token' })
    );
  });

  it('deletes a field when client explicitly sends empty string', async () => {
    readConfigMock.mockReturnValue({ ollamaModel: 'gemma', plexToken: 'secret' });
    await POST(postReq({ ollamaModel: '' }));
    const written = writeConfigMock.mock.calls[0][0];
    expect(written.ollamaModel).toBeUndefined();
    expect(written.plexToken).toBe('secret'); // unrelated fields preserved
  });

  it('returns 400 on malformed JSON bodies', async () => {
    const res = await POST(rawPostReq('{'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/malformed json/i);
  });

  it('returns 413 on oversized JSON bodies', async () => {
    const huge = `"${'x'.repeat(70_000)}"`;
    const res = await POST(rawPostReq(huge, { 'Content-Length': String(huge.length) }));
    expect(res.status).toBe(413);
  });

  it('returns 400 when a config field is not a string', async () => {
    const res = await POST(postReq({ ollamaModel: 123 }));
    expect(res.status).toBe(400);
    expect(writeConfigMock).not.toHaveBeenCalled();
  });
});

// ─── POST: SSRF defence ─────────────────────────────────────────────────

describe('POST /api/config — SSRF defence on URL fields', () => {
  const publicUrls = [
    'http://example.com:32400',
    'http://8.8.8.8:32400',
    'https://malicious.evil.tld',
    'http://169.254.169.254', // AWS metadata
    'http://1.2.3.4:9091',
  ];

  const privateUrls = [
    'http://localhost:32400',
    'http://127.0.0.1:32400',
    'http://[::1]:32400',
    'http://192.168.1.5:32400',
    'http://10.0.0.1:32400',
    'http://172.16.0.1:32400',
    'http://172.31.255.255:32400',
  ];

  const urlFields = ['plexBaseUrl', 'transmissionBaseUrl', 'ollamaBaseUrl'] as const;

  for (const field of urlFields) {
    for (const url of publicUrls) {
      it(`rejects ${field}=${url} (public IP/hostname)`, async () => {
        readConfigMock.mockReturnValue({});
        const res = await POST(postReq({ [field]: url }));
        expect(res.status).toBe(400);
        expect(writeConfigMock).not.toHaveBeenCalled();
      });
    }

    for (const url of privateUrls) {
      it(`accepts ${field}=${url} (loopback/private subnet)`, async () => {
        readConfigMock.mockReturnValue({});
        const res = await POST(postReq({ [field]: url }));
        expect(res.status).toBe(200);
      });
    }
  }

  it('rejects non-http(s) protocols', async () => {
    readConfigMock.mockReturnValue({});
    const res = await POST(postReq({ plexBaseUrl: 'file:///etc/passwd' }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed URLs', async () => {
    readConfigMock.mockReturnValue({});
    const res = await POST(postReq({ plexBaseUrl: 'not a url' }));
    expect(res.status).toBe(400);
  });

  it('allows the RFC1918 172.16.x.x edge of the range', async () => {
    readConfigMock.mockReturnValue({});
    const res = await POST(postReq({ plexBaseUrl: 'http://172.16.0.1:32400' }));
    expect(res.status).toBe(200);
  });

  it('rejects 172.32.x.x (just outside the RFC1918 range)', async () => {
    readConfigMock.mockReturnValue({});
    const res = await POST(postReq({ plexBaseUrl: 'http://172.32.0.1:32400' }));
    expect(res.status).toBe(400);
  });
});
