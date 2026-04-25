# Changelog

All notable changes to movie-chat are documented here.
Versioning follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
- **MAJOR** — breaking changes
- **MINOR** — new features, backwards-compatible
- **PATCH** — bug fixes and small improvements

---

## [Unreleased]

### Added
- **Popular movies browse page** (`/popular`, `app/popular/page.tsx`, `components/PopularMoviesPanel.tsx`, `components/PopularMovieCard.tsx`, `lib/yts.ts` → `fetchPopularMovies()`, `app/api/yts/popular/route.ts`, `types/index.ts` → `YtsMovieEntry`, `YtsPopularOptions`, `YtsPopularSortBy`, `YtsPopularResult`): Browse YTS's 1080p catalog with tab-specific controls — **Most Downloaded** exposes genre + release-year-range dropdowns, **Newest** exposes a sort-order dropdown (*Sort by year* default / *Sort by popularity* via active seeders / *Sort by rating* via IMDb score) and is hard-scoped to the last 3 years so non-year sorts stay recent. Click a poster to land in chat with the title pre-loaded on a recommendation card via `?rec=<json>`. Flame icon in `app/page.tsx` header links into the page
- **CI-shaped verification pipeline** (`package.json`, `.github/workflows/test.yml`, `vitest.config.ts`, `vitest.e2e.config.ts`, `__e2e__/app-smoke.test.ts`, `.eslintrc.json`, `.eslintignore`): Added non-interactive ESLint, enforced global coverage thresholds, built-app HTTP smoke tests, and a local `npm run ci` command that mirrors the GitHub Actions PR gate
- **Explicit Node runtime policy** (`.nvmrc`, `.node-version`, `.github/workflows/test.yml`): The repo pins local development to Node 24 LTS and verifies Node 20 and 24 in CI. Any Node version is accepted at runtime — the install/setup/update scripts report the version but do not gate on it

### Security
- **OAuth CSRF state always required** (`app/api/openrouter/callback/route.ts`): Removed backwards-compat bypass that allowed requests without any state to skip CSRF validation. Both URL state and cookie state are now mandatory — requests missing either are rejected with `state_mismatch`
- **Diskspace path-prefix bypass** (`app/api/files/diskspace/route.ts`, `__tests__/api-diskspace.test.ts`): The allowlist check used bare `startsWith()` against the configured library dirs, so a request for `/media/library-private` would be authorised by a configured `libraryDir=/media/lib`. Now `path.resolve()`s both sides and checks for an exact match or a true child (`base + path.sep`) before probing `statfsSync`. New test file covers the regression plus the rest of the allowlist contract

