import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_ID_FILE = path.join(ROOT_DIR, '.next', 'BUILD_ID');
const STANDALONE_SERVER = path.join(ROOT_DIR, '.next', 'standalone', 'server.js');
const CONFIGURED_COOKIE = 'movie-chat-configured=1';

let port = 0;
let baseUrl = '';
let server: ChildProcessWithoutNullStreams | null = null;
let serverLogs = '';

function requireBuild() {
  if (!fs.existsSync(BUILD_ID_FILE) || !fs.existsSync(STANDALONE_SERVER)) {
    throw new Error('Missing .next build output. Run `npm run build` before `npm run test:e2e`.');
  }
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const candidate = net.createServer();
    candidate.on('error', reject);
    candidate.listen(0, '127.0.0.1', () => {
      const address = candidate.address();
      candidate.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a port for the E2E smoke server.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForServer(url: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 60_000) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Next server exited early with code ${server.exitCode}.\n${serverLogs}`);
    }

    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // Server is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Next server at ${url}.\n${serverLogs}`);
}

async function fetchText(pathname: string): Promise<string> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { cookie: CONFIGURED_COOKIE },
  });
  expect(response.status).toBe(200);
  return response.text();
}

beforeAll(async () => {
  requireBuild();
  port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
      PORT: String(port),
    },
    stdio: 'pipe',
  });

  server.stdout.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });

  await waitForServer(`${baseUrl}/api/setup/status`);
});

afterAll(async () => {
  if (!server || server.exitCode !== null) return;

  server.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      if (server && server.exitCode === null) server.kill('SIGKILL');
    }, 5_000);

    server?.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
  });
});

describe('production smoke tests', () => {
  it('serves the home page', async () => {
    const html = await fetchText('/');
    expect(html).toContain('Movie Chat');
    expect(html).toContain('/popular');
  });

  it('serves the popular movies page', async () => {
    const html = await fetchText('/popular');
    expect(html).toContain('Popular Movies');
    expect(html).toContain('Browse top titles on YTS');
  });

  it('serves the settings page', async () => {
    const html = await fetchText('/settings');
    expect(html).toContain('Settings');
  });

  it('serves the setup hostname route', async () => {
    const response = await fetch(`${baseUrl}/api/setup/hostname`);
    expect(response.status).toBe(200);
    const payload = await response.json() as { hostname?: string | null };
    expect(payload).toHaveProperty('hostname');
  });
});
