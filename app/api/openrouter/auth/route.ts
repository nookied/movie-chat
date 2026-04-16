import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Fixed origin for constructing callback URLs — never reflect the client-
// controlled Host header back into the redirect, otherwise a misconfigured
// reverse proxy lets an attacker steal the OAuth code.
const APP_ORIGIN =
  process.env.INTERNAL_APP_ORIGIN ??
  `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

/**
 * OAuth initiation — generates a random state token, stores it in a short-lived
 * httpOnly cookie, and redirects to OpenRouter's auth page. The callback route
 * verifies the state matches before saving the key, preventing CSRF.
 */
export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(16).toString('hex');

  const callbackUrl = new URL('/api/openrouter/callback', APP_ORIGIN);
  callbackUrl.searchParams.set('state', state);

  const authUrl = new URL('https://openrouter.ai/auth');
  authUrl.searchParams.set('callback_url', callbackUrl.toString());

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set('openrouter_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/openrouter/callback',
    maxAge: 600, // 10 minutes — plenty for an OAuth round-trip
  });
  return res;
}