### Changed
- **Newest tab sort options corrected and expanded** (`components/PopularMoviesPanel.tsx`): The "Sort by popularity" option was backed by `rating` (IMDb score), not popularity. Renamed it to "Sort by rating"; added a genuine "Sort by popularity" option backed by `sort_by=seeds` (active seeders as a real-time demand proxy, distinct from all-time download count). The `seeds` sort value was already whitelisted in the API route and included in `YtsPopularSortBy`
- **Popular movies panel: tab row and filter row separated** (`components/PopularMoviesPanel.tsx`): The tab buttons (Most Downloaded / Newest) and their respective filter/sort controls were on a single horizontally-scrolling row. Split into two distinct rows so the boundary is always visible regardless of screen width
- **Most Downloaded year filter replaced with closed 5-year ranges** (`components/PopularMoviesPanel.tsx`, `lib/yts.ts`, `app/api/yts/popular/route.ts`, `types/index.ts`): The year dropdown now shows 7 fixed ranges — "2025 and later", 2020–2024, 2015–2019, 2010–2014, 2005–2009, 2000–2004, and "Before 2000" — plus "Any year" as the default. The top bucket always starts at the nearest multiple-of-5 at or below the current year. `maximumYear` support was added throughout the stack so closed ranges send both `minimum_year` and `maximum_year` to the API
- **YTS popular-list cache TTL** (`lib/yts.ts`, `POPULAR_CACHE_SECONDS`): Bumped 1800s → 14400s (4h). `/popular` was previously refetching every 30 min for no user benefit. Next.js fetch cache invalidates naturally on `npm run build`, so no migration is needed
- **Removed per-card 1080p badge and non-1080p dimming** (`components/PopularMovieCard.tsx`): YTS always carries a 1080p variant in practice, so the badge was redundant noise
- **`fetchPopularMovies()` pagination model** (`lib/yts.ts`, `components/PopularMoviesPanel.tsx`): `minimumYear` filtering now accumulates filtered matches across raw YTS pages instead of filtering one sampled page in isolation. The panel also aborts stale loads and clamps the visible "Showing X-Y of Z" range to the actual rendered card count
- **Torrent/download bookkeeping identity** (`lib/mediaKeys.ts`, `hooks/usePendingTorrents.ts`, `hooks/useDownloadTrigger.ts`, `hooks/useAppDownloads.ts`, `components/RecommendationCard.tsx`, `components/DownloadsPanel.tsx`, `components/DownloadTracker.tsx`, `components/chat/ChatMessageList.tsx`, `hooks/useRecommendationCardState.ts`): Pending and completed app downloads are now keyed by `mediaType + title + year`, so same-title movie/TV pairs no longer collide
- **`install.sh` auto-installs Node.js when missing** (`install.sh`): instead of aborting with a manual-install message, the installer now attempts to install Node.js via Homebrew on macOS (`brew install node`) and via the NodeSource setup script on Linux (`apt-get` / `dnf` / `yum`, `sudo` required). Aborts with a clear error if the OS is unsupported or the package manager isn't available

### Removed
- **Electron desktop app dropped** (deleted `electron/`, `electron-builder.yml`; `package.json` lost `electron:dev` / `electron:build` / `release` scripts and `electron` / `electron-builder` / `electron-updater` deps; `docs/index.html`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `NEXT_STEPS.md` scrubbed of `.dmg` / desktop-app references; stale `electron/main.js` comment in `lib/logger.ts` replaced; stale `output: 'standalone'` rationale in `next.config.mjs` updated): The `.dmg` build path had accumulated structural friction — no Apple Developer signing meant every user hit Gatekeeper, Homebrew-based first-run auto-setup across arbitrary Mac configurations was a brittle testing matrix with no CI coverage, and the single-maintainer test footprint couldn't reliably catch regressions before users. The bare-metal `install.sh` one-liner was already the actually-tested install path and is now the only supported route. `app/setup/page.tsx` stays — still used as a first-run redirect target for bare-metal installs. `MOVIE_CHAT_LOG_DIR` and `CONFIG_PATH` env-var overrides remain in `lib/logger.ts` / `lib/config.ts` (harmless for pm2 deployments, useful for reverse-proxied setups)

