# Changelog

All notable changes to movie-chat are documented here.
Versioning follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
- **MAJOR** — breaking changes
- **MINOR** — new features, backwards-compatible
- **PATCH** — bug fixes and small improvements

---

## [2.0.0] — 2026-04-04

### Added
- **Desktop app (Electron)** (`electron/`): macOS `.dmg` packaging — download, install, open. No Terminal required.
- **Silent auto-setup** (`electron/setup.js`): First launch automatically installs Homebrew, Plex Media Server, Transmission, and Ollama via `brew install`. Progress screen shows each step with time estimates.
- **Setup wizard** (`app/setup/page.tsx`): 3-step post-install wizard — summary of what was installed, Plex token entry, optional TMDB/OMDB keys. All steps skippable except LLM.
- **OpenRouter OAuth** (`app/api/openrouter/callback/route.ts`): One-click "Sign in to OpenRouter" button instead of manual API key entry.
- **Service auto-detection** (`app/api/setup/detect/route.ts`): Probes localhost for Ollama, Plex, and Transmission on startup — auto-fills URLs in wizard.
- **Setup redirect** (`middleware.ts`): Redirects to `/setup` when config is incomplete; cookie-cached for 24h to avoid per-request overhead.
- **Share with family** (`components/ShareButton.tsx`): QR code modal in app header — scan with phone to open Movie Chat on any device on the same Wi-Fi network.
- **Hostname API** (`app/api/setup/hostname/route.ts`): Returns machine hostname for `.local` mDNS URL in share modal.
- **Shared UI components** (`components/ui/`): Extracted StatusIcon, Section, Field, Toggle, ModelSelectField from settings page for reuse in setup wizard.
- **Electron auto-updater** (`electron/main.js`): Desktop app checks GitHub Releases every 4 hours and prompts users to install updates.
- **Config tests** (`__tests__/config.test.ts`): 10 new tests covering readConfig, writeConfig, cfg priority chain, caching, and error handling.

### Changed
- **Standalone output** (`next.config.mjs`): Added `output: 'standalone'` for Electron packaging — non-breaking for bare-metal installs.
- **Configurable CONFIG_PATH** (`lib/config.ts`): Config file location configurable via `CONFIG_PATH` env var — enables Electron to store config in `~/Library/Application Support/`.
- **Transmission install** (`electron/setup.js`): Installs GUI app (cask) with RPC enabled, instead of headless daemon — user has a visual download manager.

### Fixed
- **Process leak** (`electron/main.js`): Server process reference cleared on exit before respawn, preventing zombie processes.
- **Server respawn loop** (`electron/main.js`): Added exponential backoff (1s→2s→4s→...) with 5-attempt cap — prevents infinite crash loops.
- **Ollama orphaned process** (`electron/setup.js`): Ollama serve process tracked and killed on app quit.
- **Ollama startup timeout** (`electron/setup.js`): Increased port wait from 20s to 30s, separated port check from timeout logic to prevent race.
- **ShareButton race condition** (`components/ShareButton.tsx`): Merged two competing useEffects into one — URL is now deterministic, hostname cached per session.
- **Hostname API error handling** (`app/api/setup/hostname/route.ts`): Graceful fallback on `os.hostname()` failure.
- **IPC error handling** (`electron/preload.js`): Callbacks wrapped in try-catch to prevent renderer crashes.
- **OAuth callback** (`app/api/openrouter/callback/route.ts`): Added error handling for malformed JSON response from OpenRouter.
- **Setup wizard Suspense** (`app/setup/page.tsx`): Added fallback to prevent blank screen during hydration.
- **Service detection** (`app/api/setup/detect/route.ts`): Parallel candidate probing via `Promise.any` — saves ~2s per unreachable host.
- **Config saves batched** (`app/setup/page.tsx`): Plex and metadata steps now save all fields in one request instead of sequential writes.
- **Update script** (`update.sh`): Full install for build, then prune dev deps post-build to save ~360MB on server.

---

## [1.6.0] — 2026-04-03

### Added
- **Few-shot conversation seeding** (`app/api/chat/route.ts`): A synthetic Arrival exchange is prepended to every LLM conversation — small models mimic the tag format they see in context, dramatically improving `<recommendation>` tag compliance
- **Silent tag retry** (`components/ChatInterface.tsx`): If the LLM mentions a title without a `<recommendation>` tag, a background follow-up nudge extracts the tag — the card appears a moment later with no visible retry to the user
- **Prescriptive system messages** (`components/ChatInterface.tsx`): `[System]` info messages now include the exact phrasing the model should use (e.g. `Ask the user: "Want me to download Title?"`), removing 6 response-pattern rules from the system prompt

### Changed
- **System prompt** (`app/api/chat/route.ts`): `[System] messages` section reduced from 6-bullet decision tree to a single line — the instruction is now embedded in each info message, not taught as rules
- **Download guard** (`app/api/chat/route.ts`): `<download>` tag now requires both a `[System]` availability message AND user confirmation — prevents hallucinated downloads
- **Reviews resilience** (`app/api/reviews/route.ts`): Switched from `Promise.all` to `Promise.allSettled` — if TMDB or OMDB is down, the other provider's data still renders

### Refactored
- **Plex title matching** (`lib/plex.ts`): Extracted duplicated `titleMatches()` from `searchLibrary()` and `searchTvLibrary()` into a shared module-level function
- **Cache TTL constant** (`lib/tmdb.ts`, `lib/omdb.ts`): Replaced magic number `28800` with named `METADATA_CACHE_SECONDS` constant
- **TV torrent construction** (`components/RecommendationCard.tsx`): Extracted 3 identical `TorrentOption` builders into shared `toSyntheticTorrent()` helper

