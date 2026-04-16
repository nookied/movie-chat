import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { writeConfig, readConfig } from '@/lib/config';

// Fixed origin — never reflect the client-controlled Host header into redirects.
const APP_ORIGIN =
  process.env.INTERNAL_APP_ORIGIN ??
  `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

function setupRedirect(path: string) {
  return NextResponse.redirect(new URL(path, APP_ORIGIN));
}

/**
 * OAuth PKCE callback — OpenRouter redirects here after the user authorizes.
 * Exchanges the authorization code for an API key and saves it to config.
 *
 * CSRF protection: the /api/openrouter/auth route sets a random state in a
 * cookie and appends it to the callback URL. We verify the two match here.
 */
export async function GET(req: NextRequest) {
  // Verify CSRF state — the auth initiation route sets a cookie and URL param
  const urlState = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('openrouter_oauth_state')?.value;
  if (urlState || cookieState) {
    if (
      !urlState || !cookieState ||
      urlState.length !== cookieState.length ||
      !crypto.timingSafeEqual(Buffer.from(urlState), Buffer.from(cookieState))
    ) {
      return setupRedirect('/setup?error=state_mismatch');
    }
  }

  const code = req.nextUrl.searchParams.get('code');
  const codeVerifier = req.nextUrl.searchParams.get('code_verifier');

  if (!code) {
    return setupRedirect('/setup?error=no_code');
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
      return setupRedirect('/setup?error=exchange_failed');
    }

    const data = await res.json().catch(() => ({}));
    const apiKey = data?.key;

    if (!apiKey) {
      return setupRedirect('/setup?error=no_key');
    }

    // Save the key to config
    const config = readConfig();
    config.openRouterApiKey = apiKey;
    writeConfig(config);

    // Redirect back to setup with success — clear the one-time state cookie
    const redirect = setupRedirect('/setup?openrouter=connected');
    redirect.cookies.delete('openrouter_oauth_state');
    return redirect;
  } catch {
    return setupRedirect('/setup?error=network');
  }
}