### Fixed
- **Transparent strip on poster hover** (`components/PopularMovieCard.tsx`): The `group-hover:scale-105` zoom leaked outside the poster container, producing a visible strip between the image and the title bar. Added `overflow-hidden` to the inner poster `div` to clip the scaled image correctly
- **Node-version guard removed entirely** (deleted `scripts/check-node-version.mjs`, `package.json`, `install.sh`, `setup.sh`, `update.sh`, `__tests__/shell-scripts.test.ts`): the previous guard `process.exit(1)`'d on anything other than Node 20 or 24, blocking Node 22 LTS users outright and refusing to let Node 25+ users even run `npm run dev`. The motivation was a single `next build` hang observed on Node 25.9 during CI. That hang was re-investigated and could not be reproduced — a fresh `npm run ci` on Node 25.9.0 completes in ~32s with all 623 tests green. The guard script has been deleted, `package.json` no longer prefixes every entrypoint with `npm run node:check`, and the install/setup/update scripts simply report the detected Node version without branching. CI still pins to Node 20 and 24
- **Vitest scanning stale `.claude/worktrees/` copies of the test tree** (`vitest.config.ts`, `vitest.e2e.config.ts`): `npm test` and `npm run test:e2e` now exclude `.claude/**`, so a lingering Claude Code worktree doesn't double-run the suite and report spurious failures from an old branch state
- **Chat history clobbered URL-injected recommendations on mount** (`hooks/useChatHistory.ts`): The localStorage load effect called `setMessages(valid)` non-functionally, racing with the `ChatInterface` effect that reads `?rec=` from the URL — landing on `/?rec=<json>` from the popular page could lose the card. The loader now uses a functional updater that preserves any messages already present other than the initial welcome placeholder
- **Next.js 15 prerender warning on `/`** (`app/page.tsx`): Wrapped `<ChatInterface />` in `<Suspense fallback={null}>` — required by `useSearchParams()` used to read `?rec=`
- **`/popular` remake handoff drift** (`components/PopularMovieCard.tsx`, `lib/recUrlParam.ts`): Popular-card clicks now preserve `strictYear: true` through `?rec=` parsing, so clicking a concrete remake title stays locked to the intended movie instead of drifting to another same-title release later in the movie flow
- **Install/setup/update paths did not notice the runtime Node major** (`install.sh`, `setup.sh`, `update.sh`): These scripts now detect and report the Node major up-front without gating — any Node version is accepted
- **Recommendation card refetch storm after refactor** (`components/chat/ChatMessageList.tsx`): Inline `onResolveRecommendation` and `isDownloading` arrows were recreated on every `ChatInterface` render (each keystroke and streaming token), churning `useRecommendationCardState`'s effect dep array and refiring the Plex / reviews / torrent fetches. Extracted `ChatMessageItem` and `RecommendationSlot` sub-components so the wrapper closures are memoised per-slot with stable deps — cards stop flickering and availability state stops thrashing mid-stream
- **TV shows with `&` in title missed on Knaben** (`lib/eztv.ts`): `norm()` now converts `&` → ' and ' before stripping non-alphanumerics, so "Law & Order" matches releases titled "Law.and.Order". Brings TV search in line with movie (`lib/yts.ts`) and Plex (`lib/plex.ts`) normalisation
- **Plex subtitle matches failing when titles contain `&`** (`lib/plex.ts`): `titleMatches()` subtitle-variant check now compares normalised forms, so "Fast & Furious" correctly matches a Plex entry titled "Fast and Furious: Tokyo Drift". `originalTitle` is also checked for subtitle variants, not just `title`
- **`strictYear` dropped from LLM-emitted tags** (`lib/chatTags.ts`): `extractRecommendations` now propagates `strictYear: true` from the parsed JSON payload, and `recommendationTag` serialises it back out. Previously a model emitting `{"title":"X","year":2020,"strictYear":true}` lost the flag between streaming and rendering, causing fuzzy year matches to slip past the user's lock
- **Strict-year param gate inconsistent between initial and re-check** (`hooks/useRecommendationCardState.ts`): Post-move Plex re-check now builds the URL the same way as the initial check — no redundant `type === 'movie'` gate baked into `strictYearParam`
- **Diagnostics bundle cfg() envVar misuse** (`app/api/diagnostics/bundle/route.ts`): Token lookup previously passed `''` as the env-var name. Now uses `MOVIE_CHAT_DIAGNOSTICS_TOKEN`, allowing ops to override via environment in a reverse-proxied deployment without hand-editing `config.local.json`
- **Unicode titles skipped in direct-title lookup** (`lib/directTitleLookup.ts`): `capitalizeWord` and `maybeTitleCase` now use Unicode property escapes (`\p{Ll}`) instead of ASCII-only `[a-z]`, so quoted titles like "über" and "élite" get title-cased correctly instead of passed through unchanged
- **Same-title movie vs TV key collision** (`lib/mediaKeys.ts`): `recommendationKey` now includes `type` so a movie and a TV show sharing a title+year (e.g. "The Office" 2001 film vs the UK series) render as two distinct cards instead of colliding on React's `key`
- **Pending torrent / forced-library collision for same-title movie vs TV pairs** (`lib/mediaKeys.ts`, `hooks/usePendingTorrents.ts`, `hooks/useDownloadTrigger.ts`, `hooks/useAppDownloads.ts`): The runtime torrent/download key now includes media type, so app-tracked download state cannot bleed between a movie and TV show that share the same title and year
- **Canceled app download could still show "Added to library"** (`components/DownloadTracker.tsx`, `hooks/useAppDownloads.ts`): `DownloadTracker` now aborts in-flight status polls, suppresses the moved-state path after a user-initiated cancel, and only reports a moved item with its media type attached
- **Share modal protocol/cache lifecycle holes** (`components/ShareButton.tsx`): QR links now preserve HTTPS origins, avoid stale cache reuse across origin changes, cancel async QR generation on close/unmount, and quietly handle clipboard write failures
- **Silent auto-update exit in a new updater guard** (`update.sh`): Replaced a bare `[ "$AUTO" -eq 0 ] && ...` check with explicit `if` blocks so the updater does not trip `set -e` and exit silently in auto mode
- **Malformed `<recommendation>` tags with `>` inside JSON leaked through strip** (`lib/chatTags.ts`): `stripChatActionTags` now uses lazy `[\s\S]*?` inside the self-closing-tag regex instead of `[^>]*`, so a title containing `>` (e.g. `{"title":"Foo -> Bar"}`) can't break the strip step and leak raw JSON into the rendered message
- **Test route status code inconsistency** (`app/api/ollama/test/route.ts`, `app/api/openrouter/test/route.ts`): Error responses now return proper HTTP status codes (400 for config errors, 502 for upstream/connection errors) instead of always returning 200, consistent with all other test routes
- **TypeScript strict check** (`__tests__/shell-scripts.test.ts`): Fixed `ProcessEnv` type mismatch causing `tsc --noEmit` to fail on the shell-script test env objects
- **Setup status ignored env vars** (`app/api/setup/status/route.ts`, `__tests__/setup.test.ts`): Route now resolves `openRouterApiKey` / `ollamaModel` via `cfg()` instead of `readConfig()`, so env-var-only installs (`OPENROUTER_API_KEY` or `OLLAMA_MODEL` set without `config.local.json`) are correctly treated as complete and stop being redirected to `/setup`
- **`diagnosticsToken` env var name mismatch** (`app/api/config/route.ts`, `__tests__/api-config.test.ts`): The Settings-facing config endpoint looked up the token via `DIAGNOSTICS_TOKEN`, while `/api/diagnostics/bundle` reads `MOVIE_CHAT_DIAGNOSTICS_TOKEN`. An operator setting only the env var saw a blank token in the UI while the endpoint still worked — fixed by aligning both call sites on the same var name
- **Quoted titles ending in `?` rejected by direct-title shortcut** (`lib/directTitleLookup.ts`, `__tests__/direct-title-lookup.test.ts`): `"What's Up, Doc?"` and `find me "Who Framed Roger Rabbit?"` now pass through the deterministic lookup instead of falling back to the LLM. Unquoted question-shaped input is still rejected. Added an internal `allowQuestionMark` option gated on the quoted call sites
- **HTTP-Referer header dynamic/brittle** (`app/api/chat/route.ts`, `app/api/openrouter/test/route.ts`): Both OpenRouter calls now send `HTTP-Referer: https://github.com/nookied/movie-chat` — a stable project identifier — instead of the previous dynamic value that depended on request state

