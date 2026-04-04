import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';

/**
 * Returns whether the app has minimum viable configuration.
 * "Complete" = at least one LLM is configured (OpenRouter key OR Ollama model).
 */
export async function GET() {
  const config = readConfig();
  const hasOpenRouter = Boolean(config.openRouterApiKey);
  const hasOllama = Boolean(config.ollamaModel);
  return NextResponse.json({ complete: hasOpenRouter || hasOllama });
}
