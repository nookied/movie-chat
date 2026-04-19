'use client';

import { MutableRefObject, useCallback } from 'react';
import { downloadFailedSystemMessage, downloadNotReadySystemMessage, downloadSkippedSystemMessage } from '@/lib/chat/systemMessages';
import { normalizeComparableTitle, torrentKey } from '@/lib/mediaKeys';
import type { PendingTorrentEntry } from './usePendingTorrents';
import type { StartedDownload } from './useAppDownloads';

interface Options {
  addInfoMessage: (content: string) => void;
  pendingTorrents: MutableRefObject<Map<string, PendingTorrentEntry>>;
  trackStartedDownload: (download: StartedDownload) => void;
}

export function useDownloadTrigger({ addInfoMessage, pendingTorrents, trackStartedDownload }: Options) {
  return useCallback(async (title: string, year?: number, requestedMediaType?: 'movie' | 'tv') => {
    // Fast path: exact key hit for movies (no season ambiguity).
    let entry = requestedMediaType === 'movie'
      ? pendingTorrents.current.get(torrentKey(title, year, 'movie'))
      : undefined;

    // Fallback: scan for title/type/year matches. For TV, multiple seasons may
    // be pending at once — Map preserves insertion order, so the last match is
    // the one the user just queued.
    if (!entry) {
      const normalizedTitle = normalizeComparableTitle(title);
      let latestMatch: PendingTorrentEntry | undefined;
      for (const pending of pendingTorrents.current.values()) {
        if (normalizeComparableTitle(pending.title) !== normalizedTitle) continue;
        if (year !== undefined && pending.year !== year) continue;
        if (requestedMediaType !== undefined && pending.mediaType !== requestedMediaType) continue;
        latestMatch = pending;
      }
      entry = latestMatch;
    }

    if (!entry) {
      addInfoMessage(downloadNotReadySystemMessage(title));
      return false;
    }

    const {
      mediaType,
      season,
      strictYear,
      title: resolvedTitle,
      torrent,
      year: resolvedYear,
    } = entry;

    try {
      const yearParam = resolvedYear !== undefined ? `&year=${resolvedYear}` : '';
      const strictYearParam = strictYear ? '&strictYear=true' : '';
      if (mediaType === 'tv') {
        const plexCheck = await fetch(`/api/plex/check?title=${encodeURIComponent(resolvedTitle)}${yearParam}&type=tv`);
        const plexData = await plexCheck.json();
        if (plexData.found && season !== undefined && season > 0) {
          const seasons: number[] = plexData.seasons ?? [];
          if (seasons.includes(season)) {
            addInfoMessage(downloadSkippedSystemMessage(resolvedTitle, season));
            return false;
          }
        }
      } else {
        const plexCheck = await fetch(
          `/api/plex/check?title=${encodeURIComponent(resolvedTitle)}${yearParam}${strictYearParam}`
        );
        const plexData = await plexCheck.json();
        if (plexData.found) {
          addInfoMessage(downloadSkippedSystemMessage(resolvedTitle));
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
        body: JSON.stringify({
          magnet: torrent.magnet,
          mediaType,
          season,
          title: resolvedTitle,
          year: resolvedYear,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Failed to add torrent');

      trackStartedDownload({
        id: data.id,
        mediaType,
        season,
        title: resolvedTitle,
        year: resolvedYear,
      });
      return true;
    } catch (error) {
      addInfoMessage(downloadFailedSystemMessage(error instanceof Error ? error.message : 'Unknown error'));
      return false;
    }
  }, [addInfoMessage, pendingTorrents, trackStartedDownload]);
}
