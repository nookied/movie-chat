# Handoff

## Latest pass (2026-04-19 — regression sweep, testing expansion, handoff prep)

Closed the biggest regressions found in the post-Claude sweep, expanded automated verification into a real CI-shaped pipeline, and aligned the maintainer docs with the shipped behavior. The final wrap-up verification on this machine landed in a mixed state: `npm run lint` and `npm test` passed on the finished tree, while a fresh `npm run ci` rerun cleared lint + coverage and then hung inside `next build` under local Node `v25.9.0` before producing `.next/BUILD_ID`.

### What changed

1. **Automated testing + CI now covers the full release path**
   - Replaced `next lint` with CI-safe `eslint . --ext .js,.mjs,.ts,.tsx` so lint is non-interactive locally and in GitHub Actions.
   - Added enforced Vitest global coverage thresholds in `vitest.config.ts`.
   - Added `vitest.e2e.config.ts` + `__e2e__/app-smoke.test.ts` so we boot the built standalone app and hit core routes over real HTTP.
   - Added `npm run ci` as the local mirror of GitHub Actions and updated `.github/workflows/test.yml` to run `lint` → `test:coverage` → `build` → `test:e2e`.
   - CI now runs on both Node 20 and Node 24, while `.nvmrc`, `.node-version`, and `package.json#engines` pin the repo to tested LTS majors instead of following unsupported current releases.
2. **`/popular` browse flow is now pagination-correct and race-safe**
   - `lib/yts.ts` no longer filters a single raw YTS page and hopes the math works out. When `minimumYear` is set, it now accumulates filtered results across raw YTS pages until it can fill the requested filtered page, then returns an exact `totalCount` if it reached the end or a bounded estimate otherwise.
   - `components/PopularMoviesPanel.tsx` now routes debounce, pagination, and retry through one request path with abort + request-id guards, so stale responses can no longer overwrite newer tab/filter/page state.
   - The visible "Showing X-Y of Z" range is clamped to the actual rendered card count.
3. **Popular-card handoff now preserves exact movie identity**
   - `components/PopularMovieCard.tsx` adds `strictYear: true` to the `?rec=` payload.
   - `lib/recUrlParam.ts` preserves that flag only when the year is valid, so remake titles clicked from `/popular` stay locked to the intended movie all the way through chat, Plex checks, and YTS search.
4. **Download bookkeeping no longer collides across movie/TV name matches**
   - `lib/mediaKeys.ts` now keys torrent/download state by `mediaType + title + year`, not just `title + year`.
   - `usePendingTorrents`, `useDownloadTrigger`, `useAppDownloads`, `DownloadTracker`, `RecommendationCard`, `DownloadsPanel`, `ChatMessageList`, and `useRecommendationCardState` were updated so a movie and TV show sharing title/year do not steal each other’s pending/downloaded state.
5. **Stale async work was tightened up in the two remaining weak spots**
   - `components/DownloadTracker.tsx` now aborts in-flight status polls and suppresses the "Added to library" path after a user-initiated cancel, so a stale "not found" response cannot misclassify a canceled torrent as moved.
   - `components/ShareButton.tsx` now preserves protocol/origin correctly, avoids stale cached QR state across origin changes, cancels the QR promise chain on close/unmount, and handles clipboard write failures quietly.
6. **Regression coverage was added for the risky fixes**
   - `__tests__/yts-popular.test.ts` covers multi-page filtered pagination and exact filtered `totalCount` at end-of-scan.
   - `__tests__/media-keys.test.ts` covers movie-vs-TV torrent key separation.
   - `__tests__/recUrlParam.test.ts` covers `strictYear` preservation through the `?rec=` handoff.
7. **Node/runtime policy is now explicit and operationally enforced**
   - `install.sh` and `setup.sh` now require Node 20 LTS or 24 LTS, with 24 recommended.
   - `update.sh` now checks Node before any git/npm work and fails fast on unsupported majors. Verified locally on this machine: `bash update.sh --auto` under Node `25.9.0` exits immediately with a clear skip message instead of hanging in `next build`.
   - `scripts/check-node-version.mjs` now gates the local npm entrypoints (`build`, `dev`, `start`, `ci`, Electron, and E2E) so unsupported runtimes fail fast before invoking Next.js.
   - While landing that guard, the shell test suite caught a real `set -e` footgun in `update.sh`; the updater now uses explicit `if` blocks instead of bare `[ ... ] && ...` checks in auto-mode branches.

