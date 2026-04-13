import { NextRequest, NextResponse } from 'next/server';
import { cfg } from '@/lib/config';
import { getLogger } from '@/lib/logger';
import { getSystemPrompt, isGemmaModel } from '@/lib/chatPrompts';

const log = getLogger('llm');

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
    log.warn('rate limited', { ip });
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

  // Captured at the start so latency includes both retry attempts and streaming.
  const startedAt = Date.now();
  const userMsg = messages[messages.length - 1]?.content ?? '';

  // ollamaOnly = persistent setting in config; forceOllama = one-off test flag from client
  const ollamaOnly = cfg('ollamaOnly', 'OLLAMA_ONLY') === 'true';

  // Attempt the OpenRouter request — retry on network errors, 429, or 5xx
  // Skip entirely when forceOllama is set (test) or ollamaOnly is enabled (persistent)
  let apiRes: Response | null = null;
  let lastError = 'OpenRouter returned an error';
  // Which provider actually served the response (set when the fetch succeeds)
  let provider: 'openrouter' | 'ollama' | null = null;
  let chatModel = '';

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
            messages: [{ role: 'system', content: getSystemPrompt(model) }, ...SEED_MESSAGES, ...trimmedMessages],
            stream: true,
            max_tokens: 1024,
            temperature: 0.4,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (res.ok && res.body) {
          apiRes = res;
          provider = 'openrouter';
          chatModel = model;
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
      // Gemma 3n / 4 docs recommend temperature=1.0, top_p=0.95, top_k=64.
      // We use 0.7 (not full 1.0) to keep <recommendation> tag compliance reliable
      // while letting tone breathe more than our old 0.4 default.
      // Other models keep the conservative defaults.
      const isGemma = isGemmaModel(ollamaModel);
      try {
        const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [{ role: 'system', content: getSystemPrompt(ollamaModel) }, ...SEED_MESSAGES, ...trimHistory(messages, OLLAMA_MAX_HISTORY_MESSAGES)],
            stream: true,
            max_tokens: 2048,
            temperature: isGemma ? 0.7 : 0.4,
            ...(isGemma && { top_p: 0.95 }),
            think: false,
            options: {
              num_ctx: 8192,
              ...(isGemma && { top_k: 64 }),
            },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (ollamaRes.ok && ollamaRes.body) {
          apiRes = ollamaRes;
          provider = 'ollama';
          chatModel = ollamaModel;
        } else {
          lastError = `Ollama returned HTTP ${ollamaRes.status}`;
        }
      } catch {
        lastError = 'Cannot reach Ollama — is it running?';
      }
    } else if (forceOllama || ollamaOnly) {
      lastError = 'No Ollama model configured — add one in Settings.';
    }
  }

  if (!apiRes) {
    log.error('all providers failed', { lastError });
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
      // Accumulate tokens in an array so joining at the end is O(n) rather
      // than the O(n²) that string += would give us for large responses.
      const responseTokens: string[] = [];
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
                if (filtered) {
                  responseTokens.push(filtered);
                  controller.enqueue(encoder.encode(filtered));
                }
              }
            } catch { /* skip malformed lines */ }
          }
        }
      } finally {
        // Swallow log errors so controller.close() always runs — otherwise
        // the Response would hang for the client on a closed stdout or a
        // disk-full condition.
        try {
          log.info('chat', {
            provider,
            model: chatModel,
            turnCount: trimmedMessages.length,
            latencyMs: Date.now() - startedAt,
            userMsg,
            assistantMsg: responseTokens.join(''),
          });
        } catch { /* intentionally swallowed */ }
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