### Refactor
- **Shared version helper** (`lib/version.ts`, `app/api/config/route.ts`, `app/api/diagnostics/bundle/route.ts`): Extracted the duplicate `getVersion()` function that read `package.json` from `process.cwd()` into a single module. Intentionally not cached — tests override `fs` mocks between calls, and the file is only hit a handful of times per session

### Simplify pass
- **Shared YTS genre whitelist** (`lib/ytsGenres.ts`, `components/PopularMoviesPanel.tsx`, `app/api/yts/popular/route.ts`): Deduped the 20-entry genre list that previously existed in both the panel UI and the API validator. Route imports `YTS_GENRE_SET`, UI imports `YTS_GENRES`. Prevents drift when YTS adds or removes a genre
- **Shared rate-limiter factory** (`lib/rateLimit.ts`, `app/api/chat/route.ts`, `app/api/yts/popular/route.ts`, `__tests__/rate-limit.test.ts`): Extracted the per-IP rate-limiter into a single factory so chat and popular browse share the same implementation. Added a soft ceiling (10k tracked IPs) that forces a prune under burst and evicts oldest insertion-order entries, so the map can't grow unbounded under a unique-IP flood
- **`torrentKey` merged** (`lib/mediaKeys.ts`, `hooks/usePendingTorrents.ts`, `hooks/useDownloadTrigger.ts`): Collapsed the redundant `pendingTorrentKey`/`torrentKey` pair into one `torrentKey(title, year?, mediaType?, season?)`. The `season` suffix behaviour is identical to before and is only appended when `mediaType === 'tv'` and a season is provided
- **`useDownloadTrigger` short-circuit** (`hooks/useDownloadTrigger.ts`): Exact-key lookup now runs first; the fallback Map scan only runs on a miss, instead of unconditionally building and filtering an `Array.from(entries)` every invocation. Three fallback tiers collapsed into one latest-match loop
- **ShareButton dead-branch removal** (`components/ShareButton.tsx`): Removed `controller.signal.reason !== 'timeout'` guards — the reason was never set to `'timeout'` anywhere, the branches were dead
- **`update.sh` ROLLBACK_LOG scoped to `rollback()`** (`update.sh`): Moved the variable into the function where it is used instead of module scope

