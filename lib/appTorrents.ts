/**
 * Server-side registry of torrent IDs added through this app.
 * Persisted to app-torrents.json so the allow-list survives server restarts.
 * Used by /api/transmission/control to prevent controlling foreign torrents,
 * and by the auto-move background poller to know what to move and where.
 *
 * The registry is kept in a module-level Map (loaded once from disk) so every
 * call to isAppTorrent() avoids a synchronous readFileSync.  Only register /
 * unregister operations hit the disk.
 */

import fs from 'fs';
import path from 'path';

export interface AppTorrentMeta {
  mediaType?: 'movie' | 'tv';
  season?: number;
}

// Stored format: { "42": { "mediaType": "movie" }, "99": { "mediaType": "tv", "season": 2 }, … }
// Old format (plain number[]): handled transparently in loadCache().
type StoredFormat = Record<string, AppTorrentMeta>;

const IDS_FILE = path.join(process.cwd(), 'app-torrents.json');

let cache: Map<number, AppTorrentMeta> | null = null;

function loadCache(): Map<number, AppTorrentMeta> {
  if (cache !== null) return cache;
  const m = new Map<number, AppTorrentMeta>();
  try {
    const raw = fs.readFileSync(IDS_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Backward-compat: old format stored a plain number[]
      for (const id of parsed as number[]) m.set(id, {});
    } else {
      for (const [k, v] of Object.entries(parsed as StoredFormat)) {
        m.set(Number(k), v ?? {});
      }
    }
  } catch { /* file missing or corrupt — start empty */ }
  cache = m;
  return m;
}

function flushCache(m: Map<number, AppTorrentMeta>): void {
  const obj: StoredFormat = {};
  for (const [id, meta] of m) obj[String(id)] = meta;
  // Write to a temp file then atomically rename — prevents a crash or signal
  // mid-write from leaving a corrupt / empty registry on disk.
  const tmp = `${IDS_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, IDS_FILE);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    /* disk full or permissions — non-fatal */
  }
}

export function registerAppTorrent(
  id: number,
  mediaType?: 'movie' | 'tv',
  season?: number,
): void {
  const m = loadCache();
  m.set(id, { mediaType, season });
  flushCache(m);
}

export function isAppTorrent(id: number): boolean {
  return loadCache().has(id);
}

export function getAppTorrentMeta(id: number): AppTorrentMeta | undefined {
  return loadCache().get(id);
}

export function unregisterAppTorrent(id: number): void {
  const m = loadCache();
  m.delete(id);
  flushCache(m);
}