### Files to know about

| File | Why |
|---|---|
| `package.json` | `lint`, `test:e2e`, and `ci` scripts; local CI mirror |
| `.eslintrc.json`, `.eslintignore` | ESLint is now explicit and CI-safe |
| `.github/workflows/test.yml` | Full PR/push pipeline |
| `.nvmrc`, `.node-version`, `package.json` | Tested Node support policy (`24` default, `20` also supported) |
| `scripts/check-node-version.mjs` | Fast-fails unsupported local runtimes before `next build` / `next start` / Electron |
| `vitest.config.ts`, `vitest.e2e.config.ts` | Coverage thresholds + E2E runner split |
| `__e2e__/app-smoke.test.ts` | Built-app HTTP smoke tests |
| `install.sh`, `setup.sh`, `update.sh` | LTS-only Node guards; updater fails fast before git/build work on unsupported majors |
| `lib/yts.ts` | Correct filtered `/popular` pagination |
| `components/PopularMoviesPanel.tsx` | Abort-safe browse loading + clamped range display |
| `components/PopularMovieCard.tsx`, `lib/recUrlParam.ts` | `strictYear` handoff fix |
| `lib/mediaKeys.ts` and download hooks/components | Type-aware torrent/download identity |
| `components/DownloadTracker.tsx` | Cancel-safe polling |
| `components/ShareButton.tsx` | Share-link lifecycle hardening |

### Validation

```bash
npm run lint     # pass
npm test         # pass (34 files / 623 tests)
npm run ci       # lint + coverage passed; hung in `next build` before `.next/BUILD_ID`
bash update.sh --auto  # under local Node 25.9.0: fast-fails with "unsupported Node.js" skip message
```

### Remaining follow-ups worth watching

- Investigate the local `next build` hang observed during the final `npm run ci` rerun (Node `v25.9.0`, no `.next/BUILD_ID`, stalled for >10 minutes after coverage)
- `SEC-1` diagnostics token exposure via `GET /api/config`
- `CR-4` `ThinkFilter` dropping buffered content on unclosed `<think>`
- Torrent-search result caching in `lib/yts.ts` / `lib/eztv.ts`

## Previous pass (2026-04-19 — popular-movies browse UX)

Shipped the `/popular` YTS browse feature with tab-specific controls, cleaned up a recommendation-injection race in chat history, and raised the YTS popular-list cache TTL to 4h. All 618 tests pass, production build is clean.

### What changed

1. **Popular Movies browse tab** (`/popular`) splits controls by sort mode:
   - **Most Downloaded** (default): genre + minimum-release-year filter dropdowns.
   - **Newest**: a single sort-order dropdown — *Sort by year* (default) or *Sort by popularity*. Both variants are hard-scoped to the last 3 years via `NEWEST_MIN_YEAR = currentYear - 3`, applied server-side as `minimum_year`. This stops *Sort by popularity* from surfacing all-time high-rated concerts / kids titles from any decade, which defeats the point of a "Newest" tab. The scope is deliberately not user-tunable — add a control only if someone actually asks for it.
   - Switching tabs resets `genre`, `minYear`, and `newestSort` so stale state from the other tab can't linger.
2. **Card chrome trimmed** (`components/PopularMovieCard.tsx`): removed the per-card `1080p` quality badge and the `opacity-60` dim state for non-1080p entries — YTS always has a 1080p variant in practice, so the badge was redundant noise.
3. **YTS popular-list cache TTL** bumped 1800s → 14400s (4h) in `lib/yts.ts` (`POPULAR_CACHE_SECONDS`). `/popular` was previously refetching every 30 min for no user benefit. Next.js fetch cache invalidates naturally on `npm run build`, so no migration is needed.
4. **`minimumYear` filter groundwork** (`lib/yts.ts`): YTS API has no year filter, so the initial ship over-fetched and client-side filtered. The follow-up pass above replaced the single-page hit-rate estimate with accumulated filtered pagination across raw pages.
5. **Chat history race fix** (`hooks/useChatHistory.ts`): the localStorage load effect was clobbering any URL-injected recommendation because it called `setMessages(valid)` non-functionally on mount, racing with the `ChatInterface` effect that reads `?rec=` from the URL. Now the loader uses a functional updater that preserves any messages already present (other than the welcome placeholder).
6. **Suspense wrap on ChatInterface** (`app/page.tsx`): required by `useSearchParams()` — the previous setup was silently building but prerender-warning.
7. **Tests**: +12 added for the new `minimumYear` groundwork, cache TTL, and API-route param clamping; later expanded again by the regression/CI pass above.

