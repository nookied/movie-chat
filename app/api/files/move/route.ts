import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus, removeTorrent } from '@/lib/transmission';
import { promises as fs } from 'fs';
import path from 'path';
import { cfg } from '@/lib/config';

// Only copy media files — skip YTS junk (.txt, .jpg, .nfo, etc.)
const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv',  // video
  '.srt', '.sub', '.ass', '.ssa', '.vtt',           // subtitles
]);

// "Dead Mans Wire (2025) [1080p] [WEBRip] [x265]..." → "Dead Mans Wire (2025)"
function cleanFolderName(torrentName: string): string {
  return torrentName.replace(/\s*\[.*$/s, '').trim() || torrentName;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { torrentId } = body as { torrentId: number };

  if (!torrentId || typeof torrentId !== 'number') {
    return NextResponse.json({ error: 'torrentId required' }, { status: 400 });
  }

  const LIBRARY_DIR  = cfg('libraryDir',             'LIBRARY_DIR');
  const DOWNLOAD_DIR = cfg('transmissionDownloadDir', 'TRANSMISSION_DOWNLOAD_DIR');

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

    // No library directory configured — just remove the job from Transmission
    if (!LIBRARY_DIR) {
      await removeTorrent(torrentId);
      return NextResponse.json({ moved: [], removedOnly: true });
    }

    if (!status.files || status.files.length === 0) {
      return NextResponse.json({ error: 'No files found in torrent' }, { status: 400 });
    }

    // Destination subfolder: LIBRARY_DIR/<clean movie name>/
    const destFolder = path.join(LIBRARY_DIR, cleanFolderName(status.name));
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

      const sourcePath = DOWNLOAD_DIR
        ? path.join(DOWNLOAD_DIR, file.name)
        : file.name;

      const destPath = path.join(destFolder, fileName);

      await fs.copyFile(sourcePath, destPath);
      await fs.unlink(sourcePath);

      moved.push(fileName);
    }

    // Remove torrent from Transmission
    await removeTorrent(torrentId);

    // Clean up the source torrent folder (may still have skipped junk files)
    if (DOWNLOAD_DIR && status.name) {
      const torrentFolder = path.join(DOWNLOAD_DIR, status.name);
      try {
        await fs.rm(torrentFolder, { recursive: true, force: true });
      } catch {
        // Folder may not exist — ignore
      }
    }

    return NextResponse.json({ moved, skipped, destFolder });
  } catch (err) {
    console.error('[files/move]', err);
    const message = err instanceof Error ? err.message : 'Failed to move file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
