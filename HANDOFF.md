# Handoff

## Latest pass (2026-04-19 — post-refactor bug hunt)

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

- `npm run lint` launches Next's ESLint setup prompt interactively — not usable in CI without first completing the ESLint migration.
- `assertWithinDir` error message when `allowSameDir=false` says "outside allowed directory" — cosmetically inaccurate (path equals the root). No functional impact.