### Files touched

| File | Why |
|---|---|
| `components/PopularMoviesPanel.tsx` | Tab-specific controls; `NEWEST_MIN_YEAR` scoping; filter reset on tab switch |
| `components/PopularMovieCard.tsx` | Removed 1080p badge + dimming |
| `lib/yts.ts` | `POPULAR_CACHE_SECONDS` 1800→14400; `minimumYear` filter + over-fetch; `YTS_MAX_LIMIT` constant |
| `app/api/yts/popular/route.ts` | Parse + validate `minimum_year` query param |
| `types/index.ts` | `minimumYear?: number` on `YtsPopularOptions`; `YtsPopularSortBy` includes `'year'` and `'rating'` |
| `hooks/useChatHistory.ts` | Load effect now merges vs clobbers |
| `app/page.tsx` | `<Suspense fallback={null}>` around `ChatInterface` |
| `__tests__/yts-popular.test.ts` | Over-fetch + TTL + year-filter coverage |
| `__tests__/api-yts-popular.test.ts` | `minimum_year` param clamping |

### Validation

```
npm test              # 34 files / 618 tests passing
npm run build         # clean production build; /popular is 2.79 kB static
```

### Dev-mode footgun worth knowing about

Rapid edits while `npm run dev` is running can corrupt the webpack dev build so the CSS chunk isn't served (the back-arrow SVG renders at its natural 24×24 size scaled up because `w-5 h-5` silently no-ops) or `pages-manifest.json` goes missing and every route 500s. Fix: stop the dev server, `rm -rf .next`, restart. Does not affect `npm run build` or production.

### Migration notes for existing users (v2.x → now)

- `localStorage['movie-chat-history']` schema unchanged — safe.
- YTS cache TTL bump has no runtime effect; `npm run build` clears the Next fetch cache.
- `minimum_rating` param is still parsed by `/api/yts/popular` (kept on the route for forward-compat) but the UI no longer surfaces it — the Newest tab now exposes sort order, not a rating filter. No URL-param breakage.
- `config.local.json` schema unchanged.

## Previous pass (2026-04-19 — post-refactor bug hunt)

This session reviewed the codebase looking for regressions introduced by the v2.1.0 / v2.2.0 refactors (chat split into hooks, recommendation card split into a hook + sub-components) and landed nine fixes in priority order.

### Fixes landed (priority order)

1. **CRITICAL — Recommendation card refetch storm** (`components/chat/ChatMessageList.tsx`). Inline `(next) => onResolveRecommendation(message.id, index, next)` and `(season) => isRecommendationDownloading(recommendation, season)` arrows were new objects on every `ChatInterface` render (each keystroke, each streaming token), cascading into `useRecommendationCardState`'s main effect deps and refiring Plex / reviews / torrent fetches. Extracted `ChatMessageItem` (per-message) and `RecommendationSlot` (per-recommendation) so the wrappers are memoised with stable deps. This was the likely root cause of several "flickering / slow / stuck-loading" reports.
2. **HIGH — TV shows with `&` missed on Knaben** (`lib/eztv.ts`). `norm()` now converts `&` → ' and ' before stripping non-alphanumerics (matches `lib/yts.ts` and `lib/plex.ts`).
3. **HIGH — Plex subtitle match failed on `&`** (`lib/plex.ts`). `titleMatches()` subtitle-variant `startsWith` check now normalises both sides and also covers `originalTitle`.
4. **MEDIUM — `strictYear` dropped from LLM tags** (`lib/chatTags.ts`). `extractRecommendations` carries `strictYear: true` from the JSON payload; `recommendationTag` serialises it.
5. **MEDIUM — Inconsistent strict-year param between initial and post-move Plex check** (`hooks/useRecommendationCardState.ts`). Post-move re-check now builds its URL the same way as the first check.
6. **MEDIUM — Diagnostics bundle `cfg()` envVar** (`app/api/diagnostics/bundle/route.ts`). Uses `MOVIE_CHAT_DIAGNOSTICS_TOKEN` instead of `''`, so the token can be overridden by env in proxied deployments.
7. **MEDIUM — Unicode titles in direct-title lookup** (`lib/directTitleLookup.ts`). `capitalizeWord` and `maybeTitleCase` use `\p{Ll}` instead of `[a-z]`, so "über" / "élite" title-case properly.
8. **LOW — Movie/TV key collision** (`lib/mediaKeys.ts`). `recommendationKey` includes `type` so same-title same-year movie vs TV shows don't share a React key.
9. **LOW — Self-closing-tag strip regex hardened** (`lib/chatTags.ts`). `stripChatActionTags` uses lazy `[\s\S]*?` instead of `[^>]*` for malformed payloads, so JSON containing `>` can't break the strip.