### Tests
- Unit/integration coverage expanded again: `__tests__/yts-popular.test.ts` now covers multi-page filtered pagination and exact end-of-scan totals, `__tests__/media-keys.test.ts` covers movie-vs-TV torrent-key separation, and `__tests__/recUrlParam.test.ts` covers `strictYear` preservation through the `?rec=` handoff. `__e2e__/app-smoke.test.ts` boots the built standalone app and smoke-tests core routes over real HTTP. `__tests__/rate-limit.test.ts` covers the new shared limiter including the soft-cap eviction path. New `__tests__/api-diskspace.test.ts` covers the path-allowlist hardening (5 tests). Additions to `api-config.test.ts`, `setup.test.ts`, and `direct-title-lookup.test.ts` cover the new env-var-name / env-var-fallback / quoted-question-mark fixes. 36 test files / 644 unit+integration tests at this commit
- `__tests__/shell-scripts.test.ts` now verifies that `update.sh --auto` proceeds on any Node version without gating (5 tests total)

### Docs
- **Maintainer doc sync after codex co-review** (`CLAUDE.md`, `.agents/skills/qa/SCENARIOS.md`, `HANDOFF.md`): `CLAUDE.md` now mirrors `AGENTS.md` (added `lib/mediaKeys.ts` / `lib/recUrlParam.ts` entries, refreshed `fetchPopularMovies` description to match the accumulated-pagination model, updated Node 20/24 runtime policy and CI/e2e guidance). `SCENARIOS.md` updated to 34 files / 623 tests with corrected per-file counts, rewrote the Popular-movies P4 row, and removed the legacy SEC10 "OAuth without state is allowed" row. `HANDOFF.md` records the review pass and marks the previously-flagged `npm run ci` hang resolved by the Node-version guard
- **Planned work consolidated into `NEXT_STEPS.md`**: merged `REFACTOR_RECOMMENDATIONS.md` (trimmed to the two still-open phases — chat route modularization and setup/settings consolidation) and `YTS_POPULAR_MOVIES_PLAN.md` into a single forward-looking doc. After the `/popular` feature shipped, the YTS section was collapsed to a "shipped" pointer plus small follow-ups. Added a "Callback identity" entry to the refactor risk notes, carrying forward the lesson from the `ChatMessageList` regression. `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md`, `README.md`, and the handoff feedback memory updated to point at the consolidated file
- **Handoff + maintainer docs refreshed for the regression sweep** (`HANDOFF.md`, `AGENTS.md`, `README.md`, `NEXT_STEPS.md`): Docs now describe the real `/popular` pagination model, type-aware torrent/download keys, share/download async cleanup, and the CI-safe lint + coverage + E2E workflow

