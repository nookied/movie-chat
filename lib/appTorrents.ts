/**
 * Server-side registry of torrent IDs added through this app.
 * Persisted to app-torrents.json so the allow-list survives server restarts.
 * Used by /api/transmission/control to prevent controlling foreign torrents.
 */

import fs from 'fs';
import path from 'path';

const IDS_FILE = path.join(process.cwd(), 'app-torrents.json');

function readIds(): Set<number> {
  try {
    const raw = fs.readFileSync(IDS_FILE, 'utf8');
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<number>): void {
  try {
    fs.writeFileSync(IDS_FILE, JSON.stringify(Array.from(ids)));
  } catch { /* disk full or permissions — non-fatal */ }
}

export function registerAppTorrent(id: number): void {
  const ids = readIds();
  ids.add(id);
  writeIds(ids);
}

export function isAppTorrent(id: number): boolean {
  return readIds().has(id);
}

export function unregisterAppTorrent(id: number): void {
  const ids = readIds();
  ids.delete(id);
  writeIds(ids);
}