## Previous pass (2026-04-16 — code review, bug fixes, documentation audit)

This session did a full codebase review after several merges and refactors, fixed three issues found, updated all documentation to match current code, and ran a simplify/quality pass on the fixes.

## Key changes

### Security fixes

- **OAuth CSRF + URL hijack** (`app/api/openrouter/auth/route.ts`, `app/api/openrouter/callback/route.ts`): New auth initiation route generates a random state token stored in an httpOnly cookie. The callback verifies the state with `crypto.timingSafeEqual`. All redirects use a fixed `APP_ORIGIN` (env `INTERNAL_APP_ORIGIN` or `http://127.0.0.1:<PORT>`) instead of reflecting the client Host header.
- **Body size limit + JSON error handling** (`lib/requestBody.ts`): All POST routes reject requests over 64 KB (413) and return 400 on malformed JSON.
- **IP spoofing hardened** (`lib/requestIp.ts`): LAN guard and rate limiter use the last hop of `X-Forwarded-For` instead of the first.
- **Atomic config writes** (`lib/config.ts`): `writeConfig` uses write-to-temp + `renameSync` to prevent corruption.
- **Path traversal guard** (`lib/moveFiles.ts`): `assertWithinDir` check before `fs.rm` prevents a maliciously-named torrent from wiping the download directory. Symlinks are rejected.
- **Middleware SSRF fix** (`middleware.ts`): Internal setup-status URL uses a fixed origin instead of reflecting `req.url`.
- **Input validation** (`app/api/transmission/add/route.ts`): `mediaType` enum, `season` non-negative integer, `title` length limit (500), `year` range (1888–3000).

### Bug fixes

- **Stream reader leak** (`app/api/chat/route.ts`): Added `reader.cancel()` in `finally` block so upstream LLM streams are closed when the client disconnects.
- **Stale closure in DownloadTracker** (`components/DownloadTracker.tsx`): `fetchStatus` now lists all referenced props in its deps array.
- **Inline function identity** (`components/DownloadsPanel.tsx`): Extracted `DownloadTrackerWrapper` with `useCallback`-memoized `onComplete` to stop poll timer resets.
- **File move data loss** (`lib/moveFiles.ts`): On `unlink` failure the rollback no longer deletes the destination copy.

### Update script hardened (`update.sh`)

- PID-based lock file (`.update.lock`) prevents concurrent cron runs; stale locks auto-cleaned
- `set -euo pipefail` for strict error handling
- Dirty-worktree detection with optional stash
- Rollback on pull/install/build failure: `git reset --hard` + rebuild + pm2 restart
- Post-restart health check: polls `/api/setup/status` up to 5 times

### Movie disambiguation & strictYear (from v2.2.0)

- Bare movie titles with multiple TMDB matches show a `MovieMatchChooser` instead of picking arbitrarily
- Once the user picks, `strictYear: true` propagates through the entire flow (reviews → Plex check → torrent search → download) so metadata, availability, and downloads all lock to the same movie
- New types: `MovieDisambiguationCandidate`, `ReviewLookupResponse.ambiguityCandidates/resolvedRecommendation`, `Recommendation.strictYear`
- New lib: `resolveMovieLookup` (tmdb.ts), `searchLibraryWithOptions` (plex.ts), `searchTorrents` strictYear option (yts.ts)

### Refactor (from first pass)

