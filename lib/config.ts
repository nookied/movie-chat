import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface AppConfig {
  openRouterApiKey?: string;
  openRouterModel?: string;
  plexBaseUrl?: string;
  plexToken?: string;
  tmdbApiKey?: string;
  omdbApiKey?: string;
  transmissionBaseUrl?: string;
  transmissionUsername?: string;
  transmissionPassword?: string;
  transmissionDownloadDir?: string;
  libraryDir?: string;
  tvLibraryDir?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaOnly?: string;  // 'true' = skip OpenRouter entirely, route all chat through Ollama
  // Auto-generated on first server start; gates /api/diagnostics/bundle so the
  // endpoint can't be hit anonymously from the LAN. Visible to same-origin
  // Settings UI (which wires it into the download URL).
  diagnosticsToken?: string;
}

/** Fields whose values must never leave the machine — masked in GET /api/config
 *  responses and replaced with "[REDACTED]" in the diagnostics bundle. */
export const SENSITIVE: Array<keyof AppConfig> = [
  'openRouterApiKey',
  'plexToken',
  'tmdbApiKey',
  'omdbApiKey',
  'transmissionPassword',
];

// Configurable via env var so Electron can store config in ~/Library/Application Support/MovieChat/
const CONFIG_PATH = process.env.CONFIG_PATH ?? path.join(process.cwd(), 'config.local.json');

// Cache config for 30 s to avoid a sync disk read on every cfg() call.
// cfg() is called 6+ times per Transmission poll (every 5 s), so without
// caching this adds dozens of blocking fs.readFileSync calls per minute.
let configCache: { data: AppConfig; expiry: number } | null = null;

export function readConfig(): AppConfig {
  const now = Date.now();
  if (configCache && configCache.expiry > now) return configCache.data;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw) as AppConfig;
    configCache = { data, expiry: now + 30_000 };
    return data;
  } catch {
    return {};
  }
}

export function writeConfig(config: AppConfig): void {
  configCache = null; // invalidate so the next read picks up the new values
  const dir = path.dirname(CONFIG_PATH);
  const tempPath = path.join(dir, `.config.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tempPath, CONFIG_PATH);
}

/** Read a config value: config.local.json first, then env var, then default. */
export function cfg(key: keyof AppConfig, envVar: string, defaultValue = ''): string {
  const config = readConfig();
  return (config[key] as string | undefined) || process.env[envVar] || defaultValue;
}

/** Generate and persist a diagnostics token if one does not already exist.
 *  Called once at server startup from instrumentation.ts. Idempotent — an
 *  existing token is preserved across restarts so previously-bookmarked
 *  download URLs keep working. */
export function ensureDiagnosticsToken(): string {
  const config = readConfig();
  if (config.diagnosticsToken) return config.diagnosticsToken;
  const token = crypto.randomUUID();
  writeConfig({ ...config, diagnosticsToken: token });
  return token;
}
