# movie-chat — QA Test Scenarios

Comprehensive test coverage map for the movie-chat application.
Updated: 2026-03-08

---

## Automated Tests (run with `npm test`)

| File | Suite | Count | Status |
|------|-------|-------|--------|
| `__tests__/eztv.test.ts` | TV torrent search logic | 79 | ✅ Implemented |
| `__tests__/tmdb.test.ts` | TMDB metadata fetcher | 18 | ✅ Implemented |
| `__tests__/yts.test.ts` | YTS movie torrent search | 28 | ✅ Implemented |
| `__tests__/appTorrents.test.ts` | Torrent registry CRUD + pruning | 22 | ✅ Implemented |
| `__tests__/plex.test.ts` | Plex library search | 24 | ✅ Implemented |

---

## Scenario Index

### 1. Chat / LLM Streaming

**Covered by:** Manual testing (streaming SSE cannot be unit-tested without a real LLM)

| # | Scenario | Expected |
|---|----------|----------|
| C1 | Send a vague request ("something thrilling") | LLM replies with at least one `<recommendation>` tag embedded |
| C2 | Name a specific known film ("I want to watch Inception") | Card appears with Plex/reviews data loaded |
| C3 | Name a very recent / unknown film ("Mufasa: The Lion King") | Tag is still emitted; TMDB may return no data; onNotFound fires a [System] message |
| C4 | Send a message while streaming is in progress | Send button is disabled; no duplicate request |
| C5 | Rate limit: send 31 requests within 60 s | 31st request returns 429 |
| C6 | OpenRouter unreachable / bad key | Falls back to Ollama; banner or error message appears |
| C7 | Ollama also unreachable | Error message shown in chat |
| C8 | Chat history > 200 messages | Oldest messages trimmed; conversation continues |
| C9 | Refresh page | Chat history reloaded from localStorage |
| C10 | "New Chat" button | localStorage cleared; welcome message shown |

**Tag extraction edge cases (helper functions — not exported; test via integration):**

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Canonical tag `<recommendation>{"title":"X","year":2020,"type":"movie"}</recommendation>` | Parsed correctly |
| T2 | Self-closing malformed `<recommendation{"title":"X","year":2020,"type":"movie"}>` | Parsed correctly |
| T3 | Duplicate tag for same title+year | Deduplicated; only one card |
| T4 | Tag without year field | `year: undefined`; card shows year from TMDB |
| T5 | Tag with `type:"tv"` | TV card rendered with season picker |
| T6 | Download tag `<download>{"title":"X","year":2020}</download>` | Triggers `extractDownloadActions`; auto-download attempted |

---

### 2. Recommendation Card (Movie flow)

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Film in Plex library | "On Plex ✓" badge; no download button; torrent search skipped |
| M2 | Film not in Plex | Download button shown with size + seeders |
| M3 | Film exists on YTS but only 720p | "No 1080p version available" notice |
| M4 | Film not on YTS at all | No download button; torrents section hidden |
| M5 | Click Download | Progress bar appears; DownloadsPanel pops up |
| M6 | After download completes and auto-moves | Card flips to "On Plex ✓" immediately (optimistic) via `forceInLibrary` |
| M6a | 2 min after move | Silent Plex re-check fires; if Plex has indexed it, badge is now backed by real Plex data |
| M6b | Plex hasn't indexed after 2 min | Retry at 10 min; badge stays "On Plex ✓" via `forceInLibrary` |
| M6c | Plex hasn't indexed after 10 min | Final retry at 60 min |
| M6d | Card unmounted before retry fires | Timeout cancelled — no dangling fetch |
| M7 | Two films with same name, different years (e.g. Beauty and the Beast 1991 & 2017) | Each card shows its own download/Plex status independently |
| M8 | TMDB finds film; OMDB is unreachable | Card shows TMDB score only; no RT/IMDb scores |
| M9 | Both TMDB and OMDB are unreachable | Card shows title/year only; no scores/poster |
| M10 | Film has no poster on TMDB | Placeholder shown; card still renders |

---

### 3. Recommendation Card (TV flow)

