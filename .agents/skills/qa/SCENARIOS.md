# movie-chat — QA Test Scenarios

Comprehensive test coverage map for the movie-chat application.
Updated: 2026-04-19 (post bug-hunt + simplify pass)

---

## Automated Tests (run with `npm test`)

| File | Suite | Count | Status |
|------|-------|-------|--------|
| `__tests__/eztv.test.ts` | TV torrent search + scoring (incl. `&` → `and` normalisation) | 58 | Implemented |
| `__tests__/api-config.test.ts` | Config API CRUD + redaction | 52 | Implemented |
| `__tests__/setup.test.ts` | Setup wizard, probes, middleware | 37 | Implemented |
| `__tests__/middleware.test.ts` | IP extraction, RFC-1918, LAN guard | 33 | Implemented |
| `__tests__/plex.test.ts` | Plex library search + TV seasons (incl. `&` → `and` on subtitle variants) | 31 | Implemented |
| `__tests__/logger.test.ts` | JSONL logger rotation + caps | 27 | Implemented |
| `__tests__/yts.test.ts` | YTS movie torrent search | 27 | Implemented |
| `__tests__/moveFiles.test.ts` | File move + path traversal | 26 | Implemented |
| `__tests__/chat-route.test.ts` | Chat route + ThinkFilter streaming | 25 | Implemented |
| `__tests__/appTorrents.test.ts` | Torrent registry CRUD + pruning | 24 | Implemented |
| `__tests__/diagnostics-bundle.test.ts` | Diagnostics bundle + redaction | 21 | Implemented |
| `__tests__/api-yts-popular.test.ts` | `/api/yts/popular` — defaults, `sort_by` whitelist, numeric clamping, `minimum_year` validation, genre whitelist via `YTS_GENRE_SET`, 502 on upstream failure | 20 | Implemented |
| `__tests__/chat-tags.test.ts` | Tag parsing, stripping, edge cases (incl. `strictYear` round-trip, lazy strip regex) | 20 | Implemented |
| `__tests__/yts-popular.test.ts` | `fetchPopularMovies` — params, mapping, multi-page filtered pagination, exact end-of-scan `totalCount` | 18 | Implemented |
| `__tests__/recUrlParam.test.ts` | `?rec=<json>` parse/validate helper for the popular → chat handoff; `strictYear` preserved only when year is valid | 17 | Implemented |
| `__tests__/autoMove.test.ts` | Auto-move poller logic | 16 | Implemented |
| `__tests__/config.test.ts` | Config read/write/cache | 16 | Implemented |
| `__tests__/api-transmission-add.test.ts` | Transmission add + validation | 13 | Implemented |
| `__tests__/direct-title-lookup.test.ts` | Direct title parser (incl. Unicode title-casing via `\p{Ll}`) | 13 | Implemented |
| `__tests__/media-keys.test.ts` | Media key normalisation (incl. movie-vs-TV separation, optional season suffix on `torrentKey`) | 13 | Implemented |
| `__tests__/openrouter-callback.test.ts` | OAuth exchange + CSRF state (always required) | 13 | Implemented |
| `__tests__/api-files-move.test.ts` | File move API route | 12 | Implemented |
| `__tests__/chat-helpers.test.ts` | Chat helper utilities | 12 | Implemented |
| `__tests__/tmdb.test.ts` | TMDB metadata fetcher | 12 | Implemented |
| `__tests__/api-transmission-control.test.ts` | Transmission pause/resume/cancel | 10 | Implemented |
| `__tests__/chat-client-helpers.test.ts` | Client-side chat helpers | 10 | Implemented |
| `__tests__/api-reviews.test.ts` | Reviews API route | 8 | Implemented |
| `__tests__/api-torrents-search.test.ts` | Torrent search API route | 8 | Implemented |
| `__tests__/chat-history.test.ts` | `hooks/useChatHistory` — age/count trim, load merge vs clobber, missing-timestamp drop | 7 | Implemented |
| `__tests__/chatPrompts.test.ts` | System prompt routing + Gemma detection | 7 | Implemented |
| `__tests__/api-plex-check.test.ts` | Plex check API route | 6 | Implemented |
| `__tests__/request-ip.test.ts` | IP extraction from headers | 6 | Implemented |
| `__tests__/api-transmission-status.test.ts` | Transmission status API route | 5 | Implemented |
| `__tests__/shell-scripts.test.ts` | `install.sh` / `update.sh` contract tests — fresh install, successful update, dirty skip, rollback, any-Node-version proceed | 5 | Implemented |
| `__tests__/rate-limit.test.ts` | Shared `createRateLimiter` — per-IP limit enforcement, independent per-route instances, window reset | 4 | Implemented |

