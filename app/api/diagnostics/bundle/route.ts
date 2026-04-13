/**
 * GET /api/diagnostics/bundle
 *
 * Returns a single JSON document containing:
 *   - app & system metadata (version, node, platform, uptime)
 *   - config.local.json with sensitive fields replaced by "[REDACTED]"
 *   - every *.jsonl and *.log file in the log directory as a string field
 *
 * Served with Content-Disposition: attachment so the browser saves it
 * instead of rendering. Used by the "Download diagnostics bundle" button
 * on the Settings page for user-to-developer troubleshooting handoff.
 *
 * Size cap: 50 MB total. If the log set is larger, the oldest files are
 * dropped first and `_truncated: true` is added to the bundle.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { cfg, readConfig, SENSITIVE, type AppConfig } from '@/lib/config';
import { getLogDir } from '@/lib/logger';

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

// Fields to redact in the bundle's config copy. Same base set as the UI
// masking list, plus the diagnostics token itself so a leaked bundle can't
// be used to pull further bundles.
const BUNDLE_REDACT: Array<keyof AppConfig> = [...SENSITIVE, 'diagnosticsToken'];

/** YYYY-MM-DD_HHMMSS — time included so two downloads in a single day
 *  don't overwrite each other in the Downloads folder. */
function filenameTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${date}_${time}`;
}

function getVersion(): string {
  // process.env.npm_package_version is only set when started via npm —
  // Electron spawns the server directly, so read package.json explicitly.
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

function redactedConfig(): Record<string, string> {
  const raw = readConfig() as Record<string, string>;
  const out: Record<string, string> = { ...raw };
  for (const key of BUNDLE_REDACT) {
    if (out[key as string]) out[key as string] = '[REDACTED]';
  }
  return out;
}

// crypto.timingSafeEqual requires equal-length buffers, so we length-check first.
// The explicit length guard is itself safe to leak — an attacker can already
// observe token length via the config API that feeds the Settings UI.
function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  const providedToken = req.nextUrl.searchParams.get('token') ?? '';
  const expectedToken = cfg('diagnosticsToken', '');
  if (!expectedToken || !tokensMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs: Record<string, string> = {};
  let truncated = false;

  const dir = getLogDir();
  let files: string[] = [];
  try {
    // Operate directly and catch ENOENT rather than existsSync → readdirSync
    // (TOCTOU race + extra syscall for a case that only happens on a brand-new
    // install before the first log line is written).
    files = fs.readdirSync(dir)
      .filter((f) => /\.(jsonl|log)$/.test(f))
      .sort()
      .reverse(); // newest first: cap truncation drops oldest
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
    // else: no log dir yet, ship an empty logs field
  }

  let totalBytes = 0;
  const picked: Array<{ name: string; content: string }> = [];

  for (const name of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(dir, name), 'utf-8');
    } catch {
      continue;
    }
    if (totalBytes + content.length > MAX_BUNDLE_BYTES) {
      truncated = true;
      break;
    }
    picked.push({ name, content });
    totalBytes += content.length;
  }

  // Emit keys in chronological order (oldest first) for readability,
  // even though we iterated newest-first to apply the cap.
  for (const { name, content } of picked.sort((a, b) => a.name.localeCompare(b.name))) {
    logs[name] = content;
  }

  const bundle: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    app: {
      version: getVersion(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
    },
    config: redactedConfig(),
    logs,
  };
  if (truncated) bundle._truncated = true;

  const json = JSON.stringify(bundle, null, 2);

  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="movie-chat-diagnostics-${filenameTimestamp()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
