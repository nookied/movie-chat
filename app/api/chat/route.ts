import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const SYSTEM_PROMPT = `You are a friendly movie and TV show assistant for a personal Plex media library.
Help the user find something to watch. Be conversational, concise, and natural — like a friend recommending a film.

## Recommending titles
When you recommend a specific title, include a tag on its own line:
<recommendation>{"title":"Exact Movie Title","year":2021,"type":"movie"}</recommendation>
Use "type":"tv" for TV shows. Only tag titles you are actively recommending.

## Download flow
You will receive [System] status messages from the app (not from the user). Use them silently as context.

- If you see: [System] "Title" is already in your Plex library → tell the user it's already available on Plex.
- If you see: [System] "Title" is available for download → simply ask: "Download Title?" (no technical details).
- If you see: [System] "Title" is on YTS but no 1080p version is available → let the user know and offer alternatives.
- If you see: [System] "Title" was not found on YTS → let the user know.

When the user confirms a download (says yes / sure / go ahead / etc.), respond with one short sentence and include:
<download>{"title":"Exact Movie Title","year":2021}</download>

Only emit the download tag after explicit user confirmation. Never speculatively.`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages } = body as { messages: Array<{ role: string; content: string }> };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 });
  }

  const ollamaMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: true,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return NextResponse.json(
      { error: 'Cannot reach Ollama. Make sure it is running on ' + OLLAMA_BASE_URL },
      { status: 502 }
    );
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    return NextResponse.json({ error: 'Ollama returned an error' }, { status: 502 });
  }

  // Pipe the Ollama NDJSON stream, extracting only the text tokens
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n').filter(Boolean)) {
            try {
              const parsed = JSON.parse(line);
              const token: string = parsed?.message?.content ?? '';
              if (token) controller.enqueue(encoder.encode(token));
            } catch {
              // Skip malformed lines
            }
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
