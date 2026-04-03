import { NextRequest, NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

const SYSTEM_PROMPT = `You are a movie and TV assistant for a personal Plex library. Movies and TV only — anything else: "I'm only set up to help with movie and TV recommendations!"

## Tone
Warm, direct, opinionated. 1–3 sentences. One title at a time; wait for a response before offering more. Vague request → ask one focused question (genre? mood? pace?).

## Tagging — every title, every time
Every title you mention needs a tag on its own line:
<recommendation>{"title":"Exact Title","year":YYYY,"type":"movie"}</recommendation>
Use "tv" for shows. Omit year only when genuinely unknown.

You don't know Plex status or availability — the app checks after the tag. Never claim a title is in the library or available before tagging it.

## Examples

User names a title — tag exactly as given, never substitute or question:

"find me Solo Mio 2026" →
On it!
<recommendation>{"title":"Solo Mio","year":2026,"type":"movie"}</recommendation>

Phrase-like titles (questions, kill/die/murder words) are still titles:

"how to make a killing" →
On it!
<recommendation>{"title":"How to Make a Killing","type":"movie"}</recommendation>

Your own suggestion — only titles you know well, don't guess years:

"I want something dark and slow" →
You'd love Under the Skin — hypnotic, unsettling, and completely absorbing.
<recommendation>{"title":"Under the Skin","year":2013,"type":"movie"}</recommendation>

If truly unsure whether input is a title or question, ask: "Are you looking for the film '[input]'?"

## What the app shows — don't repeat
Poster, year, runtime, director, scores, synopsis, Plex status, availability. Focus on why it fits the mood.

## [System] messages
Injected by the app — follow the instruction in each one. Never quote or mimic the [System] prefix.

## Download
Only after a [System] message confirms availability AND the user confirms (yes/sure/ok):
<download>{"title":"Exact Title","year":YYYY}</download>
Must match the <recommendation> tag exactly. Never emit without both conditions.`;

// Few-shot seed: small models mimic patterns in recent context.
// Seeing a correct tag in the first exchange dramatically improves compliance.
const SEED_MESSAGES = [
  { role: 'user' as const, content: 'Have you seen Arrival?' },
  { role: 'assistant' as const, content: 'Arrival is phenomenal — smart sci-fi that stays with you.\n<recommendation>{"title":"Arrival","year":2016,"type":"movie"}</recommendation>' },
];

// Simple in-memory rate limiter: max 30 requests per minute per IP.
// Protects against runaway OpenRouter spend if the app is accessible on the LAN.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Prune expired entries so the map doesn't grow unbounded over days of use.
// Runs at most once per minute — O(n) over the number of unique IPs seen.
let lastPrune = 0;
function pruneRateLimitMap(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  pruneRateLimitMap(now);
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}

// Keep the conversation history from growing too large — sliding window of last N messages
const MAX_HISTORY_MESSAGES = 20;
// Smaller window for Ollama: the 3b model has a limited context window; keeping history
// short leaves room for the system prompt + response tokens.
const OLLAMA_MAX_HISTORY_MESSAGES = 6;

function trimHistory(
  messages: Array<{ role: string; content: string }>,
  limit = MAX_HISTORY_MESSAGES
): Array<{ role: string; content: string }> {
  if (messages.length <= limit) return messages;
  return messages.slice(messages.length - limit);
}

// Retry with exponential backoff — 3 retries = 4 total attempts
const RETRY_DELAYS_MS = [500, 1000, 2000];

export async function POST(req: NextRequest) {
  // Rate limit by IP — prevents runaway cost if app is exposed on LAN
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a moment.' },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { messages, forceOllama } = body as {
    messages: Array<{ role: string; content: string }>;
    forceOllama?: boolean;
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 });
  }

  const trimmedMessages = trimHistory(messages);

  // ollamaOnly = persistent setting in config; forceOllama = one-off test flag from client
  const ollamaOnly = cfg('ollamaOnly', 'OLLAMA_ONLY') === 'true';

  // Attempt the OpenRouter request — retry on network errors, 429, or 5xx
  // Skip entirely when forceOllama is set (test) or ollamaOnly is enabled (persistent)
  let apiRes: Response | null = null;
  let lastError = 'OpenRouter returned an error';

  if (!forceOllama && !ollamaOnly) {
    const apiKey = cfg('openRouterApiKey', 'OPENROUTER_API_KEY');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No API key configured. Add one in Settings.' },
        { status: 503 }
      );
    }

    const model = cfg('openRouterModel', 'OPENROUTER_MODEL', 'mistralai/mistral-small-3.1-24b-instruct:free');

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Movie Chat',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...SEED_MESSAGES, ...trimmedMessages],
            stream: true,
            max_tokens: 1024,
            temperature: 0.4,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (res.ok && res.body) {
          apiRes = res;
          break;
        }

        // Parse error for reporting
        const errBody = await res.json().catch(() => ({}));
        lastError =
          (errBody as { error?: { message?: string } })?.error?.message ??
          `HTTP ${res.status}`;

        // Non-retryable: 4xx errors except 429 (rate limited)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;

      } catch {
        lastError = 'Cannot reach OpenRouter API';
      }

      // Wait before the next attempt (skip wait after the final attempt)
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  // --- Ollama — used as fallback (OpenRouter failed) or as primary (ollamaOnly/forceOllama) ---
  if (!apiRes) {
    const ollamaModel = cfg('ollamaModel', 'OLLAMA_MODEL');
    if (ollamaModel) {
      const ollamaBase = cfg('ollamaBaseUrl', 'OLLAMA_BASE_URL', 'http://localhost:11434');
      try {
        const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...SEED_MESSAGES, ...trimHistory(messages, OLLAMA_MAX_HISTORY_MESSAGES)],
            stream: true,
            max_tokens: 2048,
            temperature: 0.4,
            think: false,
            options: { num_ctx: 8192 },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (ollamaRes.ok && ollamaRes.body) apiRes = ollamaRes;
        else lastError = `Ollama returned HTTP ${ollamaRes.status}`;
      } catch {
        lastError = 'Cannot reach Ollama — is it running?';
      }
    } else if (forceOllama || ollamaOnly) {
      lastError = 'No Ollama model configured — add one in Settings.';
    }
  }

  if (!apiRes) {
    return NextResponse.json({ error: lastError }, { status: 502 });
  }

  // Strips <think>...</think> blocks from the token stream (Qwen 3 thinking mode safety net).
  // Handles tags split across multiple token chunks.
  class ThinkFilter {
    private buf = '';
    private inside = false;
    filter(token: string): string {
      this.buf += token;
      let out = '';
      while (this.buf.length > 0) {
        if (this.inside) {
          const end = this.buf.indexOf('</think>');
          if (end === -1) { this.buf = this.buf.slice(-9); break; }
          this.buf = this.buf.slice(end + 8);
          this.inside = false;
        } else {
          const start = this.buf.indexOf('<think>');
          if (start === -1) {
            // Check for a partial '<think>' prefix at the tail so we don't flush it prematurely
            let tail = 0;
            for (let l = Math.min(this.buf.length, 6); l > 0; l--) {
              if ('<think>'.startsWith(this.buf.slice(-l))) { tail = l; break; }
            }
            out += this.buf.slice(0, this.buf.length - tail);
            this.buf = tail > 0 ? this.buf.slice(-tail) : '';
            break;
          }
          out += this.buf.slice(0, start);
          this.buf = this.buf.slice(start + 7);
          this.inside = true;
        }
      }
      return out;
    }
  }

  // Stream SSE → plain text tokens to the client (works for both OpenRouter and Ollama)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiRes!.body!.getReader();
      const decoder = new TextDecoder();
      const thinkFilter = new ThinkFilter();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const token: string = parsed?.choices?.[0]?.delta?.content ?? '';
              if (token) {
                const filtered = thinkFilter.filter(token);
                if (filtered) controller.enqueue(encoder.encode(filtered));
              }
            } catch { /* skip malformed lines */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