- `lib/chat/systemMessages.ts` — all `[System]` message strings centralised
- `lib/mediaKeys.ts` — title normalisation, key generation, capped-set helpers
- `lib/requestBody.ts`, `lib/requestIp.ts`, `lib/randomId.ts` — shared utilities
- `components/ChatInterface.tsx` — ~150-line composition root over focused hooks
- `components/RecommendationCard.tsx` — ~190-line layout (grew with disambiguation); all data fetching in `useRecommendationCardState` (~517 lines)
- `hooks/` — `useChatHistory`, `useChatSendMessage`, `useAppDownloads`, `usePendingTorrents`, `useDownloadTrigger`, `useRecommendationCardState` with AbortController cleanup

## Validation

```
npx vitest run        # 31 files / 569 tests passing
npx tsc --noEmit      # clean (zero errors)
npm run build         # clean production build
```

## Deployment

```bash
npm run build && pm2 restart movie-chat
```

Prompt changes require a server restart. Config changes are hot-reloaded (30s cache).

## Remaining audit items

### Still open

- **SEC-1** `app/api/config/route.ts` — `diagnosticsToken` returned in plaintext via `GET /api/config`. Any LAN device can retrieve it and download the full chat-log bundle. Deferred because the Settings page UI depends on it. Fix: serve the token only through a server-rendered page, not the JSON config endpoint.
- **CR-4** `app/api/chat/route.ts` `ThinkFilter` — If the LLM emits `<think>` without a closing tag, trailing buffered content is silently dropped. Add a `flush()` method.
- **RE-2** `app/api/diagnostics/bundle/route.ts` — Reads all log files into memory at once (~100 MB peak). Reduce `MAX_BUNDLE_BYTES` or stream the response.
- **RE-3/4** `lib/yts.ts`, `lib/eztv.ts` — No server-side caching on torrent search results. Add a short TTL cache keyed by `(title, season)`.
- `forceOllama` in `/api/chat` body not validated as boolean.

### Resolved (latest bug-hunt pass, 2026-04-19)

- Recommendation card refetch storm from inline-arrow identity churn (`ChatMessageList.tsx`)
- `&` dropped in EZTV/Knaben title normalisation (`lib/eztv.ts`)
- `&` dropped in Plex subtitle `startsWith` match (`lib/plex.ts`)
- `strictYear` lost between LLM tag and UI (`lib/chatTags.ts`)
- Redundant `type === 'movie'` gate on post-move re-check URL (`hooks/useRecommendationCardState.ts`)
- Diagnostics bundle passing `''` as envVar to `cfg()` (`app/api/diagnostics/bundle/route.ts`)
- ASCII-only title-case of Unicode titles (`lib/directTitleLookup.ts`)
- Movie vs TV sharing a React key when title+year match (`lib/mediaKeys.ts`)
- `[^>]*` greedy regex in `stripChatActionTags` (`lib/chatTags.ts`)

### Resolved (audit pass, 2026-04-16)

- OAuth CSRF state bypass — `if (urlState || cookieState)` guard removed; both state values are now always required
- OpenRouter/Ollama test routes returning HTTP 200 for errors — now return 400/502 consistent with all other test routes
- TypeScript strict check failure in `__tests__/shell-scripts.test.ts` — `ProcessEnv` type mismatch fixed

### Resolved (previous sessions)

- OAuth CSRF protection (was unprotected)
- OAuth redirect URL hijack via Host header (was reflecting client header)
- Stream reader leak on disconnect (now cancelled in `finally`)
- Stale closures in DownloadTracker (deps corrected)
- Inline function identity causing timer resets (extracted wrapper)
- update.sh concurrent run risk (lock file added)
- update.sh silent failure on pipe (pipefail already set; verified correct)

## Recommended next pass

1. Fix SEC-1 (diagnostics token exposure) and CR-4 (ThinkFilter flush)
2. Chat route modularisation (`app/api/chat/route.ts` remains a single large file — see `NEXT_STEPS.md`)
3. Setup/settings workflow consolidation (see `NEXT_STEPS.md`)

## Known quirks

- A fresh `npm run ci` rerun on this machine hung in `next build` under Node `v25.9.0` before writing `.next/BUILD_ID`. Lint + coverage completed first; the stall needs a follow-up.
- `assertWithinDir` error message when `allowSameDir=false` says "outside allowed directory" — cosmetically inaccurate (path equals the root). No functional impact.
