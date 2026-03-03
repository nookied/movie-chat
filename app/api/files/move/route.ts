import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus, removeTorrent } from '@/lib/transmission';
import { promises as fs } from 'fs';
import path from 'path';
import { cfg } from '@/lib/config';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { torrentId } = body as { torrentId: number };

  if (!torrentId || typeof torrentId !== 'number') {
    return NextResponse.json({ error: 'torrentId required' }, { status: 400 });
  }

  const LIBRARY_DIR  = cfg('libraryDir',             'LIBRARY_DIR');
  const DOWNLOAD_DIR = cfg('transmissionDownloadDir', 'TRANSMISSION_DOWNLOAD_DIR');

  if (!LIBRARY_DIR) {
    return NextResponse.json(
      { error: 'LIBRARY_DIR environment variable is not set' },
      { status: 500 }
    );
  }

  try {
    const status = await getTorrentStatus(torrentId);

    if (status.percentDone < 1) {
      return NextResponse.json(
        { error: 'Torrent is not fully downloaded yet' },
        { status: 400 }
      );
    }

    if (!status.files || status.files.length === 0) {
      return NextResponse.json({ error: 'No files found in torrent' }, { status: 400 });
    }

    // Move each file to the library directory
    const moved: string[] = [];
    for (const file of status.files) {
      // Transmission reports file names relative to the download dir
      const sourcePath = DOWNLOAD_DIR
        ? path.join(DOWNLOAD_DIR, file.name)
        : file.name;

      const fileName = path.basename(file.name);
      const destPath = path.join(LIBRARY_DIR, fileName);

      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Copy then delete to handle cross-device moves
      await fs.copyFile(sourcePath, destPath);
      await fs.unlink(sourcePath);

      moved.push(fileName);
    }

    // Remove torrent from Transmission (keep data=false since we moved the file)
    await removeTorrent(torrentId);

    // Clean up empty download directory if it's a named subfolder
    if (DOWNLOAD_DIR && status.name) {
      const torrentFolder = path.join(DOWNLOAD_DIR, status.name);
      try {
        const remaining = await fs.readdir(torrentFolder);
        if (remaining.length === 0) await fs.rmdir(torrentFolder);
      } catch {
        // Folder may not exist or may not be empty — ignore
      }
    }

    return NextResponse.json({ moved });
  } catch (err) {
    console.error('[files/move]', err);
    const message = err instanceof Error ? err.message : 'Failed to move file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
