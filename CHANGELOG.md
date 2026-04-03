# Movie Chat — Changelog

All notable changes to the project, grouped by session/batch. Most recent changes first.

---

## 2026-03-10 — YTS search resilience & LLM guardrails

### Fixed
- **YTS subtitle fallback** (`lib/yts.ts`): When YTS drops the subtitle from a film name (e.g. "Alien: Romulus" → "Alien Romulus"), now falls back to a base title search so the torrent is still found
- **False-positive Downloading label** (`components/RecommendationCard.tsx`): Films with the same title but different years no longer show a spurious "Downloading" badge — year is now compared alongside title
- **YTS false negatives** (`lib/yts.ts`): Increased result limit on title-only searches to avoid missing valid torrents

### Changed
- **System prompt hardened** (`app/api/chat/route.ts`): Strengthened instructions to prevent the LLM from substituting similar-sounding films when the requested title isn't found

---

## 2026-03-08 — Post-move verification, TV logic, unit tests

### Added
- **Post-move Plex re-check** (`lib/autoMove.ts`): After moving files, the system re-checks Plex to confirm the title appeared in the library
- **Daily registry cleanup** (`lib/appTorrents.ts`): Stale torrent entries (no longer in Transmission) are pruned automatically once per day
- **Unit tests** — expanded test coverage for move and registry flows

### Changed
- **TV recommendation logic** (`app/api/chat/route.ts`): Improved how the LLM handles TV show recommendations
- **Header subtitle** — changed to "An AI-powered Plex assistant"

### Fixed
- **Year handling** (`lib/tmdb.ts`, `components/RecommendationCard.tsx`): Corrected how release years are extracted and passed through the recommendation pipeline

---

## 2026-03-07 — Year extraction & developer docs

### Added
- **CLAUDE.md** — project instructions for AI-assisted development (architecture, debugging guidelines, flow separation)

### Fixed
- **Year info pull** (`lib/tmdb.ts`): Fixed year extraction from TMDB metadata so recommendation cards and torrent searches use the correct release year

---

## 2026-03-06 — Auto-move poller, download tracker fixes, LLM tagging

### Fixed
- **Auto-move poller** (`lib/autoMove.ts`): Fixed background poller failing to move completed torrents under certain Transmission states
- **Download tracker** (`components/DownloadTracker.tsx`): Multiple fixes to progress display and status detection
- **LLM tagging** (`app/api/chat/route.ts`): Fixed recommendation/download tag parsing for edge cases; hotfixed system prompt for more reliable structured output
- **Chat route** (`app/api/chat/route.ts`): Patched streaming response handling
- **Memory overload** (`app/api/chat/route.ts`): Fixed unbounded context growth that could exhaust memory on long conversations

### Added
- **Background file mover** (`lib/autoMove.ts`): Server-side poller that moves completed downloads to Plex even when the browser is closed

---

## 2026-03-05 — TV shows (PR #1), PWA, installer

### Added
- **TV show support** (`components/RecommendationCard.tsx`, `lib/eztv.ts`): Full TV flow with season picker — seasons already in Plex are greyed out, one-click download per season
- **Knaben torrent source** (`lib/eztv.ts`): Switched TV torrent search from EZTV to Knaben API for better aggregation across trackers
- **Plex season check** (`lib/plex.ts`): API now returns which seasons are in the library, enabling the season picker UI
- **TV library directory** — separate configurable path for TV show files
- **Torrent option picker** (`components/RecommendationCard.tsx`): Inline dropdown for choosing between multiple torrent results for a TV season
- **PWA support** (`app/manifest.ts`, `app/icon*.tsx`): Installable as a Progressive Web App on mobile and desktop
- **Collapsible downloads panel** (`components/DownloadsPanel.tsx`): Active downloads sidebar, collapsed by default
- **Install/uninstall scripts** (`install.sh`, `uninstall.sh`, `setup.sh`): One-liner installer with pm2 service management and optional auto-update cron
- **Auto-dismiss download card**: Download tracker auto-dismisses when the torrent is no longer in Transmission

### Changed
- **pm2 mode** (`ecosystem.config.js`): Switched from fork to production mode for better stability
- **TV torrent scoring** (`lib/eztv.ts`): Removed codec bonus; added size bonus and multi-season filter for more reliable season pack selection
- **TMDB fallback** (`lib/tmdb.ts`): Falls back to year-free search when year-qualified TMDB query returns nothing

### Fixed
- **TV torrent picker** (`components/RecommendationCard.tsx`): Filters out 4K torrents; replaced chip buttons with inline dropdown for cleaner UI
- **isCompletePack false positive** (`lib/eztv.ts`): Fixed regex that incorrectly identified partial packs as complete season packs
- **Downloads panel** (`components/DownloadsPanel.tsx`): Collapsed by default; fixed tsconfig target for compatibility

### Security
- **CVE patches**: Patched 4 high-severity CVEs; upgraded Next.js 14 → 15.5.12
- **Setup scripts** (`setup.sh`, `uninstall.sh`): Updated for Next.js 15 compatibility

### Technical details
- Vitest test suite: 62 tests added covering torrent scoring, pack detection, and Plex check logic
- TV flow merged via PR #1 from `tvshows` branch

---

## 2026-03-04 — v1.0 release (movies only)

### Added
- **AI chat interface** (`components/ChatInterface.tsx`): Conversational UI powered by OpenRouter (cloud) with automatic Ollama fallback (local)
- **Recommendation cards** (`components/RecommendationCard.tsx`): Each AI suggestion renders as a card with poster, ratings (TMDB, IMDb, Rotten Tomatoes via OMDB), Plex availability badge, and download button
- **Plex library check** (`lib/plex.ts`): Real-time check against Plex Media Server for every recommendation
- **YTS torrent search** (`lib/yts.ts`): 1080p movie torrent search via YTS API
- **Transmission integration** (`lib/transmission.ts`): Add magnet links, poll progress, pause/resume/cancel — all via Transmission RPC
- **File move to Plex** (`lib/moveFiles.ts`): Copies completed downloads into organized Plex library folders and triggers a library scan
- **Download tracker** (`components/DownloadTracker.tsx`): Real-time progress bar with pause/resume/cancel controls, polling every 5 seconds
- **Settings page** (`app/settings/page.tsx`): Configure all API keys and service URLs from the browser — saved to `config.local.json`
- **TMDB metadata** (`lib/tmdb.ts`): Posters, overviews, cast, director, runtime
- **OMDB ratings** (`lib/omdb.ts`): IMDb score and Rotten Tomatoes percentage
- **Torrent registry** (`lib/appTorrents.ts`): Tracks which torrents the app added — enables cross-device visibility and prevents controlling external torrents
- **Local network middleware** (`middleware.ts`): Blocks non-LAN traffic (RFC-1918 + `.local` mDNS)
- **Rate limiting** (`app/api/chat/route.ts`): 30 req/min per IP on chat endpoint

### Technical details
- Next.js 15, React 18, TypeScript (strict), Tailwind CSS
- Config chain: `config.local.json` → `process.env` → defaults
- All service URLs configurable via Settings or `.env.local`

---

## 2026-03-02 — Project scaffolding

### Added
- Initial Next.js project setup with TypeScript and Tailwind CSS
- Repository created with base configuration
