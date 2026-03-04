import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus, removeTorrent } from '@/lib/transmission';
import { triggerLibraryRefresh } from '@/lib/plex';
import { unregisterAppTorrent } from '@/lib/appTorrents';
import { promises as fs } from 'fs';
import path from 'path';
import { cfg } from '@/lib/config';

// Only copy media files — skip YTS/EZTV junk (.txt, .jpg, .nfo, etc.)
const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv',  // video
  '.srt', '.sub', '.ass', '.ssa', '.vtt',           // subtitles
]);

// "Dead Mans Wire (2025) [1080p] [WEBRip] [x265]..." → "Dead Mans Wire (2025)"
function cleanFolderName(torrentName: string): string {
  return torrentName.replace(/\s*\[.*$/s, '').trim() || torrentName;
}

// "Breaking Bad S05 Complete [1080p] [BluRay]" → "Breaking Bad"
// Strips the S\d{2}... suffix that EZTV uses for season pack names.
function cleanTvFolderName(torrentName: string): string {
  // Remove " S05..." and everything after; then trim brackets/junk
  const stripped = torrentName.replace(/\s+[Ss]\d{2}.*$/s, '').trim();
  return stripped || torrentName;
}

// Throws if filePath resolves outside of the allowed parent directory.
// Prevents path traversal attacks via crafted torrent file names (e.g. "../../etc/passwd").
function assertWithinDir(filePath: string, dir: string): void {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (resolved !== resolvedDir && !resolved.startsWith(resolvedDir + path.sep)) {
    throw new Error(`Path traversal detected: file is outside allowed directory`);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { torrentId, mediaType, season } = body as {
    torrentId: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
  };

  if (!torrentId || typeof torrentId !== 'number') {
    return NextResponse.json({ error: 'torrentId required' }, { status: 400 });
  }

  const LIBRARY_DIR      = cfg('libraryDir',    'LIBRARY_DIR');
  const TV_LIBRARY_DIR   = cfg('tvLibraryDir',  'TV_LIBRARY_DIR');
  const CONFIG_DOWNLOAD  = cfg('transmissionDownloadDir', 'TRANSMISSION_DOWNLOAD_DIR');

  // Use TV-specific directory for TV downloads; fall back to the shared library dir.
  const EFFECTIVE_DIR = (mediaType === 'tv' && TV_LIBRARY_DIR) ? TV_LIBRARY_DIR : LIBRARY_DIR;

  try {
    const status = await getTorrentStatus(torrentId);

    // Use the same rounding threshold as the UI (Math.round * 100 ≥ 100)
    // to avoid false "not done" errors from floating-point values like 0.9998.
    if (Math.round(status.percentDone * 100) < 100) {
      return NextResponse.json(
        { error: 'Torrent is not fully downloaded yet' },
        { status: 400 }
      );
    }

    // No library directory configured — leave the torrent and file untouched, surface an error.
    // The DownloadTracker will show Retry + Dismiss so the user can fix settings first.
    if (!EFFECTIVE_DIR) {
      const label = mediaType === 'tv' ? 'TV shows' : 'Movies';
      return NextResponse.json(
        { error: `No ${label} library directory configured — set it in Settings → File Management.` },
        { status: 400 }
      );
    }

    if (!status.files || status.files.length === 0) {
      return NextResponse.json({ error: 'No files found in torrent' }, { status: 400 });
    }

    // Prefer the downloadDir Transmission reports for this torrent over the app config —
    // covers cases where the torrent was added with a different directory or via an external client.
    const DOWNLOAD_DIR = status.downloadDir || CONFIG_DOWNLOAD;

    if (!DOWNLOAD_DIR) {
      return NextResponse.json({ error: 'Cannot determine torrent download directory' }, { status: 400 });
    }

    // Destination subfolder:
    //   Movie:          LIBRARY_DIR/<clean movie name>/
    //   TV season N:    TV_LIBRARY_DIR (or LIBRARY_DIR)/<Show Name>/Season N/
    //   TV all (s=0):   TV_LIBRARY_DIR (or LIBRARY_DIR)/<Show Name>/
    let destFolder: string;
    if (mediaType === 'tv' && season !== undefined) {
      const showName = cleanTvFolderName(status.name);
      destFolder = season === 0
        ? path.join(EFFECTIVE_DIR, showName)
        : path.join(EFFECTIVE_DIR, showName, `Season ${season}`);
    } else {
      destFolder = path.join(EFFECTIVE_DIR, cleanFolderName(status.name));
    }

    assertWithinDir(destFolder, EFFECTIVE_DIR); // guard against traversal in torrent name
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
      assertWithinDir(sourcePath, DOWNLOAD_DIR); // guard against traversal in file path

      const destPath = path.join(destFolder, fileName);
      assertWithinDir(destPath, EFFECTIVE_DIR);  // guard dest too

      await fs.copyFile(sourcePath, destPath);
      await fs.unlink(sourcePath);

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
      } catch {
        // Folder may not exist — ignore
      }
    }

    // Kick off a Plex library scan so the content appears immediately — fire and forget
    triggerLibraryRefresh().catch(() => {});

    return NextResponse.json({ moved, skipped, destFolder });
  } catch (err) {
    console.error('[files/move]', err);
    const message = err instanceof Error ? err.message : 'Failed to move file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
