'use client';

import { useCallback, useRef } from 'react';
import { TorrentOption } from '@/types';
import { torrentKey } from '@/lib/mediaKeys';
import { titleAvailableSystemMessage } from '@/lib/chat/systemMessages';

const MAX_PENDING_TORRENTS = 60;

export interface PendingTorrentEntry {
  mediaType: 'movie' | 'tv';
  season?: number;
  torrent: TorrentOption;
  title: string;
  year?: number;
  strictYear?: boolean;
}

export function usePendingTorrents(addInfoMessage: (content: string) => void) {
  const pendingTorrents = useRef<Map<string, PendingTorrentEntry>>(new Map());

  const handleTorrentsReady = useCallback((
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number,
    strictYear?: boolean
  ) => {
    pendingTorrents.current.set(torrentKey(title, year), {
      torrent: torrents[0],
      mediaType,
      season,
      title,
      year,
      strictYear,
    });
    if (pendingTorrents.current.size > MAX_PENDING_TORRENTS) {
      const oldest = pendingTorrents.current.keys().next().value;
      if (oldest !== undefined) pendingTorrents.current.delete(oldest);
    }

    addInfoMessage(titleAvailableSystemMessage(title, mediaType === 'tv' ? season : undefined));
  }, [addInfoMessage]);

  return { handleTorrentsReady, pendingTorrents };
}
