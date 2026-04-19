import {
  TorrentOption,
  TorrentSearchResult,
  YtsMovieEntry,
  YtsPopularOptions,
  YtsPopularResult,
} from '@/types';

// yts.mx is down; yts.bz redirected to this new base as of early 2026
const YTS_API = 'https://movies-api.accel.li/api/v2/list_movies.json';

const POPULAR_CACHE_SECONDS = 14400;

// YTS enforces `limit=50` as its ceiling.
const YTS_MAX_LIMIT = 50;

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
  rating?: number;
  genres?: string[];
  imdb_code?: string;
  large_cover_image?: string;
  synopsis?: string;
  download_count?: number;
  torrents?: YtsTorrent[];
}

interface SearchTorrentOptions {
  strictYear?: boolean;
}

// Strip punctuation and collapse whitespace so "Avatar: Fire and Ash" matches
// "Avatar Fire and Ash" and vice-versa.
// Replace & with "and" before stripping so "Rosencrantz & Guildenstern Are Dead"
// matches the YTS entry "Rosencrantz and Guildenstern Are Dead".
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Query YTS and return matching torrents, or null if no exact-title match found.
async function queryYts(
  searchTitle: string,
  matchTitle: string,
  year?: number,
  options: SearchTorrentOptions = {}
): Promise<TorrentSearchResult | null> {
  const url = new URL(YTS_API);
  // Including the year in the query helps YTS rank the correct film first when
  // there are many results with similar titles (e.g. "Liar Liar" vs "Liar Liar 1997").
  url.searchParams.set('query_term', year ? `${searchTitle} ${year}` : searchTitle);
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const data = await res.json();
  const movies: YtsMovie[] = data?.data?.movies ?? [];

  const norm = normalizeTitle(matchTitle);
  const exactWithYear = movies.find(
    (m) => normalizeTitle(m.title) === norm && (year === undefined || Math.abs(m.year - year) <= 1)
  );
  const exactAnyYear = year !== undefined && options.strictYear
    ? undefined
    : movies.find((m) => normalizeTitle(m.title) === norm);
  const match = exactWithYear ?? exactAnyYear;

  if (!match?.torrents || match.torrents.length === 0) return null;

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

export async function searchTorrents(
  title: string,
  year?: number,
  options: SearchTorrentOptions = {}
): Promise<TorrentSearchResult> {
  const primary = await queryYts(title, title, year, options);
  if (primary) return primary;

  // Fallback 1: retry with punctuation stripped from the query term
  // e.g. "Avatar: Fire and Ash" → search "avatar fire and ash"
  const normalized = normalizeTitle(title);
  if (normalized !== title.toLowerCase()) {
    const fallbackStripped = await queryYts(normalized, title, year, options);
    if (fallbackStripped) return fallbackStripped;
  }

  // Fallback 2: some films are indexed on YTS without their subtitle
  // e.g. "Spiral: From the Book of Saw" → stored as "Spiral"
  // Strip everything after the first ": " or " - " and retry.
  const colonIdx = title.indexOf(': ');
  const dashIdx = title.indexOf(' - ');
  const cutIdx = colonIdx !== -1 ? colonIdx : dashIdx;
  if (cutIdx !== -1) {
    const baseTitle = title.slice(0, cutIdx);
    const fallback = await queryYts(baseTitle, baseTitle, year, options);
    if (fallback) return fallback;
  }

  return { torrents: [], noSuitableQuality: false };
}

function mapPopularMovie(m: YtsMovie): YtsMovieEntry {
  return {
    ytsId: m.id,
    title: m.title,
    year: m.year,
    imdbCode: m.imdb_code ?? '',
    imdbRating: typeof m.rating === 'number' ? m.rating : 0,
    genres: m.genres ?? [],
    poster: m.large_cover_image ?? '',
    synopsis: m.synopsis ?? '',
    downloadCount: m.download_count ?? 0,
    torrents: (m.torrents ?? []).map((t) => ({
      hash: t.hash,
      quality: t.quality,
      type: t.type,
      codec: t.video_codec,
      size: t.size,
      seeders: t.seeds,
    })),
  };
}

export async function fetchPopularMovies(options: YtsPopularOptions = {}): Promise<YtsPopularResult> {
  const sortBy = options.sortBy ?? 'download_count';
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const minimumYear = typeof options.minimumYear === 'number' && options.minimumYear > 0
    ? options.minimumYear
    : undefined;

  // YTS has no year filter, so when minimumYear is set we over-fetch to keep
  // each page roughly `limit`-sized after dropping old re-uploads client-side.
  const fetchLimit = minimumYear
    ? Math.min(YTS_MAX_LIMIT, Math.max(limit, limit * 3))
    : limit;

  const url = new URL(YTS_API);
  url.searchParams.set('sort_by', sortBy);
  url.searchParams.set('order_by', 'desc');
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(fetchLimit));
  if (options.genre) url.searchParams.set('genre', options.genre);
  if (typeof options.minimumRating === 'number' && options.minimumRating > 0) {
    url.searchParams.set('minimum_rating', String(options.minimumRating));
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: POPULAR_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`YTS HTTP ${res.status}`);

  const data = await res.json();
  const movies: YtsMovie[] = data?.data?.movies ?? [];
  const rawTotalCount: number = data?.data?.movie_count ?? 0;

  const filtered = minimumYear
    ? movies.filter((m) => typeof m.year === 'number' && m.year >= minimumYear)
    : movies;

  // Scale totalCount by the filter's hit-rate so pagination shows a realistic
  // number of pages instead of YTS's full catalog size.
  const totalCount = minimumYear && movies.length > 0
    ? Math.max(filtered.length, Math.round(rawTotalCount * (filtered.length / movies.length)))
    : rawTotalCount;

  return {
    movies: filtered.slice(0, limit).map(mapPopularMovie),
    totalCount,
    page,
    limit,
  };
}
