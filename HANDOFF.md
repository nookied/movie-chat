# Handoff

## Current pass (full audit — security, stability, QA expansion)

This pass covered two rounds: (1) a security hardening + component refactor pass, and (2) a comprehensive codebase audit with bug fixes, test expansion, and documentation overhaul.

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

### Refactor (from first pass)

- `lib/chat/systemMessages.ts` — all `[System]` message strings centralised
- `lib/mediaKeys.ts` — title normalisation, key generation, capped-set helpers
- `lib/requestBody.ts`, `lib/requestIp.ts`, `lib/randomId.ts` — shared utilities
- `components/ChatInterface.tsx` — ~120-line composition root over focused hooks
- `components/RecommendationCard.tsx` — ~120-line layout; all data fetching in `useRecommendationCardState`
- `hooks/` — `useChatHistory`, `useChatSendMessage`, `useAppDownloads`, `usePendingTorrents`, `useDownloadTrigger`, `useRecommendationCardState` with AbortController cleanup

## Validation

```
npx vitest run        # 30 files / 556 tests passing
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

### Resolved this session

- OAuth CSRF protection (was unprotected)
- OAuth redirect URL hijack via Host header (was reflecting client header)
- Stream reader leak on disconnect (now cancelled in `finally`)
- Stale closures in DownloadTracker (deps corrected)
- Inline function identity causing timer resets (extracted wrapper)
- update.sh concurrent run risk (lock file added)
- update.sh silent failure on pipe (pipefail already set; verified correct)

## Recommended next pass

1. Fix SEC-1 (diagnostics token exposure) and CR-4 (ThinkFilter flush)
2. Chat route modularisation (`app/api/chat/route.ts` remains a single large file — see Phase 3 of `REFACTOR_RECOMMENDATIONS.md`)
3. Setup/settings workflow consolidation (see Phase 4 of `REFACTOR_RECOMMENDATIONS.md`)

## Known quirks

- `npm run lint` launches Next's ESLint setup prompt interactively — not usable in CI without first completing the ESLint migration.
- `assertWithinDir` error message when `allowSameDir=false` says "outside allowed directory" — cosmetically inaccurate (path equals the root). No functional impact.
