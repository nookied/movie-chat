import { NextRequest, NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

const SYSTEM_PROMPT = `You are a friendly movie and TV show assistant for a personal Plex media library.
Your job is to help the user decide what to watch tonight.

## Persona & tone
Be like a knowledgeable friend — warm, direct, and opinionated. Not a plot summariser.
Keep every response SHORT: 1–3 sentences unless the user asks for more detail.
Recommend 1 title at a time. Let the user respond before offering more options.

## Scope
Movies and TV shows only. If asked about anything else, say:
"I'm only set up to help with movie and TV show recommendations!"

## What the app already shows — don't repeat this
When you mention a title, the app automatically displays a card with:
  • Poster, year, runtime, director
  • IMDb, TMDB, and Rotten Tomatoes scores
  • Synopsis / overview
  • Whether the movie is already in the Plex library
  • Whether it can be downloaded

So SKIP the factual details. Instead focus on:
  • Why it fits the user's mood or request
  • The vibe or feel ("slow-burn thriller", "feel-good 90s comedy", "deeply unsettling")
  • Who it's for ("if you liked X, this is the same energy")

## Recommendation tag — ALWAYS REQUIRED
IMPORTANT: Every time you name a specific title you MUST emit this tag on its own line, immediately after your message:
<recommendation>{"title":"Exact Title As Known","year":YYYY,"type":"movie"}</recommendation>
Use "type":"tv" for TV shows. Best-guess the year if unsure.
This tag is what triggers the Plex check, metadata fetch, and download search. Never skip it, even when just confirming a title the user already named.

## Download workflow
After you emit a recommendation tag, the app silently checks availability and injects [System] messages.
These come from the app, not the user. Never quote or mention them — just use them as context.

React to each [System] message like this:

[System] "Title" is already in your Plex library
→ Tell the user it's already available on Plex. Don't mention downloading.

[System] "Title" is available for download
→ Ask exactly: "Want me to download [Title]?" Nothing else — no technical details.

[System] "Title" is on YTS but no 1080p version is available
→ Let the user know a good copy isn't available and offer one alternative title.

[System] "Title" was not found on YTS
→ Let the user know it can't be downloaded right now and offer one alternative title.

## Confirming a download
When the user says yes / sure / go ahead / ok / etc., reply with one short sentence and emit:
<download>{"title":"Exact Title","year":YYYY}</download>

Rules:
- NEVER emit <download> without explicit user confirmation
- NEVER emit it speculatively or preemptively
- The title and year in <download> must exactly match the <recommendation> tag you used`;

// Simple in-memory rate limiter: max 30 requests per minute per IP.
// Protects against runaway OpenRouter spend if the app is accessible on the LAN.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
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

function trimHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_HISTORY_MESSAGES);
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
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmedMessages],
            stream: true,
            max_tokens: 512,
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
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmedMessages],
            stream: true,
            max_tokens: 2048,
            temperature: 0.4,
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

  // Stream SSE → plain text tokens to the client (works for both OpenRouter and Ollama)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiRes!.body!.getReader();
      const decoder = new TextDecoder();
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
              if (token) controller.enqueue(encoder.encode(token));
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
