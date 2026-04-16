import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

export async function GET() {
  const ollamaBase = cfg('ollamaBaseUrl', 'OLLAMA_BASE_URL', 'http://localhost:11434');
  const ollamaModel = cfg('ollamaModel', 'OLLAMA_MODEL');

  try {
    const res = await fetch(`${ollamaBase}/api/tags`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Ollama returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);

    // Always return the models list so the settings dropdown can populate,
    // even when no model is configured yet.
    if (!ollamaModel) {
      return NextResponse.json({ ok: false, error: 'No model configured', models }, { status: 400 });
    }

    // Warn if the configured model isn't pulled yet
    const modelPulled = models.some(
      (m) => m === ollamaModel || m.startsWith(`${ollamaModel}:`)
    );

    if (!modelPulled) {
      return NextResponse.json({
        ok: false,
        error: `Model "${ollamaModel}" not found — run: ollama pull ${ollamaModel}`,
        models,
      }, { status: 400 });
    }

    return NextResponse.json({ ok: true, models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    const isDown = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('abort');
    return NextResponse.json({
      ok: false,
      error: isDown ? 'Ollama is not running' : msg,
    }, { status: 502 });
  }
}
