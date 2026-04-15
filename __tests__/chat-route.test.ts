/**
 * Integration tests for app/api/chat/route.ts — the POST handler.
 *
 * Covers:
 * - Input validation (400 on missing messages)
 * - Rate limiting (429 after 30 requests per minute per IP + warn log)
 * - 503 when neither OpenRouter key nor Ollama is configured in default mode
 * - OpenRouter success path (streaming, chat log emitted at stream close)
 * - OpenRouter failure → Ollama fallback path
 * - All providers failed → 502 + error log
 * - ollamaOnly config skips OpenRouter
 * - forceOllama flag skips OpenRouter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const cfgMock = vi.fn<(key: string, envVar: string, def?: string) => string>();
vi.mock('@/lib/config', () => ({ cfg: cfgMock }));

const logMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ getLogger: vi.fn(() => logMock) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function sseResponse(tokens: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const t of tokens) {
        const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
        controller.enqueue(encoder.encode(frame));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function openRouterKeyOnly(key: string, envVar: string): string {
  if (key === 'openRouterApiKey') return 'or-sk-123';
  if (key === 'openRouterModel') return 'mistralai/mistral-small-3.1-24b-instruct:free';
  return '';
}

function ollamaOnlyConfig(key: string): string {
  if (key === 'ollamaOnly') return 'true';
  if (key === 'ollamaModel') return 'gemma4:e2b';
  if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
  return '';
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

let POST: typeof import('@/app/api/chat/route').POST;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  cfgMock.mockReset();
  logMock.info.mockReset();
  logMock.warn.mockReset();
  logMock.error.mockReset();
  fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('no mock set'));
  const mod = await import('@/app/api/chat/route');
  POST = mod.POST;
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── Input validation ────────────────────────────────────────────────────

describe('input validation', () => {
  it('returns 400 when messages is missing', async () => {
    cfgMock.mockReturnValue('');
    const res = await POST(makeReq({}, '10.0.0.1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/messages/i);
  });

  it('returns 400 when messages is not an array', async () => {
    cfgMock.mockReturnValue('');
    const res = await POST(makeReq({ messages: 'not-an-array' }, '10.0.0.2'));
    expect(res.status).toBe(400);
  });
});

// ─── Rate limiting ───────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('returns 429 after 30 requests within the window from the same IP', async () => {
    cfgMock.mockReturnValue('');
    for (let i = 0; i < 30; i++) {
      await POST(makeReq({}, '9.9.9.9'));
    }
    const res = await POST(makeReq({}, '9.9.9.9'));
    expect(res.status).toBe(429);
    expect(logMock.warn).toHaveBeenCalledWith('rate limited', expect.objectContaining({ ip: '9.9.9.9' }));
  });

  it('different IPs have independent rate limit buckets', async () => {
    cfgMock.mockReturnValue('');
    for (let i = 0; i < 30; i++) {
      await POST(makeReq({}, '1.1.1.1'));
    }
    // 31st from 1.1.1.1 would be 429, but from a different IP should still be 400
    const res = await POST(makeReq({}, '2.2.2.2'));
    expect(res.status).toBe(400); // not 429 — different bucket
  });

  it('defaults IP to "unknown" when no forwarded header is present', async () => {
    cfgMock.mockReturnValue('');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── Config errors ───────────────────────────────────────────────────────

describe('missing configuration', () => {
  it('returns 503 when no OpenRouter key and not in Ollama-only mode', async () => {
    cfgMock.mockImplementation((key) => (key === 'ollamaOnly' ? '' : ''));
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '3.3.3.3'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/API key/);
  });
});

// ─── Successful OpenRouter stream ───────────────────────────────────────

describe('OpenRouter success', () => {
  it('short-circuits explicit title lookups without calling any provider', async () => {
    cfgMock.mockReturnValue('');

    const res = await POST(makeReq({ messages: [{ role: 'user', content: '"send help"' }] }, '4.4.4.3'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('On it!\n<recommendation>{"title":"Send Help","type":"movie"}</recommendation>');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logMock.info).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({
        provider: 'shortcut',
        model: 'direct-title-lookup',
        userMsg: '"send help"',
      })
    );
  });

  it('proxies the SSE stream as plain text to the client', async () => {
    cfgMock.mockImplementation(openRouterKeyOnly);
    fetchSpy.mockResolvedValue(sseResponse(['Hel', 'lo ', 'world']));

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '4.4.4.4'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('Hello world');
  });

  it('emits one chat log entry with provider/model/userMsg/assistantMsg when stream closes', async () => {
    cfgMock.mockImplementation(openRouterKeyOnly);
    fetchSpy.mockResolvedValue(sseResponse(['Arrival is phenomenal']));

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'movie?' }] }, '5.5.5.5'));
    await res.text(); // drain the stream so the finally block runs
    expect(logMock.info).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({
        provider: 'openrouter',
        model: 'mistralai/mistral-small-3.1-24b-instruct:free',
        userMsg: 'movie?',
        assistantMsg: 'Arrival is phenomenal',
        turnCount: 1,
        latencyMs: expect.any(Number),
      })
    );
  });

  it('strips <think>...</think> blocks from the streamed content', async () => {
    cfgMock.mockImplementation(openRouterKeyOnly);
    fetchSpy.mockResolvedValue(sseResponse(['<think>', 'reasoning', '</think>', 'answer']));

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'x' }] }, '6.6.6.6'));
    const text = await res.text();
    expect(text).toBe('answer');
  });
});

// ─── OpenRouter failure → Ollama fallback ───────────────────────────────

describe('fallback to Ollama', () => {
  it('falls back to Ollama when OpenRouter returns non-retryable 4xx', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'openRouterApiKey') return 'or-sk-123';
      if (key === 'openRouterModel') return 'some/model';
      if (key === 'ollamaModel') return 'gemma4:e2b';
      if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
      return '';
    });
    // Sequence: OpenRouter returns 400, then Ollama returns 200
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 }))
      .mockResolvedValueOnce(sseResponse(['ollama says hi']));

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '7.7.7.7'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('ollama says hi');

    await new Promise((r) => setTimeout(r, 0)); // let finally run
    expect(logMock.info).toHaveBeenCalledWith('chat', expect.objectContaining({ provider: 'ollama' }));
  });
});

// ─── All providers fail ─────────────────────────────────────────────────

describe('all providers fail', () => {
  it('returns 502 and logs an error when OpenRouter 4xxs and no Ollama configured', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'openRouterApiKey') return 'or-sk-123';
      if (key === 'openRouterModel') return 'some/model';
      return '';
    });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 403 })
    );

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '8.8.8.8'));
    expect(res.status).toBe(502);
    expect(logMock.error).toHaveBeenCalledWith('all providers failed', expect.any(Object));
  });
});

// ─── ollamaOnly / forceOllama ──────────────────────────────────────────

describe('Ollama-only routing', () => {
  it('ollamaOnly config skips OpenRouter entirely', async () => {
    cfgMock.mockImplementation(ollamaOnlyConfig);
    fetchSpy.mockResolvedValue(sseResponse(['local-reply']));

    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '11.11.11.11'));

    // Only one fetch call — to Ollama; OpenRouter was not touched
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('localhost:11434');
  });

  it('forceOllama body flag also skips OpenRouter', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'openRouterApiKey') return 'or-sk-123';
      if (key === 'ollamaModel') return 'gemma4:e2b';
      if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
      return '';
    });
    fetchSpy.mockResolvedValue(sseResponse(['forced-ollama']));

    await POST(makeReq(
      { messages: [{ role: 'user', content: 'hi' }], forceOllama: true },
      '12.12.12.12'
    ));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('localhost:11434');
  });

  it('applies Gemma-tuned sampling params when ollamaModel is a Gemma variant', async () => {
    cfgMock.mockImplementation(ollamaOnlyConfig); // ollamaModel = 'gemma4:e2b'
    fetchSpy.mockResolvedValue(sseResponse(['x']));

    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '13.13.13.13'));

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(requestBody.temperature).toBe(0.7);
    expect(requestBody.top_p).toBe(0.95);
    expect(requestBody.options.top_k).toBe(64);
  });

  it('does NOT apply Gemma sampling for non-Gemma Ollama models', async () => {
    cfgMock.mockImplementation((key) => {
      if (key === 'ollamaOnly') return 'true';
      if (key === 'ollamaModel') return 'llama3.2:3b';
      if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
      return '';
    });
    fetchSpy.mockResolvedValue(sseResponse(['x']));

    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }, '14.14.14.14'));

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(requestBody.temperature).toBe(0.4);
    expect(requestBody.top_p).toBeUndefined();
    expect(requestBody.options.top_k).toBeUndefined();
  });
});
