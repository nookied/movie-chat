/**
 * Server-side background poller that automatically moves completed app torrents
 * to the Plex library without requiring the browser UI to be open.
 *
 * Behaviour:
 * - Checks Transmission every 60 s for completed app torrents
 * - Processes moves one at a time (serialised) with a 15 s gap between each
 *   to avoid saturating disk I/O when multiple downloads finish at once
 * - Safe to restart: if a torrent was already moved the torrent-not-found error
 *   from Transmission is swallowed; unregisterAppTorrent is idempotent
 *
 * Started once at server boot via instrumentation.ts.
 * The intervals are unref()'d so they do not prevent Node.js from exiting.
 */

import { listActiveTorrents } from './transmission';
import { isAppTorrent, getAppTorrentMeta } from './appTorrents';
import { moveTorrentFiles } from './moveFiles';

let started = false;
let ticking = false;

async function tick(): Promise<void> {
  // Guard against the previous tick still running (e.g. a very large file being copied)
  if (ticking) return;
  ticking = true;

  try {
    let torrents;
    try {
      torrents = await listActiveTorrents();
    } catch {
      return; // Transmission not reachable — try again next tick
    }

    let movedCount = 0;

    for (const torrent of torrents) {
      // Mirror the same "done" logic used in DownloadTracker.tsx
      const isDone =
        Math.round(torrent.percentDone * 100) >= 100 &&
        (torrent.status === 0 || torrent.status === 5 || torrent.status === 6);

      if (!isDone) continue;

      if (!isAppTorrent(torrent.id)) {
        console.log(`[autoMove] Skipping torrent ${torrent.id} "${torrent.name}" — not in app registry`);
        continue;
      }

      // 15 s gap *between* moves (not before the first, not after the last).
      // Gives the OS time to flush I/O buffers between large file copies.
      if (movedCount > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 15_000));
      }

      const meta = getAppTorrentMeta(torrent.id);
      try {
        console.log(`[autoMove] Moving torrent ${torrent.id} "${torrent.name}"`);
        await moveTorrentFiles(torrent.id, meta?.mediaType, meta?.season);
        console.log(`[autoMove] Done — torrent ${torrent.id}`);
        movedCount++;
      } catch (err) {
        // moveTorrentFiles throws MoveError('already in progress') when the client
        // is simultaneously moving the same torrent — not a real error.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already in progress')) {
          console.error(`[autoMove] Failed to move torrent ${torrent.id}:`, err);
        }
        // Count it so we still wait 15 s before the next torrent, preventing
        // a burst of rapid-fire moves after a series of "already in progress" skips.
        movedCount++;
      }
    }
  } finally {
    ticking = false;
  }
}

export function startAutoMovePoller(): void {
  if (started) return;
  started = true;

  console.log('[autoMove] Poller started — will check Transmission every 60 s');

  // Delay the first check by 60 s so the server finishes booting before we
  // start hammering Transmission
  const initial = setTimeout(() => {
    tick().catch(console.error);

    const interval = setInterval(() => {
      tick().catch(console.error);
    }, 60_000);

    // unref() so this interval doesn't keep the Node.js process alive after
    // a graceful shutdown signal
    interval.unref();
  }, 60_000);

  initial.unref();
}
