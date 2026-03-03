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
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaOnly?: string;  // 'true' = skip OpenRouter entirely, route all chat through Ollama
}

const CONFIG_PATH = path.join(process.cwd(), 'config.local.json');

export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/** Read a config value: config.local.json first, then env var, then default. */
export function cfg(key: keyof AppConfig, envVar: string, defaultValue = ''): string {
  const config = readConfig();
  return (config[key] as string | undefined) || process.env[envVar] || defaultValue;
}
