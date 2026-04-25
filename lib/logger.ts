/**
 * Structured JSONL logger for movie-chat.
 *
 * One JSON object per line. Writes to a daily-rotated file in the log
 * directory AND mirrors to console.{info,warn,error} so pm2's default
 * stdout capture and dev-mode terminal output continue to work.
 *
 * Log directory resolution (first non-empty wins):
 *   1. process.env.MOVIE_CHAT_LOG_DIR  — optional override
 *   2. dirname(CONFIG_PATH)/logs       — same root as config.local.json
 *   3. ./logs                          — bare-metal fallback
 *
 * Rotation: one file per day, `movie-chat-YYYY-MM-DD.jsonl`.
 * Retention: 7 days. Pruning runs inline at most once per 24 h.
 */

import fs from 'fs';
import path from 'path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const RETENTION_DAYS = 7;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Per-entry cap — one oversized log line (e.g. runaway LLM output) cannot
// bloat the daily file. If exceeded, msg is truncated and meta replaced
// with a summary. 32 KB covers even long assistant responses.
const MAX_ENTRY_BYTES = 32 * 1024;
const ENTRY_MSG_TRUNCATE = 2048;
// Per-file cap — protects against log spam from a stuck loop. Once today's
// file reaches this size, further writes for the day are dropped (console
// mirror still runs). File size is re-checked at most once per 10 s.
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SIZE_CHECK_INTERVAL_MS = 10_000;

function resolveLogDir(): string {
  if (process.env.MOVIE_CHAT_LOG_DIR) return process.env.MOVIE_CHAT_LOG_DIR;
  const configPath = process.env.CONFIG_PATH ?? path.join(process.cwd(), 'config.local.json');
  return path.join(path.dirname(configPath), 'logs');
}

const LOG_DIR = resolveLogDir();
let lastPruneAt = 0;
let lastSizeCheckAt = 0;
let lastKnownSize = 0;
// The date string the size cache currently reflects. When today's date
// differs from this, the cache is stale (the daily file rolled over) and
// we must re-stat instead of reusing the old size.
let lastSizeCheckDay: string | null = null;
let sizeCapWarnedFor: string | null = null;

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureDir(): void {
  // Idempotent thanks to recursive:true; failures are surfaced via the
  // subsequent append attempt rather than thrown here.
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch { /* ignore */ }
}

function prune(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  try {
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    for (const f of files) {
      const m = /^movie-chat-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (!m) continue;
      const fileDate = new Date(m[1] + 'T00:00:00Z').getTime();
      if (isNaN(fileDate) || fileDate >= cutoff) continue;
      fs.unlinkSync(path.join(LOG_DIR, f));
    }
  } catch {
    // best-effort
  }
}

function isFileOverCap(file: string, today: string): boolean {
  const now = Date.now();
  // When the day rolls over, the cache points at yesterday's size — possibly
  // MAX — and would wrongly gate writes to the brand-new empty file. Force
  // a fresh stat on day boundaries.
  const sameDay = lastSizeCheckDay === today;
  if (sameDay && now - lastSizeCheckAt < SIZE_CHECK_INTERVAL_MS) {
    return lastKnownSize >= MAX_FILE_BYTES;
  }
  lastSizeCheckAt = now;
  lastSizeCheckDay = today;
  try {
    lastKnownSize = fs.statSync(file).size;
  } catch {
    lastKnownSize = 0;
  }
  return lastKnownSize >= MAX_FILE_BYTES;
}

function write(level: LogLevel, source: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    source,
    msg,
  };
  if (meta && Object.keys(meta).length > 0) entry.meta = meta;

  let line = JSON.stringify(entry) + '\n';

  // Per-entry size guard — truncate runaway messages so one bad log line
  // cannot bloat the file. Assistant responses from the LLM are the most
  // likely source of oversized entries.
  if (line.length > MAX_ENTRY_BYTES) {
    const truncated: Record<string, unknown> = {
      ts: entry.ts,
      level,
      source,
      msg: msg.length > ENTRY_MSG_TRUNCATE ? msg.slice(0, ENTRY_MSG_TRUNCATE) + '…[truncated]' : msg,
      _truncated: true,
      _originalBytes: line.length,
    };
    line = JSON.stringify(truncated) + '\n';
  }

  const today = todayStr();
  const file = path.join(LOG_DIR, `movie-chat-${today}.jsonl`);

  // Warn at most once per day per file, not every write after the cap hits —
  // otherwise a stuck loop would also spam the operator's console warning.
  if (sizeCapWarnedFor && sizeCapWarnedFor !== today) {
    sizeCapWarnedFor = null;
  }

  if (!isFileOverCap(file, today)) {
    try {
      ensureDir();
      fs.appendFileSync(file, line);
      lastKnownSize += line.length;
    } catch {
      // silent — console mirror below still surfaces the event
    }
  } else if (sizeCapWarnedFor !== today) {
    sizeCapWarnedFor = today;
    console.warn(`[logger] File size cap (${MAX_FILE_BYTES} bytes) reached for ${file}; further writes today drop to console only`);
  }

  // Mirror to console so pm2's stdout capture and `npm run dev` terminal
  // keep showing the same events without any change in behaviour.
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  if (meta && Object.keys(meta).length > 0) method(`[${source}] ${msg}`, meta);
  else method(`[${source}] ${msg}`);

  prune();
}

export function getLogger(source: string): Logger {
  return {
    info(msg, meta) { write('info', source, msg, meta); },
    warn(msg, meta) { write('warn', source, msg, meta); },
    error(msg, meta) { write('error', source, msg, meta); },
  };
}

export function getLogDir(): string {
  return LOG_DIR;
}