**Total: 35 files / 632 tests** (plus `__e2e__/app-smoke.test.ts` — 4 production HTTP smoke tests via `npm run test:e2e`)

---

## Scenario Index

### 1. Chat / LLM Streaming

**Covered by:** `chat-route.test.ts` (route-level), `chat-tags.test.ts`, `chat-helpers.test.ts`, `chatPrompts.test.ts`, `direct-title-lookup.test.ts`, `chat-client-helpers.test.ts` + manual testing for full E2E streaming

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| C1 | Send a vague request ("something thrilling") | LLM replies with `<recommendation>` tag | Manual |
| C2 | Name a specific known film ("I want to watch Inception") | Card appears with Plex/reviews data | Manual |
| C3 | Name a very recent / unknown film | Tag emitted; TMDB may return no data; `[System]` message fires | Manual |
| C4 | Send a message while streaming | Send button disabled; no duplicate request | Manual |
| C5 | Rate limit: 31 requests within 60 s | 31st request returns 429 | `chat-route.test.ts` |
| C6 | OpenRouter unreachable / bad key | Falls back to Ollama | `chat-route.test.ts` |
| C7 | Ollama also unreachable | Error message shown in chat | Manual |
| C8 | Chat history > 200 messages | Oldest messages trimmed | Manual |
| C9 | Refresh page | History reloaded from localStorage | Manual |
| C10 | "New Chat" button | localStorage cleared; welcome message shown | Manual |
| C11 | Quoted title `"Send Help"` | Direct title lookup skips LLM, emits tag immediately | `direct-title-lookup.test.ts` |
| C12 | Title declaration `the film is titled "X"` | Direct title lookup handles it | `direct-title-lookup.test.ts` |
| C13 | ThinkFilter: `<think>` blocks in Qwen3 output | Think blocks stripped from stream | `chat-route.test.ts` |
| C14 | ThinkFilter: split across chunk boundaries | Correctly buffered and filtered | `chat-route.test.ts` |
| C15 | Gemma model detection | `isGemmaModel` matches case-insensitively | `chatPrompts.test.ts` |
| C16 | System prompt routing | Gemma gets tighter prompt, others get default | `chatPrompts.test.ts` |

**Tag extraction edge cases:**

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| T1 | Canonical tag `<recommendation>{"title":"X","year":2020,"type":"movie"}</recommendation>` | Parsed correctly | `chat-tags.test.ts` |
| T2 | Tag without year field | `year: undefined`; year from TMDB | `chat-tags.test.ts` |
| T3 | Duplicate tag for same title+year | Deduplicated | `chat-tags.test.ts` |
| T4 | Tag with `type:"tv"` | TV card rendered | `chat-tags.test.ts` |
| T5 | Download tag | Triggers `extractDownloadActions` | `chat-tags.test.ts` |
| T6 | Malformed JSON in tag | Gracefully skipped | `chat-tags.test.ts` |
| T7 | Non-string year / non-numeric year | Handled gracefully | `chat-tags.test.ts` |
| T8 | Embedded tags in multiline text | All tags extracted | `chat-tags.test.ts` |
| T9 | Orphaned closing/opening tags | Stripped cleanly | `chat-tags.test.ts` |
| T10 | Partial streaming tags (incomplete close) | Not prematurely stripped | `chat-tags.test.ts` |

---

