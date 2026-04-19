'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveDownload, Recommendation } from '@/types';
import {
  addCappedSetEntry,
  cleanTorrentName,
  normalizeComparableTitle,
  trackedDownloadBaseTitle,
  trackedDownloadLabel,
  torrentKey,
} from '@/lib/mediaKeys';

const APP_TORRENT_IDS_KEY = 'movie-chat-app-torrents';
const DOWNLOAD_SYNC_INTERVAL_MS = 10_000;

function loadAppTorrentIds(): Set<number> {
  try {
    const stored = localStorage.getItem(APP_TORRENT_IDS_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as number[]);
  } catch {
    return new Set();
  }
}

function saveAppTorrentIds(ids: Set<number>) {
  try {
    localStorage.setItem(APP_TORRENT_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore storage issues */ }
}

export interface StartedDownload {
  id: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  title: string;
  year?: number;
}

export function useAppDownloads() {
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [movedTitles, setMovedTitles] = useState<Set<string>>(new Set());
  const controllersRef = useRef(new Set<AbortController>());
  const isMountedRef = useRef(true);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const syncAppDownloads = useCallback(() => {
    const controller = new AbortController();
    controllersRef.current.add(controller);

    fetch('/api/transmission/status', { signal: controller.signal })
      .then((response) => response.json())
      .then((torrents) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (!Array.isArray(torrents) || torrents.length === 0) return;

        const appIds = loadAppTorrentIds();
        setActiveDownloads((prev) => {
          const knownIds = new Set(prev.map((download) => download.torrentId));
          const incoming = torrents
            .filter((torrent: { id: number; isAppTorrent?: boolean }) =>
              (torrent.isAppTorrent || appIds.has(torrent.id)) && !knownIds.has(torrent.id)
            )
            .map((torrent: {
              id: number;
              name: string;
              appMeta?: { mediaType?: string; season?: number; title?: string; year?: number };
            }) => {
              const mediaType: ActiveDownload['mediaType'] = torrent.appMeta?.mediaType === 'tv'
                ? 'tv'
                : torrent.appMeta?.mediaType === 'movie'
                  ? 'movie'
                  : undefined;

              return {
                mediaType,
                season: torrent.appMeta?.season,
                torrentId: torrent.id,
                torrentName: trackedDownloadLabel(
                  torrent.appMeta?.title ?? cleanTorrentName(torrent.name),
                  mediaType,
                  torrent.appMeta?.season,
                ),
                addedAt: Date.now(),
                fromApp: true,
                year: torrent.appMeta?.year,
              };
            });
          return incoming.length > 0 ? [...prev, ...incoming] : prev;
        });
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        /* Transmission not reachable — no-op */
      })
      .finally(() => {
        controllersRef.current.delete(controller);
      });
  }, []);

  useEffect(() => {
    syncAppDownloads();
    const interval = setInterval(syncAppDownloads, DOWNLOAD_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncAppDownloads]);

  const trackStartedDownload = useCallback((download: StartedDownload) => {
    const appIds = loadAppTorrentIds();
    appIds.add(download.id);
    saveAppTorrentIds(appIds);

    setActiveDownloads((prev) => [
      ...prev.filter((entry) => entry.torrentId !== download.id),
      {
        torrentId: download.id,
        torrentName: trackedDownloadLabel(download.title, download.mediaType, download.season),
        addedAt: Date.now(),
        fromApp: true,
        mediaType: download.mediaType,
        season: download.season,
        year: download.year,
      },
    ]);
  }, []);

  const handleDownloadMoved = useCallback((name: string, year?: number, mediaType?: 'movie' | 'tv') => {
    if (!mediaType) return;
    setMovedTitles((prev) => addCappedSetEntry(
      prev,
      torrentKey(trackedDownloadBaseTitle(name), year, mediaType),
      100,
    ));
  }, []);

  const handleDownloadComplete = useCallback((id: number) => {
    setActiveDownloads((prev) => prev.filter((download) => download.torrentId !== id));
    const appIds = loadAppTorrentIds();
    appIds.delete(id);
    saveAppTorrentIds(appIds);
  }, []);

  const isRecommendationDownloading = useCallback((recommendation: Recommendation, season?: number) => (
    activeDownloads.some((download) => {
      if (download.mediaType && download.mediaType !== recommendation.type) {
        return false;
      }
      if (
        normalizeComparableTitle(trackedDownloadBaseTitle(download.torrentName))
        !== normalizeComparableTitle(recommendation.title)
      ) {
        return false;
      }
      if (season !== undefined && download.season !== undefined && download.season !== season) {
        return false;
      }
      if (download.year !== undefined && recommendation.year !== undefined) {
        return download.year === recommendation.year;
      }
      return true;
    })
  ), [activeDownloads]);

  const isRecommendationForcedInLibrary = useCallback((recommendation: Recommendation) => (
    movedTitles.has(torrentKey(recommendation.title, recommendation.year, recommendation.type))
  ), [movedTitles]);

  return {
    activeDownloads,
    handleDownloadComplete,
    handleDownloadMoved,
    isRecommendationDownloading,
    isRecommendationForcedInLibrary,
    trackStartedDownload,
  };
}