---

## [2.2.0] — 2026-04-16

### Security
- **OAuth CSRF protection** (`app/api/openrouter/auth/route.ts`, `app/api/openrouter/callback/route.ts`): OAuth flow now generates a random state token stored in an httpOnly cookie; the callback verifies the state with `crypto.timingSafeEqual` before exchanging the code. Redirects use a fixed `APP_ORIGIN` instead of reflecting the client-controlled Host header, preventing OAuth code theft via URL hijacking
- **Body size limit + JSON error handling** (`lib/requestBody.ts`): All POST routes now reject requests over 64 KB (413) and return 400 on malformed JSON instead of a 500 with stack trace
- **IP spoofing hardened** (`lib/requestIp.ts`): LAN guard and rate limiter now use the last hop of `X-Forwarded-For` instead of the first, preventing client-controlled header bypass
- **Atomic config writes** (`lib/config.ts`): `writeConfig` now uses write-to-temp + rename so concurrent saves cannot corrupt `config.local.json`
- **Path traversal guard on file delete** (`lib/moveFiles.ts`): `assertWithinDir` check added before `fs.rm` prevents a maliciously-named torrent from wiping the download directory
- **Middleware SSRF fix** (`middleware.ts`): Internal setup-status URL now uses a fixed `http://127.0.0.1:<PORT>` base instead of reflecting the client-supplied Host header
- **Input validation** (`app/api/transmission/add/route.ts`): `mediaType`, `season`, `title` (max 500 chars), and `year` (1888–3000) are now validated and rejected with 400 on bad input

### Fixed
- **Stream reader leak** (`app/api/chat/route.ts`): Upstream LLM stream reader is now cancelled in a `finally` block when the client disconnects, preventing wasted tokens and bandwidth
- **Stale closure in DownloadTracker** (`components/DownloadTracker.tsx`): `fetchStatus` callback now includes all referenced props in its dependency array, fixing stale `torrentName`/`year`/callback captures
- **Inline function identity** (`components/DownloadsPanel.tsx`): Extracted `DownloadTrackerWrapper` with `useCallback`-memoized `onComplete` to prevent poll timer resets on every parent render
- **File move data loss** (`lib/moveFiles.ts`): On `unlink` failure the rollback no longer deletes the already-copied destination — the copy is kept and the error is logged
- **Ambiguous movie titles** (`lib/tmdb.ts`, `hooks/useRecommendationCardState.ts`, `components/recommendation/MovieMatchChooser.tsx`, `lib/yts.ts`, `lib/plex.ts`): Bare movie lookups like `Dragonfly` now pause on a chooser when TMDB finds multiple exact-title matches, then lock the rest of the movie flow to the selected canonical title/year so metadata, Plex checks, and torrent downloads cannot drift across remakes or same-name releases

