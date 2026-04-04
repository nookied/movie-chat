import { NextRequest, NextResponse } from 'next/server';
import { writeConfig, readConfig } from '@/lib/config';

/**
 * OAuth PKCE callback — OpenRouter redirects here after the user authorizes.
 * Exchanges the authorization code for an API key and saves it to config.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const codeVerifier = req.nextUrl.searchParams.get('code_verifier');

  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=no_code', req.url));
  }

  try {
    // Exchange authorization code for API key
    const body: Record<string, string> = { code };
    if (codeVerifier) {
      body.code_verifier = codeVerifier;
      body.code_challenge_method = 'S256';
    }

    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL('/setup?error=exchange_failed', req.url));
    }

    const data = await res.json().catch(() => ({}));
    const apiKey = data?.key;

    if (!apiKey) {
      return NextResponse.redirect(new URL('/setup?error=no_key', req.url));
    }

    // Save the key to config
    const config = readConfig();
    config.openRouterApiKey = apiKey;
    writeConfig(config);

    // Redirect back to setup with success
    return NextResponse.redirect(new URL('/setup?openrouter=connected', req.url));
  } catch {
    return NextResponse.redirect(new URL('/setup?error=network', req.url));
  }
}
