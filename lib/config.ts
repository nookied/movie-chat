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
}

const CONFIG_PATH = path.join(process.cwd(), 'config.local.json');

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
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/** Read a config value: config.local.json first, then env var, then default. */
export function cfg(key: keyof AppConfig, envVar: string, defaultValue = ''): string {
  const config = readConfig();
  return (config[key] as string | undefined) || process.env[envVar] || defaultValue;
}