### 2. Recommendation Card (Movie flow)

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Film in Plex library | "On Plex" badge; no download button; torrent search skipped |
| M2 | Film not in Plex | Download button shown with size + seeders |
| M3 | Film exists on YTS but only 720p | "No 1080p version available" notice |
| M4 | Film not on YTS at all | No download button; torrents section hidden |
| M5 | Click Download | Progress bar appears; DownloadsPanel pops up |
| M6 | After download completes and auto-moves | Card flips to "On Plex" immediately via `forceInLibrary` |
| M6a | 2 min after move | Silent Plex re-check; badge backed by real data |
| M6b | Plex hasn't indexed after 2 min | Retry at 10 min; badge stays via `forceInLibrary` |
| M6c | Plex hasn't indexed after 10 min | Final retry at 60 min |
| M6d | Card unmounted before retry fires | Timeout cancelled — no dangling fetch |
| M7 | Two films same name, different years | Each card has independent download/Plex status |
| M8 | TMDB works; OMDB unreachable | TMDB score only; no RT/IMDb |
| M9 | Both TMDB and OMDB unreachable | Title/year only; no scores/poster |
| M10 | Film has no poster on TMDB | Placeholder shown |

---

### 3. Recommendation Card (TV flow)

| # | Scenario | Expected |
|---|----------|----------|
| TV1 | TV show fully in Plex (all seasons) | "On Plex" badge; no download button |
| TV1a | After season download completes | Retry at 2/10/60 min; `plex.seasons` updates |
| TV2 | TV show partially in Plex | "Missing: SN" badge; season picker shows available |
| TV3 | TV show not in Plex | Season picker with all TMDB seasons |
| TV4 | Select season from picker | Knaben search fires; torrent options shown |
| TV5 | Select "All" seasons | Searches for complete series pack |
| TV6 | Multiple torrent options returned | Quality dropdown shown |
| TV7 | No season packs found | "No season pack available" notice |
| TV8 | TV show with specials (season 0) | Season 0 excluded; correct count |

---

### 4. Download Tracking

| # | Scenario | Expected |
|---|----------|----------|
| D1 | Torrent downloading (status 4) | Progress bar + speed + ETA |
| D2 | Torrent paused (status 0, progress < 100%) | "Paused" label; Resume button |
| D3 | Torrent seeding (status 6, progress 100%) | "Finalizing..." label |
| D4 | Pause button clicked | Torrent pauses |
| D5 | Resume button clicked | Torrent resumes |
| D6 | Cancel button clicked | Confirms; torrent removed; card dismissed |
| D7 | Auto-move completes | "Added to library" card; auto-dismissed |
| D8 | Transmission unreachable 3 polls | Error state; polling stops |
| D9 | External torrent | Shown as "External"; no controls |
| D10–D12 | Panel with 1/3/0 downloads | Summary bar updates; collapses when empty |

---

### 5. File Move (Server-side)

**Covered by:** `moveFiles.test.ts` (26 tests), `api-files-move.test.ts` (12 tests)

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| F1 | Completed movie torrent | Files to `LIBRARY_DIR/<Clean Name>/` | `moveFiles.test.ts` |
| F2 | Completed TV season | Files to `TV_LIBRARY_DIR/<Show>/Season N/` | `moveFiles.test.ts` |
| F3 | TV season=0 (all seasons) | Files to `TV_LIBRARY_DIR/<Show>/` (flat) | `moveFiles.test.ts` |
| F4 | Torrent not 100% complete | Move rejected 400 | `api-files-move.test.ts` |
| F5 | Disallowed extension (.nfo, .jpg) | Skipped | `moveFiles.test.ts` |
| F6 | Allowed subtitle (.srt, .ass, .ssa, .sub) | Copied alongside video | `moveFiles.test.ts` |
| F7 | Symlink to outside library | Refused (path traversal) | `moveFiles.test.ts` |
| F8 | Backslash traversal (`..\\..\\`) | Sanitised | `moveFiles.test.ts` |
| F9 | Dot names (`.`, `..`) | Replaced with `Unknown` | `moveFiles.test.ts` |
| F10 | Plex refresh after move | Fire-and-forget | `moveFiles.test.ts` |

---

### 6. Auto-Move Poller

