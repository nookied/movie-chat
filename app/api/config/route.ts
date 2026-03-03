import { NextRequest, NextResponse } from 'next/server';
import { AppConfig, cfg, readConfig, writeConfig } from '@/lib/config';

const SENSITIVE: Array<keyof AppConfig> = [
  'plexToken',
  'tmdbApiKey',
  'omdbApiKey',
  'transmissionPassword',
];

/** GET — return effective config; sensitive fields masked as "set" or "" */
export async function GET() {
  const effective: Record<string, string> = {
    ollamaBaseUrl:          cfg('ollamaBaseUrl',          'OLLAMA_BASE_URL',          'http://localhost:11434'),
    ollamaModel:            cfg('ollamaModel',            'OLLAMA_MODEL',             'llama3.2'),
    plexBaseUrl:            cfg('plexBaseUrl',            'PLEX_BASE_URL',            'http://localhost:32400'),
    plexToken:              cfg('plexToken',              'PLEX_TOKEN'),
    tmdbApiKey:             cfg('tmdbApiKey',             'TMDB_API_KEY'),
    omdbApiKey:             cfg('omdbApiKey',             'OMDB_API_KEY'),
    transmissionBaseUrl:    cfg('transmissionBaseUrl',    'TRANSMISSION_BASE_URL',    'http://localhost:9091'),
    transmissionUsername:   cfg('transmissionUsername',   'TRANSMISSION_USERNAME'),
    transmissionPassword:   cfg('transmissionPassword',   'TRANSMISSION_PASSWORD'),
    transmissionDownloadDir:cfg('transmissionDownloadDir','TRANSMISSION_DOWNLOAD_DIR'),
    libraryDir:             cfg('libraryDir',             'LIBRARY_DIR'),
  };

  // Mask sensitive fields — client only needs to know if they are set or not
  for (const key of SENSITIVE) {
    effective[key] = effective[key] ? 'set' : '';
  }

  return NextResponse.json(effective);
}

/** POST — merge incoming fields into config.local.json */
export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<Record<string, string>>;
  const existing = readConfig();

  const updated: AppConfig = { ...existing };

  const fields: Array<keyof AppConfig> = [
    'ollamaBaseUrl', 'ollamaModel',
    'plexBaseUrl', 'plexToken',
    'tmdbApiKey', 'omdbApiKey',
    'transmissionBaseUrl', 'transmissionUsername', 'transmissionPassword',
    'transmissionDownloadDir', 'libraryDir',
  ];

  for (const key of fields) {
    const value = body[key];
    if (value === undefined) continue; // not sent — keep existing

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

  writeConfig(updated);
  return NextResponse.json({ ok: true });
}
