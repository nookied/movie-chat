'use client';

import { MutableRefObject, useCallback } from 'react';
import { downloadFailedSystemMessage, downloadNotReadySystemMessage, downloadSkippedSystemMessage } from '@/lib/chat/systemMessages';
import { torrentKey } from '@/lib/mediaKeys';
import type { PendingTorrentEntry } from './usePendingTorrents';
import type { StartedDownload } from './useAppDownloads';

interface Options {
  addInfoMessage: (content: string) => void;
  pendingTorrents: MutableRefObject<Map<string, PendingTorrentEntry>>;
  trackStartedDownload: (download: StartedDownload) => void;
}

export function useDownloadTrigger({ addInfoMessage, pendingTorrents, trackStartedDownload }: Options) {
  return useCallback(async (title: string, year?: number) => {
    const entry = pendingTorrents.current.get(torrentKey(title, year));
    if (!entry) {
      addInfoMessage(downloadNotReadySystemMessage(title));
      return false;
    }

    const { torrent, mediaType, season } = entry;

    try {
      const yearParam = year !== undefined ? `&year=${year}` : '';
      if (mediaType === 'tv') {
        const plexCheck = await fetch(`/api/plex/check?title=${encodeURIComponent(title)}${yearParam}&type=tv`);
        const plexData = await plexCheck.json();
        if (plexData.found && season !== undefined && season > 0) {
          const seasons: number[] = plexData.seasons ?? [];
          if (seasons.includes(season)) {
            addInfoMessage(downloadSkippedSystemMessage(title, season));
            return false;
          }
        }
      } else {
        const plexCheck = await fetch(`/api/plex/check?title=${encodeURIComponent(title)}${yearParam}`);
        const plexData = await plexCheck.json();
        if (plexData.found) {
          addInfoMessage(downloadSkippedSystemMessage(title));
          return false;
        }
      }
    } catch {
      // Plex unreachable — proceed with download rather than blocking
    }

    try {
      const response = await fetch('/api/transmission/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: torrent.magnet, mediaType, season, title, year }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Failed to add torrent');

      trackStartedDownload({
        id: data.id,
        mediaType,
        season,
        title,
        year,
      });
      return true;
    } catch (error) {
      addInfoMessage(downloadFailedSystemMessage(error instanceof Error ? error.message : 'Unknown error'));
      return false;
    }
  }, [addInfoMessage, pendingTorrents, trackStartedDownload]);
}
