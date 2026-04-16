# Handoff

## Current pass (security hardening + route/component refactor)

This pass covered:

- Security hardening across all POST routes and middleware
- Input validation and atomic writes
- Path traversal protection in file move
- Shared request-body and IP-extraction utilities
- Chat route modularisation (`lib/chat/`)
- Final `ChatInterface` and `RecommendationCard` split into focused hooks and subcomponents
- Media-key normalisation utilities extracted to `lib/mediaKeys.ts`

## Key changes

### Security fixes
- `lib/requestBody.ts` — `readJsonBody()`: unified body parser with Content-Length pre-check (413), 64 KB cap, empty-body guard (400), and JSON parse error (400). Applied to all POST routes.
- `lib/requestIp.ts` — `extractRequestIp()`: reads the **last** hop of `X-Forwarded-For` instead of the first, preventing client-spoofed header bypass of LAN guard and rate limiter.
- `lib/config.ts` — `writeConfig()` now uses write-to-temp + `renameSync` (atomic) to prevent concurrent saves from corrupting `config.local.json`.
- `lib/moveFiles.ts` — Added `assertWithinDir(torrentFolder, DOWNLOAD_DIR)` before `fs.rm` so a maliciously-named torrent (`status.name = '.'`) cannot wipe the entire download directory. Also: on `unlink` failure the rollback no longer deletes the destination copy.
- `middleware.ts` — Internal setup-status URL now uses `INTERNAL_APP_ORIGIN` (fixed `http://127.0.0.1:<PORT>`) instead of reflecting `req.url`, eliminating an SSRF vector via the Host header.
- `app/api/transmission/add/route.ts` — Added full input validation: magnet format, `mediaType` enum, `season` non-negative integer, cross-field TV/season check, `title` length limit (500 chars), `year` range (1888–3000).

### Refactor
- `lib/chat/systemMessages.ts` — All `[System]` message strings centralised here.
- `lib/mediaKeys.ts` — Pure utility functions for title normalisation, torrent/download key generation, and capped-set helpers.
- `lib/randomId.ts`, `lib/requestIp.ts`, `lib/requestBody.ts` — Small shared utilities extracted from inline usage.
- `components/ChatInterface.tsx` — Now ~120 lines; pure composition root over focused hooks.
- `components/RecommendationCard.tsx` — Now ~120 lines; layout and wiring only.
- `components/chat/` — `ChatMessageList`, `ChatComposer` (presentational, no state).
- `components/recommendation/` — `LibraryStatusBadge`, `MovieDownloadSection`, `TvDownloadSection`, `ScoreBadge` (presentational, no state).
- `hooks/` — `useChatHistory`, `useChatSendMessage`, `useAppDownloads`, `usePendingTorrents`, `useDownloadTrigger`, `useRecommendationCardState` — all with AbortController cleanup and mount guards.

## Validation

```
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit   # zero errors
PATH="/opt/homebrew/bin:$PATH" npx vitest run      # 26 files / 464 tests passing
npm run build
```

## Deployment

```bash
npm run build && pm2 restart movie-chat
```

Prompt changes require a server restart. Config changes are hot-reloaded (30s cache).

## Remaining audit items (not yet fixed)

These were identified in the security audit but not addressed in this pass:

### Still open
- **SEC-1** `app/api/config/route.ts` — `diagnosticsToken` still returned in plaintext via `GET /api/config`. Any LAN device can retrieve it and download the full chat-log bundle. Intentionally deferred — the Settings page UI currently depends on it. Fix: serve the token only through a server-rendered Settings page, not the JSON config endpoint.
- **CR-4** `app/api/chat/route.ts` `ThinkFilter` — If the LLM emits `<think>` without a closing tag, trailing buffered content is silently dropped when the stream ends. Add a `flush()` method.
- **RE-2** `app/api/diagnostics/bundle/route.ts` — Reads all log files into memory at once (~100 MB peak). Reduce `MAX_BUNDLE_BYTES` or stream the response.
- **RE-3/4** `lib/yts.ts`, `lib/eztv.ts` — No server-side caching on torrent search results. YTS: up to 3 sequential 8s requests per card. Knaben: 2 parallel requests per season click. Add a short TTL cache keyed by `(title, season)`.
- Add `app-torrents.json` to `.gitignore` — could be accidentally committed, leaking torrent metadata.
- `forceOllama` in `/api/chat` body not validated as boolean.

## Recommended next pass

- Fix remaining audit items above (start with SEC-1 and CR-4)
- Chat route modularisation (`app/api/chat/route.ts` is still a large single file)
- Setup/settings workflow consolidation (see `REFACTOR_RECOMMENDATIONS.md`)

## Known quirks

- `npm run lint` launches Next's ESLint setup prompt interactively — not usable in CI without first completing the ESLint migration.
- `assertWithinDir` error message when `allowSameDir=false` fires says "outside allowed directory" — cosmetically inaccurate (the path equals the root rather than being outside it). No functional impact.