### Changed
- **Update script hardened** (`update.sh`): Added PID-based lock file to prevent concurrent cron runs, `set -euo pipefail` for strict error handling, reliable tracked-file detection with stash option, safe handling when `git pull` is blocked by local edits, rollback on pull/install/build failure, and post-restart health check polling `/api/setup/status`
- **Install/setup scripts hardened** (`install.sh`, `setup.sh`): Existing checkout reuse now validates the repo and refuses dirty tracked changes instead of failing mid-install; pm2 startup capture no longer aborts when pm2 prints an unexpected format
- **Maintainer docs** (`README.md`, `AGENTS.md`): Documentation now explicitly calls out `install.sh` / `setup.sh` / `update.sh` as operational scripts, documents regular test coverage for `install.sh` / `update.sh`, and notes that update-related work should always review `update.sh`

### Refactored
- **Shared request utilities** (`lib/requestBody.ts`, `lib/requestIp.ts`, `lib/randomId.ts`): Extracted into standalone modules used by all routes
- **Media key utilities** (`lib/mediaKeys.ts`): Title normalisation, torrent/download key generation, and capped-set helpers centralised in one pure-function module
- **System messages** (`lib/chat/systemMessages.ts`): All `[System]` message strings consolidated out of `ChatInterface.tsx`
- **Chat composition** (`components/ChatInterface.tsx`, `hooks/`): `ChatInterface` is now a ~120-line composition root; all streaming/download/history logic lives in focused hooks with AbortController cleanup
- **Recommendation card composition** (`components/RecommendationCard.tsx`, `hooks/useRecommendationCardState.ts`, `components/recommendation/`): Card is now ~120-line layout/wiring; fetch logic and UI sections are fully separated

### Tests
- 30 test files / 556 tests at release — added shell-script contract coverage for `install.sh` and `update.sh` (fresh install, successful update, dirty-worktree auto-update skip, rollback on build failure); previous suites remain green

---

## [2.1.0] — 2026-04-16

### Added
- **Direct title shortcut** (`lib/directTitleLookup.ts`, `app/api/chat/route.ts`): Quoted titles and explicit title declarations (e.g. `"Send Help"`, `the film is titled "Send Help"`) now skip provider latency and immediately emit the `<recommendation>` tag
- **Handoff note** (`HANDOFF.md`): Added a concise operator/developer handoff summary with verification, deployment, and follow-up notes for this prompt/title-lookup pass
- **Refactor recommendation** (`REFACTOR_RECOMMENDATIONS.md`): Added a phased high-value refactor plan covering the chat state machine, recommendation flow split, chat route modularization, and config workflow consolidation

### Changed
- **System prompts** (`lib/chatPrompts.ts`): Both prompt families now explicitly cover quoted titles, title declarations, and stricter exact-title passthrough behaviour
- **Few-shot seed** (`app/api/chat/route.ts`): Seed conversation now includes a quoted-title lookup so smaller models see the desired pattern before the real chat starts
- **README** (`README.md`): User docs now mention the fast exact-title path and updated chat architecture

