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
  year?: number;
  registeredAt?: number; // Unix ms — used by the cleanup poller to skip recently-added entries
}

// Stored format: { "42": { "mediaType": "movie" }, "99": { "mediaType": "tv", "season": 2 }, … }
// Old format (plain number[]): handled transparently in loadCache().
type StoredFormat = Record<string, AppTorrentMeta>;

const IDS_FILE = path.join(process.cwd(), 'app-torrents.json');

// Cache with a 30-second TTL so that registrations written by the API route
// (which runs in a separate Next.js bundle with its own module instance) are
// visible to the auto-move poller within one cache window — well within the
// 60-second poll interval.
let cache: { data: Map<number, AppTorrentMeta>; expiry: number } | null = null;
const CACHE_TTL = 30_000;

function loadCache(): Map<number, AppTorrentMeta> {
  const now = Date.now();
  if (cache && cache.expiry > now) return cache.data;
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
  cache = { data: m, expiry: now + CACHE_TTL };
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
    // Refresh the cache TTL so this bundle doesn't immediately re-read
    // what it just wrote.
    cache = { data: m, expiry: Date.now() + CACHE_TTL };
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    /* disk full or permissions — non-fatal */
  }
}

export function registerAppTorrent(
  id: number,
  mediaType?: 'movie' | 'tv',
  season?: number,
  year?: number,
): void {
  const m = loadCache();
  m.set(id, { mediaType, season, year, registeredAt: Date.now() });
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

/**
 * Remove registry entries whose IDs are no longer present in Transmission.
 * Only prunes entries registered more than `graceMs` ago (default 1 hour) to
 * avoid racing against a torrent that was just added but not yet visible in
 * Transmission's torrent list.
 * Should only be called when listActiveTorrents() succeeded — never on error.
 * Returns the number of entries pruned.
 */
export function pruneAppTorrents(
  activeTransmissionIds: Set<number>,
  graceMs = 60 * 60 * 1000, // 1 hour
): number {
  const m = loadCache();
  const now = Date.now();
  let pruned = 0;

  for (const [id, meta] of m) {
    if (activeTransmissionIds.has(id)) continue;
    // Skip entries registered within the grace period
    if (meta.registeredAt !== undefined && now - meta.registeredAt < graceMs) continue;
    m.delete(id);
    pruned++;
  }

  if (pruned > 0) flushCache(m);
  return pruned;
}
