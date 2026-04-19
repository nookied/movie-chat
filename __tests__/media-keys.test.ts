import { describe, expect, it } from 'vitest';
import {
  addCappedSetEntry,
  cleanTorrentName,
  normalizeComparableTitle,
  recommendationKey,
  trackedDownloadBaseTitle,
  trackedDownloadLabel,
  torrentKey,
} from '@/lib/mediaKeys';

describe('cleanTorrentName', () => {
  it('strips trailing year and torrent noise from display names', () => {
    expect(cleanTorrentName('Dead Mans Wire (2025) [1080p] [WEBRip] [YTS.MX]')).toBe('Dead Mans Wire');
  });

  it('falls back to the raw string when stripping would leave nothing useful', () => {
    expect(cleanTorrentName('Movie Title')).toBe('Movie Title');
  });
});

describe('recommendationKey / torrentKey', () => {
  it('normalizes titles to lowercase and includes a stable unknown-year fallback', () => {
    expect(recommendationKey({ title: 'Alien', type: 'movie' })).toBe('movie-alien-unknown');
    expect(torrentKey('Alien', 1979)).toBe('alien-1979');
  });

  it('produces distinct keys for a movie and a TV show with the same title+year', () => {
    const movie = recommendationKey({ title: 'The Office', year: 2001, type: 'movie' });
    const tv = recommendationKey({ title: 'The Office', year: 2001, type: 'tv' });
    expect(movie).not.toBe(tv);
  });
});

describe('trackedDownloadLabel / trackedDownloadBaseTitle', () => {
  it('formats tv downloads with the same display label used in the UI', () => {
    expect(trackedDownloadLabel('Severance', 'tv', 2)).toBe('Severance — Season 2');
    expect(trackedDownloadLabel('Severance', 'tv', 0)).toBe('Severance — Complete Series');
    expect(trackedDownloadLabel('Alien', 'movie')).toBe('Alien');
  });

  it('recovers the canonical title from tracked download labels', () => {
    expect(trackedDownloadBaseTitle('Severance — Season 2')).toBe('Severance');
    expect(trackedDownloadBaseTitle('Severance — Complete Series')).toBe('Severance');
    expect(trackedDownloadBaseTitle('Alien')).toBe('Alien');
  });
});

describe('normalizeComparableTitle', () => {
  it('strips punctuation and collapses whitespace for cross-source title matching', () => {
    expect(normalizeComparableTitle('Kung Fury:  Street-Level!')).toBe('kung fury street level');
  });
});

describe('addCappedSetEntry', () => {
  it('adds new entries while preserving insertion order', () => {
    const result = addCappedSetEntry(new Set(['a', 'b']), 'c', 3);
    expect(Array.from(result)).toEqual(['a', 'b', 'c']);
  });

  it('drops the oldest entry once the cap is exceeded', () => {
    const result = addCappedSetEntry(new Set(['a', 'b']), 'c', 2);
    expect(Array.from(result)).toEqual(['b', 'c']);
  });

  it('does not duplicate an existing entry when re-adding it', () => {
    const result = addCappedSetEntry(new Set(['a', 'b']), 'b', 2);
    expect(Array.from(result)).toEqual(['a', 'b']);
  });
});