### Refactored
- **Chat tag parsing** (`lib/chatTags.ts`, `components/ChatInterface.tsx`, `components/Message.tsx`): Shared `<recommendation>` / `<download>` parsing, stripping, and tag serialization extracted into one utility module
- **Chat interface composition** (`components/ChatInterface.tsx`, `hooks/useChatHistory.ts`, `hooks/useChatSendMessage.ts`, `hooks/useAppDownloads.ts`, `hooks/usePendingTorrents.ts`, `hooks/useDownloadTrigger.ts`, `components/chat/`): The chat UI now composes focused hooks/components for history persistence, streaming, download orchestration, and message rendering instead of keeping one large client-side state machine
- **Recommendation card composition** (`components/RecommendationCard.tsx`, `hooks/useRecommendationCardState.ts`, `components/recommendation/`): Recommendation fetching/retry logic was extracted into a dedicated hook and split into focused movie/TV/status UI sections without changing movie-vs-TV behaviour
- **Settings disk usage UI** (`app/settings/page.tsx`): Repeated disk-space fetch/render logic extracted into a reusable hook and summary component
- **Refactor planning docs** (`REFACTOR_RECOMMENDATIONS.md`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`): Maintainer docs now point to a recommended next-pass refactor order instead of leaving the hotspots implicit

### Fixed
- **Unmounted chat updates** (`hooks/useChatSendMessage.ts`): Streaming chat requests, fallback requests, and retry timers are now aborted on unmount so the rewritten chat flow does not keep updating dead state
- **Stale TV season responses** (`hooks/useRecommendationCardState.ts`): Rapid season changes now cancel/ignore older torrent lookups so an earlier response cannot overwrite a newer selection
- **Post-move/request cleanup** (`hooks/useRecommendationCardState.ts`, `hooks/useAppDownloads.ts`): Recheck fetches and download-sync polling now clean up in-flight requests on teardown, reducing leak risk in the refactored client flow
- **TV download tracking drift** (`lib/appTorrents.ts`, `app/api/transmission/add/route.ts`, `hooks/useAppDownloads.ts`, `lib/mediaKeys.ts`): App-managed torrents now persist canonical title metadata so TV downloads keep matching their recommendation cards and post-move "On Plex" forcing works reliably
- **Stuck download CTA state** (`hooks/useDownloadTrigger.ts`, `hooks/useRecommendationCardState.ts`): Movie/TV cards now reset their local "Starting…" state when a download is skipped or fails instead of staying disabled indefinitely

### Tests
- Current validation after the refactor/debug pass: 25 test files / 437 tests passing, plus a successful production build

---

## [2.0.1] — 2026-04-07

### Changed
- **Clarification threshold** (`lib/chatPrompts.ts`): AI now only asks a follow-up question when the request gives it nothing to work with — any attribute (actor type, mood, genre, era) is enough to just pick something
- **Follow-up handling** (`lib/chatPrompts.ts`): AI now answers questions about a film it already recommended from its own knowledge, instead of deflecting or pivoting to a different title
- **Spinner freeze fix** (`components/ChatInterface.tsx`): Silent tag-retry no longer fires when the model's response ends with `?` or starts with "To give you / To get you" — prevents hang when Gemma rephrases a clarifying question

### Security
- Patched 5 vulnerabilities via `npm audit fix` (`brace-expansion`, `flatted`, `next`, `picomatch`, `vite`)
- Upgraded Electron v35 → v41.2.0 (resolves 17 CVEs)

### Added
- **Version label in Settings** (`app/settings/page.tsx`, `app/api/config/route.ts`): Current app version (e.g. `v2.0.1`) displayed bottom-right next to the Save settings button

### Fixed
- **NaN year in Plex check** (`app/api/plex/check/route.ts`): Non-numeric `year` query param no longer passed as `NaN` to Plex library search — now silently dropped
- **NaN/invalid season in torrent search** (`app/api/torrents/search/route.ts`): Non-numeric or negative `season` values now return a 400 error instead of being forwarded to the TV search
- **Diskspace path whitelist** (`app/api/files/diskspace/route.ts`): Endpoint now validates that the requested path starts with a configured library or download directory — prevents arbitrary filesystem probing
- **TypeScript errors in test files**: Fixed vitest v4 API incompatibility — `vi.fn<[Args], Return>()` updated to `vi.fn<(arg: T) => R>()`; all 189 tests pass, zero type errors
- **Share button icon**: Swapped globe icon for standard share icon (three-dot network graph) matching iOS/Android/macOS convention

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
- **Landing page** (`docs/index.html`): GitHub Pages site at nookied.github.io/movie-chat — download button auto-resolves to latest `.dmg`, app screenshots, responsive design.
- **Setup test suite** (`__tests__/setup.test.ts`): 37 tests covering config completeness, probe logic, middleware exemptions, landing page integrity, and ShareButton URL construction. Total: 189 tests.
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