**Covered by:** `autoMove.test.ts` (16 tests)

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| A1 | Server starts | Poller starts after 60 s delay | `autoMove.test.ts` |
| A2 | Completed app torrent | Moved automatically | `autoMove.test.ts` |
| A3 | Multiple torrents complete | Moved one at a time, 15 s gap | `autoMove.test.ts` |
| A4 | Transmission unreachable | Tick skipped; retried next cycle | `autoMove.test.ts` |
| A5 | 24 h since last cleanup | `pruneAppTorrents()` called | `autoMove.test.ts` |
| A6–A8 | Grace period / legacy pruning | Tested | `appTorrents.test.ts` |

---

### 7. Security & Middleware

**Covered by:** `middleware.test.ts` (33 tests), `request-ip.test.ts` (6 tests), `openrouter-callback.test.ts` (12 tests)

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| SEC1 | External IP blocked | 403 | `middleware.test.ts` |
| SEC2 | RFC-1918 IP allowed | Request proceeds | `middleware.test.ts` |
| SEC3 | `.local` hostname allowed | Request proceeds | `middleware.test.ts` |
| SEC4 | X-Forwarded-For last-hop extraction | Correct IP used | `request-ip.test.ts` |
| SEC5 | ::ffff:-mapped IPv4 | Stripped correctly | `request-ip.test.ts` |
| SEC6 | OAuth: URL state but no cookie | `state_mismatch` error | `openrouter-callback.test.ts` |
| SEC7 | OAuth: cookie but no URL state | `state_mismatch` error | `openrouter-callback.test.ts` |
| SEC8 | OAuth: state values don't match | `state_mismatch` error | `openrouter-callback.test.ts` |
| SEC9 | OAuth: state values match | Key exchanged and saved | `openrouter-callback.test.ts` |
| SEC10 | OAuth: no state at all | `state_mismatch` error (legacy bypass removed) | `openrouter-callback.test.ts` |
| SEC11 | OAuth: missing code param | `no_code` error | `openrouter-callback.test.ts` |
| SEC12 | OAuth: exchange fails | `exchange_failed` error | `openrouter-callback.test.ts` |

---

### 8. Torrent Search — YTS (Movies)

**Covered by:** `yts.test.ts` (26 tests)

| # | Scenario | Expected |
|---|----------|----------|
| Y1 | Exact title match | Returns torrents |
| Y2 | Partial title match | Empty result |
| Y3 | Year within +/-1 | Matched |
| Y4 | Year outside +/-1 | Falls back to year-agnostic |
| Y5 | Only 720p available | `noSuitableQuality: true` |
| Y6 | 1080p available | Returned; 720p filtered |
| Y7–Y9 | Sort: x265 > x264 > bluray > web > seeders | Correct ordering |
| Y10 | Magnet includes all 8 trackers | `tr=` count = 8 |
| Y11 | HTTP error | Empty result, no crash |

---

### 9. Torrent Search — Knaben/EZTV (TV)

**Covered by:** `eztv.test.ts` (58 tests)

Key scenarios: season pack detection, complete-series detection, quality scoring, seeder pool logic, deduplication, fetch error handling.

---

### 10. Plex Library Search

**Covered by:** `plex.test.ts` (29 tests)

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Exact movie match | `found: true` |
| P2 | No Plex token | `found: false` immediately |
| P3 | Title with subtitle (colon) | Matched |
| P4 | Year +/-1 | Matched |
| P5 | Two films same name, diff years | Correct year selected |
| P6 | Single candidate, year gap <= 5 | Matched (Step 2 fallback) |
| P7 | Single candidate, year gap > 5 | Not matched |
| P8 | TV show match | `found: true` with `seasons` array |
| P9 | Specials (season 0) | Excluded from `seasons` |
| P10 | Seasons in wrong order | Returned sorted numerically |
| P11 | Season fetch HTTP error | `found: true, seasons: []` |

---

### 11. Config & Diagnostics

**Covered by:** `config.test.ts` (16 tests), `api-config.test.ts` (52 tests), `diagnostics-bundle.test.ts` (21 tests)

Key scenarios: readConfig/writeConfig/cfg caching, sensitive field masking, diagnostics token redaction, bundle token validation, log file inclusion.

---