---

## [1.5.0] — 2026-04-03

### Changed
- **System prompt** (`app/api/chat/route.ts`): Rewritten for token efficiency (~40% reduction, ~480 → ~280 words) — sections merged, redundant prose removed, wrong-response lists replaced with positive examples
- **Phrase-like titles**: LLM now correctly handles film titles that look like questions or phrases (e.g. "How to Make a Killing") — no longer treats them as general questions or triggers safety disclaimers for titles containing words like kill/die/murder
- **Hallucinated Plex state**: LLM now explicitly forbidden from claiming a title is in the library before emitting the `<recommendation>` tag; the app performs the actual lookup
- **"The title is X" pattern**: Added few-shot example so the LLM recognises explicit title declarations and always emits the tag

---

## [1.4.0] — 2026-03-10

### Fixed
- **YTS subtitle fallback** (`lib/yts.ts`): When YTS drops the subtitle from a film name (e.g. "Alien: Romulus" → "Alien Romulus"), now falls back to a base title search so the torrent is still found
- **False-positive Downloading label** (`components/RecommendationCard.tsx`): Films with the same title but different years no longer show a spurious "Downloading" badge — year is now compared alongside title
- **YTS false negatives** (`lib/yts.ts`): Increased result limit on title-only searches to avoid missing valid torrents

### Changed
- **System prompt** (`app/api/chat/route.ts`): Strengthened instructions to prevent the LLM from substituting similar-sounding films when the requested title isn't found

---

## [1.3.0] — 2026-03-08

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

## [1.2.1] — 2026-03-07

### Added
- **CLAUDE.md** — project instructions for AI-assisted development (architecture, debugging guidelines, flow separation)

### Fixed
- **Year info pull** (`lib/tmdb.ts`): Fixed year extraction from TMDB metadata so recommendation cards and torrent searches use the correct release year

---

## [1.2.0] — 2026-03-06

### Added
- **Background file mover** (`lib/autoMove.ts`): Server-side poller that moves completed downloads to Plex even when the browser is closed

### Fixed
- **Auto-move poller** (`lib/autoMove.ts`): Fixed background poller failing to move completed torrents under certain Transmission states
- **Download tracker** (`components/DownloadTracker.tsx`): Multiple fixes to progress display and status detection
- **LLM tagging** (`app/api/chat/route.ts`): Fixed recommendation/download tag parsing for edge cases; hotfixed system prompt for more reliable structured output
- **Chat route** (`app/api/chat/route.ts`): Patched streaming response handling
- **Memory overload** (`app/api/chat/route.ts`): Fixed unbounded context growth that could exhaust memory on long conversations

---

## [1.1.0] — 2026-03-05

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
- **Vitest test suite**: 62 tests covering torrent scoring, pack detection, and Plex check logic

### Changed
- **pm2 mode** (`ecosystem.config.js`): Switched from fork to production mode for better stability
- **TV torrent scoring** (`lib/eztv.ts`): Removed codec bonus; added size bonus and multi-season filter for more reliable season pack selection
- **TMDB fallback** (`lib/tmdb.ts`): Falls back to year-free search when year-qualified TMDB query returns nothing

### Fixed
- **TV torrent picker** (`components/RecommendationCard.tsx`): Filters out 4K torrents; replaced chip buttons with inline dropdown for cleaner UI
- **isCompletePack false positive** (`lib/eztv.ts`): Fixed regex that incorrectly identified partial packs as complete season packs
- **Downloads panel** (`components/DownloadsPanel.tsx`): Collapsed by default; fixed tsconfig target for compatibility

### Security
- Patched 4 high-severity CVEs; upgraded Next.js 14 → 15.5.12

---

## [1.0.0] — 2026-03-04

### Added
- **AI chat interface** (`components/ChatInterface.tsx`): Conversational UI powered by OpenRouter (cloud) with automatic Ollama fallback (local)
- **Recommendation cards** (`components/RecommendationCard.tsx`): Each AI suggestion renders as a card with poster, ratings (TMDB, IMDb, Rotten Tomatoes via OMDB), Plex availability badge, and download button
- **Plex library check** (`lib/plex.ts`): Real-time check against Plex Media Server for every recommendation
- **YTS torrent search** (`lib/yts.ts`): 1080p movie torrent search via YTS API
- **Transmission integration** (`lib/transmission.ts`): Add magnet links, poll progress, pause/resume/cancel via Transmission RPC
- **File move to Plex** (`lib/moveFiles.ts`): Copies completed downloads into organized Plex library folders and triggers a library scan
- **Download tracker** (`components/DownloadTracker.tsx`): Real-time progress bar with pause/resume/cancel controls, polling every 5 seconds
- **Settings page** (`app/settings/page.tsx`): Configure all API keys and service URLs from the browser, saved to `config.local.json`
- **TMDB metadata** (`lib/tmdb.ts`): Posters, overviews, cast, director, runtime
- **OMDB ratings** (`lib/omdb.ts`): IMDb score and Rotten Tomatoes percentage
- **Torrent registry** (`lib/appTorrents.ts`): Tracks which torrents the app added — enables cross-device visibility and prevents controlling external torrents
- **Local network middleware** (`middleware.ts`): Blocks non-LAN traffic (RFC-1918 + `.local` mDNS)
- **Rate limiting** (`app/api/chat/route.ts`): 30 req/min per IP on the chat endpoint
- Next.js 15, React 18, TypeScript (strict), Tailwind CSS
- Config chain: `config.local.json` → `process.env` → defaults

---

## [0.1.0] — 2026-03-02

### Added
- Initial Next.js project scaffolding with TypeScript and Tailwind CSS
