/**
 * Unit tests for the setup flow:
 * - /api/setup/status — config completeness check
 * - /api/setup/detect — service auto-detection (probe logic)
 * - middleware setup redirect logic
 * - Landing page integrity
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── /api/setup/status tests ─────────────────────────────────────────────────

describe('/api/setup/status logic', () => {
  // Test the "is config complete" logic directly (same as the route)
  function isComplete(config: Record<string, string | undefined>): boolean {
    return Boolean(config.openRouterApiKey) || Boolean(config.ollamaModel);
  }

  it('returns complete when openRouterApiKey is set', () => {
    expect(isComplete({ openRouterApiKey: 'sk-or-123' })).toBe(true);
  });

  it('returns complete when ollamaModel is set', () => {
    expect(isComplete({ ollamaModel: 'llama3.2' })).toBe(true);
  });

  it('returns complete when both are set', () => {
    expect(isComplete({ openRouterApiKey: 'sk-or-123', ollamaModel: 'llama3.2' })).toBe(true);
  });

  it('returns incomplete when neither is set', () => {
    expect(isComplete({})).toBe(false);
  });

  it('returns incomplete when keys are empty strings', () => {
    expect(isComplete({ openRouterApiKey: '', ollamaModel: '' })).toBe(false);
  });

  it('returns incomplete when only Plex/Transmission are configured', () => {
    expect(isComplete({
      plexBaseUrl: 'http://localhost:32400',
      plexToken: 'abc',
      transmissionBaseUrl: 'http://localhost:9091',
    })).toBe(false);
  });
});

describe('/api/setup/status route — env-var fallback', () => {
  // Regression: env-var-only installs were treated as incomplete because
  // the route used readConfig() directly instead of cfg().
  it('honors OPENROUTER_API_KEY env var when no config file key is set', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({
      cfg: (_key: string, envVar: string) => process.env[envVar] ?? '',
    }));
    const original = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-env-only';
    try {
      const mod = await import('@/app/api/setup/status/route');
      const res = await mod.GET();
      const body = await res.json();
      expect(body.complete).toBe(true);
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = original;
      vi.doUnmock('@/lib/config');
    }
  });

  it('honors OLLAMA_MODEL env var when no config file key is set', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({
      cfg: (_key: string, envVar: string) => process.env[envVar] ?? '',
    }));
    const original = process.env.OLLAMA_MODEL;
    process.env.OLLAMA_MODEL = 'llama3.2';
    try {
      const mod = await import('@/app/api/setup/status/route');
      const res = await mod.GET();
      const body = await res.json();
      expect(body.complete).toBe(true);
    } finally {
      if (original === undefined) delete process.env.OLLAMA_MODEL;
      else process.env.OLLAMA_MODEL = original;
      vi.doUnmock('@/lib/config');
    }
  });

  it('returns incomplete when neither config nor env vars are set', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({ cfg: () => '' }));
    try {
      const mod = await import('@/app/api/setup/status/route');
      const res = await mod.GET();
      const body = await res.json();
      expect(body.complete).toBe(false);
    } finally {
      vi.doUnmock('@/lib/config');
    }
  });
});

// ── /api/setup/detect probe logic ───────────────────────────────────────────

describe('/api/setup/detect probe logic', () => {
  // Test the probe response interpretation (same logic as the route)
  function isReachable(status: number): boolean {
    return (status >= 200 && status < 300) || status === 401 || status === 409;
  }

  it('considers 200 as reachable', () => {
    expect(isReachable(200)).toBe(true);
  });

  it('considers 401 as reachable (needs auth = service exists)', () => {
    expect(isReachable(401)).toBe(true);
  });

  it('considers 409 as reachable (Transmission session handshake)', () => {
    expect(isReachable(409)).toBe(true);
  });

  it('considers 404 as unreachable', () => {
    expect(isReachable(404)).toBe(false);
  });

  it('considers 500 as unreachable', () => {
    expect(isReachable(500)).toBe(false);
  });

  it('considers 0 as unreachable (connection refused)', () => {
    expect(isReachable(0)).toBe(false);
  });
});

// ── Middleware setup redirect logic ──────────────────────────────────────────

describe('middleware setup exempt paths', () => {
  const SETUP_EXEMPT = ['/setup', '/settings', '/api/', '/_next/', '/favicon.ico', '/icon', '/apple-icon', '/manifest'];

  function isExempt(pathname: string): boolean {
    return SETUP_EXEMPT.some((p) => pathname.startsWith(p));
  }

  it('exempts /setup', () => {
    expect(isExempt('/setup')).toBe(true);
  });

  it('exempts /settings', () => {
    expect(isExempt('/settings')).toBe(true);
  });

  it('exempts all /api/ routes', () => {
    expect(isExempt('/api/chat')).toBe(true);
    expect(isExempt('/api/setup/status')).toBe(true);
    expect(isExempt('/api/config')).toBe(true);
  });

  it('exempts /_next/ assets', () => {
    expect(isExempt('/_next/static/chunk.js')).toBe(true);
  });

  it('exempts /favicon.ico', () => {
    expect(isExempt('/favicon.ico')).toBe(true);
  });

  it('exempts /manifest', () => {
    expect(isExempt('/manifest.webmanifest')).toBe(true);
  });

  it('does NOT exempt the root /', () => {
    expect(isExempt('/')).toBe(false);
  });

  it('does NOT exempt arbitrary paths', () => {
    expect(isExempt('/some/random/page')).toBe(false);
  });
});

// ── Landing page integrity ──────────────────────────────────────────────────

describe('landing page (docs/index.html)', () => {
  const htmlPath = path.join(process.cwd(), 'docs', 'index.html');
  let html: string;

  beforeEach(() => {
    html = fs.readFileSync(htmlPath, 'utf-8');
  });

  it('exists and is non-empty', () => {
    expect(html.length).toBeGreaterThan(0);
  });

  it('has the correct title', () => {
    expect(html).toContain('<title>Movie Chat');
  });

  it('advertises the install.sh one-liner', () => {
    expect(html).toContain('install.sh');
    expect(html).toContain('curl -fsSL');
  });

  it('links to the GitHub repo and README', () => {
    expect(html).toContain('github.com/nookied/movie-chat');
    expect(html).toContain('README.md');
  });

  it('has a favicon', () => {
    expect(html).toContain('favicon.png');
    const faviconPath = path.join(process.cwd(), 'docs', 'favicon.png');
    expect(fs.existsSync(faviconPath)).toBe(true);
  });

  it('references all screenshot images', () => {
    expect(html).toContain('images/chat-recommend.png');
    expect(html).toContain('images/chat-download.png');
    expect(html).toContain('images/download-progress.png');
    expect(html).toContain('images/settings.png');
  });

  it('all referenced images exist on disk', () => {
    const images = ['chat-recommend.png', 'chat-download.png', 'download-progress.png', 'settings.png'];
    for (const img of images) {
      const imgPath = path.join(process.cwd(), 'docs', 'images', img);
      expect(fs.existsSync(imgPath), `Missing: docs/images/${img}`).toBe(true);
    }
  });

  it('has the command-line install snippet', () => {
    expect(html).toContain('curl -fsSL');
    expect(html).toContain('install.sh');
  });

  it('has Open Graph meta tags', () => {
    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
  });

  it('has responsive mobile styles', () => {
    expect(html).toContain('@media (max-width: 600px)');
  });

  it('has the GitHub footer links', () => {
    expect(html).toContain('GitHub');
    expect(html).toContain('Docs');
    expect(html).toContain('Changelog');
  });
});

// ── ShareButton URL construction ────────────────────────────────────────────

describe('ShareButton URL construction', () => {
  function buildShareUrl(hostname: string, port: string, resolvedHostname?: string): string {
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:${port}`;
    }
    if (resolvedHostname) {
      return `http://${resolvedHostname}.local:${port}`;
    }
    return `http://${hostname}:${port}`;
  }

  it('uses hostname directly when already on .local', () => {
    expect(buildShareUrl('MacBook.local', '3000')).toBe('http://MacBook.local:3000');
  });

  it('uses hostname directly when on a LAN IP', () => {
    expect(buildShareUrl('192.168.1.50', '3000')).toBe('http://192.168.1.50:3000');
  });

  it('falls back to localhost when no resolved hostname', () => {
    expect(buildShareUrl('localhost', '3000')).toBe('http://localhost:3000');
  });

  it('uses resolved .local hostname when available', () => {
    expect(buildShareUrl('localhost', '3000', 'MacBook-Pro')).toBe('http://MacBook-Pro.local:3000');
  });

  it('uses resolved .local hostname for 127.0.0.1', () => {
    expect(buildShareUrl('127.0.0.1', '3001', 'MyMac')).toBe('http://MyMac.local:3001');
  });

  it('preserves custom port', () => {
    expect(buildShareUrl('192.168.1.50', '8080')).toBe('http://192.168.1.50:8080');
  });
});
