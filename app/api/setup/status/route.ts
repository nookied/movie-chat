import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';

/**
 * Returns whether the app has minimum viable configuration.
 * "Complete" = at least one LLM is configured (OpenRouter key OR Ollama model).
 * Uses cfg() so env-var-only installs are also recognised as complete.
 */
export async function GET() {
  const hasOpenRouter = Boolean(cfg('openRouterApiKey', 'OPENROUTER_API_KEY'));
  const hasOllama = Boolean(cfg('ollamaModel', 'OLLAMA_MODEL'));
  return NextResponse.json({ complete: hasOpenRouter || hasOllama });
}
