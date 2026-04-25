import { NextRequest, NextResponse } from 'next/server';
import { AppConfig, cfg, readConfig, writeConfig, SENSITIVE } from '@/lib/config';
import { isPlainObject, readJsonBody, RequestBodyError } from '@/lib/requestBody';
import { getVersion } from '@/lib/version';

// URL fields that are used in server-side fetches must stay on localhost / RFC-1918.
// This prevents SSRF attacks where a crafted URL redirects our server to internal services.
const URL_FIELDS: Array<keyof AppConfig> = ['plexBaseUrl', 'transmissionBaseUrl', 'ollamaBaseUrl'];

function isSafeLocalUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // WHATWG URL keeps brackets on IPv6 hostnames (e.g. "[::1]"); strip them
    // so the loopback comparison matches.
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^10\./.test(host)) return true;                          // 10.0.0.0/8
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;   // 172.16–31.x.x
    if (/^192\.168\./.test(host)) return true;                    // 192.168.0.0/16
    return false;
  } catch { return false; }
}

/** GET — return effective config; sensitive fields masked as "set" or "" */
export async function GET() {
  const effective: Record<string, string> = {
    openRouterApiKey:       cfg('openRouterApiKey',       'OPENROUTER_API_KEY'),
    openRouterModel:        cfg('openRouterModel',        'OPENROUTER_MODEL',         'openrouter/free'),
    plexBaseUrl:            cfg('plexBaseUrl',            'PLEX_BASE_URL',            'http://localhost:32400'),
    plexToken:              cfg('plexToken',              'PLEX_TOKEN'),
    tmdbApiKey:             cfg('tmdbApiKey',             'TMDB_API_KEY'),
    omdbApiKey:             cfg('omdbApiKey',             'OMDB_API_KEY'),
    transmissionBaseUrl:    cfg('transmissionBaseUrl',    'TRANSMISSION_BASE_URL',    'http://localhost:9091'),
    transmissionUsername:   cfg('transmissionUsername',   'TRANSMISSION_USERNAME'),
    transmissionPassword:   cfg('transmissionPassword',   'TRANSMISSION_PASSWORD'),
    transmissionDownloadDir:cfg('transmissionDownloadDir','TRANSMISSION_DOWNLOAD_DIR'),
    libraryDir:             cfg('libraryDir',             'LIBRARY_DIR'),
    tvLibraryDir:           cfg('tvLibraryDir',           'TV_LIBRARY_DIR'),
    ollamaBaseUrl:          cfg('ollamaBaseUrl',          'OLLAMA_BASE_URL',          'http://localhost:11434'),
    ollamaModel:            cfg('ollamaModel',            'OLLAMA_MODEL'),
    ollamaOnly:             cfg('ollamaOnly',             'OLLAMA_ONLY'),
    // Returned unmasked — the Settings page needs the actual value to wire
    // into the /api/diagnostics/bundle?token=... download URL. Effectively
    // LAN-scoped; for stronger isolation, front the app with a reverse proxy
    // that requires its own auth.
    diagnosticsToken:       cfg('diagnosticsToken',       'MOVIE_CHAT_DIAGNOSTICS_TOKEN'),
    version:                getVersion(),
  };

  // Mask sensitive fields — client only needs to know if they are set or not
  for (const key of SENSITIVE) {
    effective[key] = effective[key] ? 'set' : '';
  }

  return NextResponse.json(effective);
}

/** POST — merge incoming fields into config.local.json */
export async function POST(req: NextRequest) {
  let body: Partial<Record<string, unknown>>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'JSON object body required' }, { status: 400 });
  }

  const existing = readConfig();

  const updated: AppConfig = { ...existing };

  const fields: Array<keyof AppConfig> = [
    'openRouterApiKey', 'openRouterModel',
    'plexBaseUrl', 'plexToken',
    'tmdbApiKey', 'omdbApiKey',
    'transmissionBaseUrl', 'transmissionUsername', 'transmissionPassword',
    'transmissionDownloadDir', 'libraryDir', 'tvLibraryDir',
    'ollamaBaseUrl', 'ollamaModel', 'ollamaOnly',
  ];

  for (const key of fields) {
    const value = body[key];
    if (value === undefined) continue; // not sent — keep existing
    if (typeof value !== 'string') {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }

    if (SENSITIVE.includes(key as keyof AppConfig) && value === 'set') {
      // Client sent back the placeholder — don't overwrite
      continue;
    }

    if (value === '') {
      // Explicitly cleared — remove from config
      delete updated[key];
    } else {
      (updated as Record<string, string>)[key] = value;
    }
  }

  // Validate that service base URLs are restricted to localhost / private network
  for (const key of URL_FIELDS) {
    const value = updated[key];
    if (value && !isSafeLocalUrl(value)) {
      return NextResponse.json(
        { error: `${key} must be a local network address (localhost or 192.168.x.x / 10.x.x.x / 172.16–31.x.x)` },
        { status: 400 }
      );
    }
  }

  writeConfig(updated);
  return NextResponse.json({ ok: true });
}
