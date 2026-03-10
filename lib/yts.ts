import { TorrentOption, TorrentSearchResult } from '@/types';

// yts.mx is down; yts.bz redirected to this new base as of early 2026
const YTS_API = 'https://movies-api.accel.li/api/v2/list_movies.json';

// Public trackers to include in magnet links
const TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80',
  'udp://tracker.coppersurfer.tk:6969',
  'udp://glotorrents.pw:6969/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://torrent.gresille.org:80/announce',
  'udp://p4p.arenabg.com:1337',
  'udp://tracker.leechers-paradise.org:6969',
];

function buildMagnet(hash: string, title: string): string {
  const trackerParams = TRACKERS.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}&${trackerParams}`;
}

interface YtsTorrent {
  hash: string;
  quality: string;
  type: string;
  video_codec: string; // 'x264' | 'x265'
  size: string;
  seeds: number;
}

interface YtsMovie {
  id: number;
  title: string;
  year: number;
  torrents?: YtsTorrent[];
}

export async function searchTorrents(
  title: string,
  year?: number
): Promise<TorrentSearchResult> {
  const url = new URL(YTS_API);
  // Including the year in the query helps YTS rank the correct film first when
  // there are many results with similar titles (e.g. "Liar Liar" vs "Liar Liar 1997").
  url.searchParams.set('query_term', year ? `${title} ${year}` : title);
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { torrents: [], noSuitableQuality: false };

  const data = await res.json();
  const movies: YtsMovie[] = data?.data?.movies ?? [];

  // Find the best matching movie — exact title required to avoid false positives
  // (e.g. "Food and Shelter" matching a search for "Shelter")
  const lc = title.toLowerCase();
  const exactWithYear = movies.find(
    (m) => m.title.toLowerCase() === lc && (year === undefined || Math.abs(m.year - year) <= 1)
  );
  const exactAnyYear = movies.find((m) => m.title.toLowerCase() === lc);
  const match = exactWithYear ?? exactAnyYear;

  if (!match?.torrents || match.torrents.length === 0) {
    return { torrents: [], noSuitableQuality: false };
  }

  // Filter to 1080p only
  const p1080 = match.torrents.filter((t) => t.quality === '1080p');

  if (p1080.length === 0) {
    // Movie exists on YTS but no 1080p version available
    return { torrents: [], noSuitableQuality: true };
  }

  // Sort: x265 first, then x264; within same codec prefer bluray over web
  const sorted = [...p1080].sort((a, b) => {
    if (a.video_codec === 'x265' && b.video_codec !== 'x265') return -1;
    if (a.video_codec !== 'x265' && b.video_codec === 'x265') return 1;
    if (a.type === 'bluray' && b.type !== 'bluray') return -1;
    if (a.type !== 'bluray' && b.type === 'bluray') return 1;
    return b.seeds - a.seeds; // highest seeders last tiebreaker
  });

  const torrents: TorrentOption[] = sorted.map((t) => ({
    quality: t.quality,
    type: t.type,
    codec: t.video_codec,
    size: t.size,
    seeders: t.seeds,
    magnet: buildMagnet(t.hash, match.title),
    movieTitle: match.title,
  }));

  return { torrents, noSuitableQuality: false };
}