| # | Scenario | Expected |
|---|----------|----------|
| TV1 | TV show fully in Plex (all seasons) | "On Plex ✓" badge; no download button |
| TV1a | After season download completes | Retry check at 2/10/60 min; `plex.seasons` updates; badge reflects new season in library |
| TV2 | TV show partially in Plex (e.g. S1 missing) | "Missing: S1" badge; season picker shows available seasons |
| TV3 | TV show not in Plex | Season picker shown with all TMDB seasons |
| TV4 | Select season from picker | Knaben search fires for that season; torrent options shown |
| TV5 | Select "All" seasons | Searches for complete series pack |
| TV6 | Multiple torrent options returned | Quality dropdown shown; user can select alternative |
| TV7 | No season packs found (episodes only) | "No season pack available" notice |
| TV8 | TV show with specials (season 0) in Plex | Season 0 not counted; correct season count shown |

---

### 4. Download Tracking

| # | Scenario | Expected |
|---|----------|----------|
| D1 | Torrent downloading (status 4) | Progress bar + speed + ETA visible |
| D2 | Torrent paused (status 0, progress < 100%) | "Paused" label; Resume button shown |
| D3 | Torrent seeding (status 6, progress 100%) | "Finalizing…" label; no speed/ETA |
| D4 | Pause button clicked | Torrent pauses; Resume button replaces Pause |
| D5 | Resume button clicked | Torrent resumes downloading |
| D6 | Cancel button clicked | Confirms; torrent removed from Transmission; card dismissed |
| D7 | Auto-move completes (torrent removed by server) | "Added to library" card shown; auto-dismissed after 3 s |
| D8 | Transmission unreachable for 3 consecutive polls | Error state shown; polling stops |
| D9 | External torrent (not added via app) visible in Transmission | Shown as "External" but no Pause/Cancel controls |
| D10 | Downloads panel with 1 download | Panel shows torrent name in summary bar |
| D11 | Downloads panel with 3 downloads | "3 downloads" label in summary bar |
| D12 | All downloads complete | Panel collapses automatically |

---

### 5. File Move (Server-side)

| # | Scenario | Expected |
|---|----------|----------|
| F1 | Completed movie torrent | Files moved to `LIBRARY_DIR/<Clean Name>/`; non-video files skipped |
| F2 | Completed TV season torrent | Files moved to `TV_LIBRARY_DIR/<Show>/Season N/` |
| F3 | TV season=0 (all seasons) | Files moved to `TV_LIBRARY_DIR/<Show>/` (flat) |
| F4 | Torrent not 100% complete | Move rejected with 400 error |
| F5 | Move attempted while already in progress | "already in progress" error swallowed by autoMove |
| F6 | File with disallowed extension (e.g. .nfo, .jpg) | Skipped; not copied |
| F7 | File with allowed subtitle extension (.srt) | Copied alongside video |
| F8 | Source file is a symlink to outside library | Move refused (path traversal defence) |
| F9 | Destination folder already contains the file | File skipped (logged as "skipped") |
| F10 | Plex refresh triggered after move | Fire-and-forget; move success not blocked by Plex failure |

---

### 6. Auto-Move Poller

| # | Scenario | Expected |
|---|----------|----------|
| A1 | Server starts | Poller starts after 60 s delay |
| A2 | Completed app torrent detected | Moved automatically; no browser needed |
| A3 | Multiple torrents complete simultaneously | Moved one at a time with 15 s gap |
| A4 | Transmission unreachable | Tick skipped; retried next 60 s cycle |
| A5 | 24 h elapsed since last cleanup | `pruneAppTorrents()` called; stale entries removed |
| A6 | Torrent registered < 1 h ago, not in Transmission | Grace period protects it from pruning |
| A7 | Legacy entry (no registeredAt), not in Transmission | Pruned on next daily cleanup |
| A8 | External torrent (not app-registered) completes | Ignored by poller |

---

### 7. Torrent Search — YTS (Movies)

**Covered by:** `__tests__/yts.test.ts`

| # | Scenario | Expected |
|---|----------|----------|
| Y1 | Exact title match | Returns torrents |
| Y2 | Partial title match prevented | Empty result |
| Y3 | Year within ±1 | Matched |
| Y4 | Year outside ±1 | Falls back to year-agnostic |
| Y5 | Only 720p available | `noSuitableQuality: true` |
| Y6 | 1080p available | Returned; 720p filtered out |
| Y7 | Sort: x265 > x264 | x265 first in results |
| Y8 | Sort: bluray > web | bluray first within same codec |
| Y9 | Sort: seeders tiebreaker | Higher seeders first |
| Y10 | Magnet includes all 8 trackers | `tr=` count = 8 |
| Y11 | HTTP error | Empty result, no crash |

---

### 8. Torrent Search — Knaben/EZTV (TV)

