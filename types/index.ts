export type MessageRole = 'user' | 'assistant' | 'info';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  recommendation?: Recommendation;
}

export interface Recommendation {
  title: string;
  year: number;
  type: 'movie' | 'tv';
}

export interface PlexStatus {
  found: boolean;
  plexUrl?: string;
  addedAt?: string;
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

export interface DownloadStatus {
  id: number;
  percentDone: number;
  status: number;
  name: string;
  eta: number;
  rateDownload: number;
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
}