### 12. Settings & Setup Pages

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Open `/settings` | All current config values pre-filled |
| S2 | Click "Test" next to each service | Shows connectivity status |
| S3 | Save valid config | Saved to `config.local.json`; success toast |
| S4 | Service test: Plex unreachable | Shows error with URL hint |
| S5 | Service test: OpenRouter bad key | 401 error shown |
| S6 | OpenRouter OAuth connect button | Redirects through `/api/openrouter/auth` with CSRF state |

---

### 13. PWA / Mobile

| # | Scenario | Expected |
|---|----------|----------|
| PWA1 | Add to Home Screen (iOS/Android) | App icon; standalone mode |
| PWA2 | HTTP on local IP | `crypto.randomUUID` fallback; IDs still generated |
| PWA3 | Safe area insets (iPhone notch) | Input bar respects `env(safe-area-inset-*)` |

---

### 14. Popular Movies Browse (`/popular`)

**Covered by:** `yts-popular.test.ts`, `api-yts-popular.test.ts`, `recUrlParam.test.ts` + manual for interactive flows

| # | Scenario | Expected | Automated? |
|---|----------|----------|-----------|
| P1 | Open `/popular` — default tab | Most Downloaded active, 20 cards, genre + minimum-year dropdowns visible | Manual |
| P2 | Click flame icon in header from `/` | Navigates to `/popular` without losing configured cookie | Manual |
| P3 | Select genre → results update | Debounced 300ms; grid re-renders; pagination resets to page 1 | Manual |
| P4 | Select minimum-year (e.g. 2023+) | Server scans raw YTS pages in 50-item chunks until it can fill the requested filtered page; `totalCount` is exact at end-of-scan or a bounded estimate otherwise | `yts-popular.test.ts` |
| P5 | Pagination Next/Prev | Updates `page` query param; disables at boundaries; skeleton during load | Manual |
| P6 | Switch to Newest tab | Genre + year dropdowns disappear; single sort-order dropdown appears defaulted to "Sort by year" | Manual |
| P7 | Newest + Sort by year | Returns 2026/2027 releases at the top | Manual |
| P8 | Newest + Sort by popularity | All cards have year ≥ currentYear − 3 (implicit `NEWEST_MIN_YEAR`); no all-time classics leak through | Manual + `yts-popular.test.ts` |
| P9 | Switch tabs back to Most Downloaded | Genre reset to "All genres", minYear reset to "Any year", newestSort reset to `year` | Manual |
| P10 | Click a card | Navigates to `/?rec=<json>`; chat opens with recommendation card pre-loaded | Manual + `recUrlParam.test.ts` |
| P11 | YTS upstream failure | `/api/yts/popular` returns 502; panel shows error + "Try again" button | `api-yts-popular.test.ts` |
| P12 | `sort_by=bogus` in URL | Route falls back to `download_count` | `api-yts-popular.test.ts` |
| P13 | `limit=999` in URL | Route clamps to 50 (YTS max) | `api-yts-popular.test.ts` |
| P14 | `minimum_year=1700` in URL | Route ignores (below 1900 floor) | `api-yts-popular.test.ts` |
| P15 | Card hover | Poster scales slightly; 6-line synopsis overlay fades in | Manual |
| P16 | Broken poster URL | `onError` flips to placeholder SVG | Manual |
| P17 | IMDb rating = 0 | Rating badge is not rendered | Manual |
| P18 | Cache TTL (4h) | Repeated requests within 4h hit Next fetch cache | Manual |

---

## Running the Tests

```bash
npm test                        # run all 623 unit/integration tests once
npm run test:watch              # watch mode
npm run test:coverage           # with coverage thresholds
npm run test:e2e                # built-app HTTP smoke tests
npm run ci                      # full CI mirror (lint → coverage → build → e2e)
npx vitest run __tests__/yts.test.ts  # single file
```

---

## Coverage Gaps (Manual Testing Required)

| Area | Reason | Testing approach |
|------|---------|-----------------|
| Full E2E streaming | Requires live LLM | Manual + integration |
| Transmission RPC | Requires live Transmission | Manual with real Transmission |
| React component rendering | `use client` + browser APIs | Manual; consider Playwright E2E |
| Auto-move E2E | Requires time + Transmission + filesystem | Manual integration test |
| OAuth E2E | Requires live OpenRouter | Manual (unit tests cover CSRF + exchange logic) |