**Covered by:** `__tests__/eztv.test.ts` (79 tests)

Key scenarios already tested: season pack detection, complete-series detection, quality scoring, seeder pool logic, deduplication, fetch error handling.

---

### 9. Plex Library Search

**Covered by:** `__tests__/plex.test.ts`

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Exact movie match | `found: true` |
| P2 | No Plex token | `found: false` immediately |
| P3 | Title with subtitle (colon match) | Matched |
| P4 | Year ±1 match | Matched |
| P5 | Two films same name, different years | Correct year selected |
| P6 | Single candidate, year gap ≤5 | Matched (Step 2 fallback) |
| P7 | Single candidate, year gap > 5 | Not matched (prevents wrong-version cross-match) |
| P8 | TV show match | `found: true` with `seasons` array |
| P9 | Specials (season index 0) | Excluded from `seasons` array |
| P10 | Seasons in wrong order from Plex | Returned sorted numerically |
| P11 | Season fetch HTTP error | `found: true, seasons: []` |

---

### 10. App Torrent Registry

**Covered by:** `__tests__/appTorrents.test.ts`

| # | Scenario | Expected |
|---|----------|----------|
| R1 | Register and look up | Found |
| R2 | Unregister | No longer found |
| R3 | Old number[] format | Loaded transparently |
| R4 | Corrupted JSON | Empty registry, no crash |
| R5 | pruneAppTorrents — active torrent | Protected, never pruned |
| R6 | pruneAppTorrents — old entry (>1h) | Pruned |
| R7 | pruneAppTorrents — recent entry (<1h) | Grace period respected |
| R8 | pruneAppTorrents — legacy (no registeredAt) | Pruned if inactive |
| R9 | Write is atomic (temp file + rename) | writeFileSync + renameSync both called |
| R10 | registeredAt timestamp stored | Within ±100ms of real time |

---

### 11. TMDB Metadata

**Covered by:** `__tests__/tmdb.test.ts` (18 tests)

Key scenarios: year fallback, partial data when detail fetch fails, season count excludes specials and unaired seasons.

---

### 12. Settings Page

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Open `/settings` | All current config values pre-filled |
| S2 | Click "Test" next to each service | Shows ✅ or ❌ connectivity status |
| S3 | Save valid config | Saved to `config.local.json`; success toast |
| S4 | Service test: Plex unreachable | Shows error with URL hint |
| S5 | Service test: OpenRouter bad key | 401 error shown |

---

### 13. PWA / Mobile

| # | Scenario | Expected |
|---|----------|----------|
| PWA1 | Add to Home Screen on iOS | App icon shown; launches in standalone mode |
| PWA2 | Add to Home Screen on Android | App icon shown; launches in standalone mode |
| PWA3 | Access over local network HTTP (not HTTPS) | `crypto.randomUUID` falls back gracefully; IDs still generated |
| PWA4 | Safe area insets (iPhone notch) | Input bar and downloads panel respect `env(safe-area-inset-*)` |

---

## Running the Tests

```bash
# Run all tests once
npm test

# Run in watch mode (re-runs on file save)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run a specific test file
npx vitest run __tests__/yts.test.ts
npx vitest run __tests__/plex.test.ts
npx vitest run __tests__/appTorrents.test.ts
```

---

## Coverage Gaps (Manual Testing Required)

The following areas cannot be covered by unit tests without significant infrastructure:

| Area | Reason | Testing approach |
|------|---------|-----------------|
| `/api/chat` streaming | Requires live LLM | Manual + integration |
| `/api/transmission/*` | Requires live Transmission instance | Manual with real Transmission |
| `/api/files/move` | Requires filesystem + Transmission | Manual with test torrents |
| React components | 'use client' + browser APIs | Manual; consider Playwright E2E |
| `extractRecommendations` helper | Private function in ChatInterface.tsx | Extract to `lib/chatHelpers.ts` to enable unit testing |
| `cleanTorrentName` helper | Private function in ChatInterface.tsx | Extract to `lib/chatHelpers.ts` to enable unit testing |
| Auto-move poller end-to-end | Requires time + Transmission + filesystem | Manual integration test |

### Recommended next step
Extract the pure helper functions from `ChatInterface.tsx` into `lib/chatHelpers.ts` and export them, so they can be covered by unit tests. Functions to move: `extractRecommendations`, `extractDownloadActions`, `cleanTorrentName`, `normTitle`, `torrentKey`.
