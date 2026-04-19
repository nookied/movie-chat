export type MessageRole = 'user' | 'assistant' | 'info';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp?: number;
  recommendations?: Recommendation[];
}

export interface Recommendation {
  title: string;
  year?: number;
  type: 'movie' | 'tv';
  strictYear?: boolean;
}

export interface PlexStatus {
  found: boolean;
  plexUrl?: string;
  addedAt?: string;
  /** TV shows only: season numbers (1-based) present in the Plex library */
  seasons?: number[];
}

export interface ReviewData {
  tmdbScore?: number;
  imdbScore?: string;
  rtScore?: string;
  overview?: string;
  poster?: string;
  genres?: string[];
  runtime?: number;
  director?: string;
  tmdbId?: number;
  numberOfSeasons?: number;
  year?: number;
}

export interface MovieDisambiguationCandidate {
  title: string;
  year?: number;
  tmdbId: number;
  overview?: string;
  poster?: string;
}

export interface ReviewLookupResponse extends ReviewData {
  resolvedRecommendation?: Recommendation;
  ambiguityCandidates?: MovieDisambiguationCandidate[];
}

export interface TorrentOption {
  quality: string;
  type: string;
  codec: string;
  size: string;
  seeders: number;
  magnet: string;
  movieTitle: string;
}

export interface TorrentSearchResult {
  torrents: TorrentOption[];
  // true when the movie exists on YTS but has no 1080p version
  noSuitableQuality: boolean;
}

export interface YtsTorrentEntry {
  hash: string;
  quality: string;
  type: string;
  codec: string;
  size: string;
  seeders: number;
}

export interface YtsMovieEntry {
  ytsId: number;
  title: string;
  year: number;
  imdbCode: string;
  imdbRating: number;
  genres: string[];
  poster: string;
  synopsis: string;
  downloadCount: number;
  torrents: YtsTorrentEntry[];
}

export type YtsPopularSortBy = 'download_count' | 'rating' | 'date_added' | 'seeds' | 'year';

export interface YtsPopularOptions {
  sortBy?: YtsPopularSortBy;
  genre?: string;
  minimumRating?: number;
  minimumYear?: number;
  maximumYear?: number;
  page?: number;
  limit?: number;
}

export interface YtsPopularResult {
  movies: YtsMovieEntry[];
  totalCount: number;
  page: number;
  limit: number;
}

export interface DownloadStatus {
  id: number;
  percentDone: number;
  status: number;
  name: string;
  eta: number;
  rateDownload: number;
  /** Actual download directory reported by Transmission for this torrent */
  downloadDir?: string;
  files: Array<{
    name: string;
    length: number;
    bytesCompleted: number;
  }>;
}

export interface ActiveDownload {
  torrentId: number;
  torrentName: string;
  addedAt: number;
  /** true = added through this app; false = picked up from Transmission externally */
  fromApp: boolean;
  mediaType?: 'movie' | 'tv';
  season?: number;
  year?: number;
}
