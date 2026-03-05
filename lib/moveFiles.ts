/**
 * Core file-move logic, shared between the HTTP route handler and the
 * server-side auto-move background poller.
 *
 * Throws on error so callers can handle it uniformly (HTTP route returns a
 * 4xx/5xx; the poller logs it and retries on the next tick).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getTorrentStatus, removeTorrent } from './transmission';
import { triggerLibraryRefresh } from './plex';
import { unregisterAppTorrent } from './appTorrents';
import { cfg } from './config';

// Only copy media files — skip YTS/EZTV junk (.txt, .jpg, .nfo, etc.)
const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv',  // video
  '.srt', '.sub', '.ass', '.ssa', '.vtt',           // subtitles
]);

// "Dead Mans Wire (2025) [1080p] [WEBRip] [x265]..." → "Dead Mans Wire (2025)"
function cleanFolderName(raw: string): string {
  return sanitizeName(raw.replace(/\s*\[.*$/s, '').trim() || raw);
}

// "Breaking Bad S05 Complete [1080p] [BluRay]" → "Breaking Bad"
function cleanTvFolderName(raw: string): string {
  const stripped = raw.replace(/\s+[Ss]\d{2}.*$/s, '').trim();
  return sanitizeName(stripped || raw);
}

// Strip path-separator characters so a crafted torrent name cannot produce a
// relative segment that escapes assertWithinDir (belt-and-suspenders — the
// check already catches this, but defence in depth is cheap here).
function sanitizeName(name: string): string {
  return name.replace(/[/\\]/g, '-').trim() || 'Unknown';
}

// Throws if filePath resolves outside the allowed parent directory.
function assertWithinDir(filePath: string, dir: string): void {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (resolved !== resolvedDir && !resolved.startsWith(resolvedDir + path.sep)) {
    throw new Error('Path traversal detected: file is outside allowed directory');
  }
}

// Typed error so the route handler can pick the right HTTP status without
// fragile string matching on the error message.
export class MoveError extends Error {
  constructor(message: string, readonly httpStatus: 400 | 500) {
    super(message);
    this.name = 'MoveError';
  }
}

export interface MoveResult {
  moved: string[];
  skipped: string[];
  destFolder: string;
}

// Module-level set of torrent IDs currently being moved.
// Prevents the autoMove poller and a simultaneous client-triggered /api/files/move
// from copying the same files concurrently (which would result in double-writes
// or ENOENT if the first caller deletes the source before the second finishes).
const movingSet = new Set<number>();

export async function moveTorrentFiles(
  torrentId: number,
  mediaType?: 'movie' | 'tv',
  season?: number,
): Promise<MoveResult> {
  if (movingSet.has(torrentId)) {
    throw new MoveError(`Move already in progress for torrent ${torrentId}`, 400);
  }
  movingSet.add(torrentId);

  try {
    return await _moveTorrentFiles(torrentId, mediaType, season);
  } finally {
    movingSet.delete(torrentId);
  }
}

async function _moveTorrentFiles(
  torrentId: number,
  mediaType?: 'movie' | 'tv',
  season?: number,
): Promise<MoveResult> {
  const LIBRARY_DIR     = cfg('libraryDir',             'LIBRARY_DIR');
  const TV_LIBRARY_DIR  = cfg('tvLibraryDir',           'TV_LIBRARY_DIR');
  const CONFIG_DOWNLOAD = cfg('transmissionDownloadDir', 'TRANSMISSION_DOWNLOAD_DIR');

  const EFFECTIVE_DIR = (mediaType === 'tv' && TV_LIBRARY_DIR) ? TV_LIBRARY_DIR : LIBRARY_DIR;

  if (!EFFECTIVE_DIR) {
    const label = mediaType === 'tv' ? 'TV shows' : 'Movies';
    throw new MoveError(
      `No ${label} library directory configured — set it in Settings → File Management.`,
      400,
    );
  }

  const status = await getTorrentStatus(torrentId);

  if (Math.round(status.percentDone * 100) < 100) {
    throw new MoveError('Torrent is not fully downloaded yet', 400);
  }

  if (!status.files || status.files.length === 0) {
    throw new MoveError('No files found in torrent', 400);
  }

  // Prefer the downloadDir Transmission reports for this torrent over the app config
  const DOWNLOAD_DIR = status.downloadDir || CONFIG_DOWNLOAD;
  if (!DOWNLOAD_DIR) {
    throw new MoveError('Cannot determine torrent download directory', 400);
  }

  // Destination subfolder:
  //   Movie:          LIBRARY_DIR/<clean movie name>/
  //   TV season N:    TV_LIBRARY_DIR/<Show Name>/Season N/
  //   TV all (s=0):   TV_LIBRARY_DIR/<Show Name>/
  let destFolder: string;
  if (mediaType === 'tv' && season !== undefined) {
    const showName = cleanTvFolderName(status.name);
    destFolder = season === 0
      ? path.join(EFFECTIVE_DIR, showName)
      : path.join(EFFECTIVE_DIR, showName, `Season ${season}`);
  } else {
    destFolder = path.join(EFFECTIVE_DIR, cleanFolderName(status.name));
  }

  assertWithinDir(destFolder, EFFECTIVE_DIR);
  await fs.mkdir(destFolder, { recursive: true });

  const moved: string[] = [];
  const skipped: string[] = [];

  for (const file of status.files) {
    const fileName = path.basename(file.name);
    const ext = path.extname(fileName).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      skipped.push(fileName);
      continue;
    }

    const sourcePath = path.join(DOWNLOAD_DIR, file.name);
    assertWithinDir(sourcePath, DOWNLOAD_DIR);

    // Refuse to follow symlinks — a crafted torrent could plant a symlink in
    // the download directory pointing to a sensitive file outside it.
    const lstat = await fs.lstat(sourcePath);
    if (lstat.isSymbolicLink()) {
      skipped.push(fileName);
      continue;
    }

    const destPath = path.join(destFolder, fileName);
    assertWithinDir(destPath, EFFECTIVE_DIR);

    await fs.copyFile(sourcePath, destPath);

    // If the delete fails, roll back by removing the destination copy so the
    // file remains in exactly one place rather than being duplicated.
    try {
      await fs.unlink(sourcePath);
    } catch (unlinkErr) {
      try { await fs.unlink(destPath); } catch { /* best-effort rollback */ }
      throw new Error(
        `Copied ${fileName} but failed to remove source: ${unlinkErr instanceof Error ? unlinkErr.message : unlinkErr}`,
      );
    }

    moved.push(fileName);
  }

  // Remove torrent from Transmission and clean up the server-side registry
  await removeTorrent(torrentId);
  unregisterAppTorrent(torrentId);

  // Clean up the source torrent folder (may still have skipped junk files)
  if (status.name) {
    const torrentFolder = path.join(DOWNLOAD_DIR, status.name);
    try {
      await fs.rm(torrentFolder, { recursive: true, force: true });
    } catch { /* folder may not exist — ignore */ }
  }

  // Kick off a Plex library scan so the content appears immediately — fire and forget
  triggerLibraryRefresh().catch(() => {});

  return { moved, skipped, destFolder };
}
