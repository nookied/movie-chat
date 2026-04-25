# movie-chat — Claude Instructions

## Architecture

- **Dev machine**: macOS, runs `npm run dev` or `pm2 start`
- **Plex**: runs on a **separate machine** on the local network (not the dev machine)
- **Transmission**: runs on the same separate machine as Plex
- **Ollama**: may run locally or on the separate machine — ask if unclear
- All external service URLs are configured via `.env.local` or `config.local.json` (Settings page)

## Key files

| File | Purpose |
|---|---|
| `app/api/chat/route.ts` | LLM proxy — provider routing, streaming, rate limiter, per-turn chat log |
| `lib/chatPrompts.ts` | `DEFAULT_SYSTEM_PROMPT`, `GEMMA_SYSTEM_PROMPT`, `isGemmaModel`, `getSystemPrompt` |
| `lib/directTitleLookup.ts` | Deterministic exact-title parser — quoted titles and `the film is titled ...` declarations bypass provider latency. Unicode-aware title casing (`\p{Ll}`) |
| `lib/chatTags.ts` | Shared `<recommendation>` / `<download>` parsing, stripping, and tag serialization helpers; carries `strictYear` end-to-end |
| `NEXT_STEPS.md` | Consolidated planned work — chat route modularization, setup/settings consolidation, refactor risk notes, and follow-ups on shipped features |
| `lib/logger.ts` | Structured JSONL logger — daily rotation, 7-day retention, 32 KB entry / 50 MB file caps |
| `lib/version.ts` | Shared `getVersion()` — reads `package.json` at `process.cwd()`; used by `/api/config` and `/api/diagnostics/bundle`. Not cached (tests override fs mid-file) |
| `app/api/diagnostics/bundle/route.ts` | GET endpoint — token-gated zip-less JSON bundle (logs + redacted config + version) |
| `components/ChatInterface.tsx` | Chat composition root — wires history, streaming, downloads, and message rendering together |
| `hooks/useChatSendMessage.ts` | Streaming chat request orchestration — retry/backoff, Ollama fallback, silent recommendation-tag retry |
| `hooks/useChatHistory.ts` | Persisted chat history state — auto-trim by age (7 days) and count, drops legacy messages without timestamps on load, save is suppressed while streaming |
| `components/chat/ChatMessageList.tsx` | Renders message list + per-recommendation card slot. Callback identity matters here — inline arrows must be memoised per-item to avoid re-running the card's data effects on every render |
| `components/RecommendationCard.tsx` | Recommendation renderer — movie/TV sections, disambiguation chooser, sits on top of `useRecommendationCardState()` |
| `components/recommendation/MovieMatchChooser.tsx` | Disambiguation UI — shown when a bare title has multiple TMDB matches (e.g. remakes) |
| `hooks/useRecommendationCardState.ts` | Recommendation card data hook — Plex/reviews/torrent fetches, TV season selection, movie disambiguation, strictYear locking, post-move Plex re-check |
| `components/DownloadTracker.tsx` | Polls `/api/transmission/status` every 5s; aborts stale requests on unmount/cancel; read-only, no client-side move logic |
| `lib/transmission.ts` | Transmission RPC with session-ID handshake (always 409 first) |
| `lib/moveFiles.ts` | Core file-move logic — shared between HTTP route and autoMove poller |
| `lib/autoMove.ts` | Server-side background poller — moves one torrent at a time with 15s gap |
| `lib/appTorrents.ts` | In-memory + on-disk registry of app torrent IDs + mediaType/season/title metadata |
| `lib/config.ts` | `cfg()` helper — 30s in-memory cache avoids per-request sync disk reads |
| `lib/yts.ts` | YTS torrent search + magnet link builder (movies); supports `strictYear` option; `normalizeTitle` maps `&` → `and` so LLM tags match YTS entries; also `fetchPopularMovies()` for the `/popular` browse page — when `minimumYear` or `maximumYear` is set it scans raw YTS pages in 50-item chunks, accumulates filtered matches until it can fill the requested filtered page, and returns an exact `totalCount` if it reaches the end (otherwise a bounded estimate) |
| `app/api/yts/popular/route.ts` | GET — whitelists `sort_by`, clamps `limit`/`page`/`minimum_rating`, validates `minimum_year` and `maximum_year` (both > 1900), returns 502 on upstream failure |
| `components/PopularMoviesPanel.tsx` | `/popular` client grid + controls. Tab-specific filter layout: Most Downloaded exposes genre + a year-range dropdown (8 items: "Any year" + 7 closed ranges — "2025 and later", 2020–2024, 2015–2019, 2010–2014, 2005–2009, 2000–2004, "Before 2000"); Newest exposes a single sort dropdown (`year` default / `seeds` = Sort by popularity / `rating` = Sort by rating) and is hard-scoped to the last 3 years via `newestMinYear()` so non-year sorts stay recent |
| `components/PopularMovieCard.tsx` | Individual YTS browse card — poster, IMDb ★ overlay, hover synopsis, click → `/?rec=<json>`; inner poster container has `overflow-hidden` to clip the `group-hover:scale-105` zoom |
| `app/popular/page.tsx` | Server-component shell for the YTS browse page |
| `lib/eztv.ts` | Knaben/EZTV torrent search + quality scoring (TV); `norm` maps `&` → ` and ` so titles like "Law & Order" match "Law.and.Order" releases |
| `lib/tmdb.ts` | TMDB metadata — posters, overviews, year, season count; `resolveMovieLookup` handles disambiguation for bare titles with multiple exact matches |
| `lib/omdb.ts` | OMDB ratings — IMDb score, Rotten Tomatoes |
| `lib/plex.ts` | Plex library check — movies and per-season TV; `searchLibraryWithOptions` supports `strictYear` mode; `titleMatches` normalises `&` → `and` on both `title` and `originalTitle`, including subtitle variants |
| `lib/mediaKeys.ts` | Title normalisation and React-key generation (`recommendationKey` includes `type` so a movie and TV show with the same title+year don't collide; `torrentKey` takes an optional `season` suffix used by the pending-torrent map) |
| `lib/recUrlParam.ts` | Safe `?rec=<json>` parser for the popular → chat handoff; preserves `strictYear` only when year is valid so remake titles stay locked |
| `lib/ytsGenres.ts` | Shared YTS genre whitelist (`YTS_GENRES` array + `YTS_GENRE_SET` validator) — used by the popular panel dropdown and the API param validator |
| `lib/rateLimit.ts` | Shared per-IP rate-limiter factory. Each route gets its own isolated Map; soft-capped at 10k tracked IPs to prevent unbounded growth under a unique-IP burst |
| `install.sh` | Remote installer — clone/update checkout, install deps, build, optional pm2 + cron setup; auto-installs Node.js on first run when missing (Homebrew on macOS, NodeSource apt/dnf/yum on Linux) |
| `setup.sh` | Local one-shot setup — prerequisite check, install deps, build, optional pm2 + cron setup |
| `update.sh` | Safe updater — dirty-worktree guard, rollback, lock file, optional auto-update cron target |
| `instrumentation.ts` | Next.js startup hook — starts autoMove poller |
| `types/index.ts` | All shared TypeScript types |
| `app/setup/page.tsx` | Post-install wizard — summary, Plex token, metadata keys |
| `app/api/setup/status/route.ts` | Config completeness check (at least one LLM configured) |
| `app/api/setup/detect/route.ts` | Auto-detect Ollama/Plex/Transmission on network |
| `app/api/openrouter/auth/route.ts` | OAuth initiation — CSRF state cookie + redirect to OpenRouter |
| `app/api/openrouter/callback/route.ts` | OAuth PKCE callback — CSRF state always required, timing-safe comparison, fixed-origin redirects, key exchange |
| `components/ShareButton.tsx` | QR code modal for sharing app URL with household; preserves protocol/origin and cleans up stale QR/clipboard async work |
| `components/ui/` | Shared UI: StatusIcon, Section, Field, Toggle |

## Development guidelines

**Always identify the affected flow before making changes:**
- **Movie flow**: YTS torrent → single download → file move
- **TV flow**: Knaben/EZTV → season picker → multi-season logic
- **Popular-movies browse flow**: YTS `list_movies.json` (via `fetchPopularMovies`) → grid → click card → `/?rec=<json>` → chat's `RecommendationCard` (reuses the Movie flow for the actual download)

These flows diverge significantly. If a change touches both, verify behaviour in each separately. The popular-browse page only handles movies — TV is intentionally out of scope (no season picker there).

If you are planning a broad cleanup or a new feature, consult `NEXT_STEPS.md` first and prefer that ordering over ad-hoc restructuring.

## System prompt design

The prompts and Gemma detection live in `lib/chatPrompts.ts`. The chat route picks one with `getSystemPrompt(modelName)` — Gemma models get `GEMMA_SYSTEM_PROMPT` (tighter, native system-role friendly), everything else gets `DEFAULT_SYSTEM_PROMPT` (verbose, defensive). Key rules:

- **User-named titles**: always emit the `<recommendation>` tag — no verification, no substitution, no clarifying questions. The app handles all lookups.
- **Quoted titles / title declarations**: inputs like `"Send Help"` or `the film is titled "Send Help"` should also tag immediately. Prefer a concrete example over a long prose rule.
- **Phrase-like titles**: film titles that look like questions or phrases ("How to Make a Killing", "Get Out", "Kill Bill") must be tagged, never treated as general questions or safety issues.
- **No hallucinated state**: the LLM must never claim a title is in Plex or available to download before emitting the tag — the app does the actual lookup.
- **Few-shot examples** are more effective than abstract rules for instruction-following models — when adding new rules, add a concrete example alongside.
- **Token efficiency**: the prompt is intentionally compact (~280 words). Don't add verbose wrong-response lists — a good positive example implies the wrong responses.
- **Clarification threshold**: only ask a follow-up when the request gives literally nothing to work with — any attribute (actor type, mood, genre, era) is enough to just pick something. Without this rule, models over-ask.
- **Follow-up questions**: the model must answer questions about a film it already recommended from its own knowledge, not deflect or pivot to a different title.
- **Prescriptive system messages**: `[System]` info messages include the exact phrasing the model should use — the system prompt just says "follow the instruction". Don't re-add response-pattern rules to the prompt; put the logic in the info message string instead.

Changing the system prompt requires a server restart (`pm2 restart movie-chat`) to take effect — it's not hot-reloaded.

For Gemma models, sampling is also tuned in `app/api/chat/route.ts`: `temperature=0.7`, `top_p=0.95`, `top_k=64` (Gemma's recommended values, slightly tempered for tag-emission reliability). Other Ollama models keep `temperature=0.4` and Ollama's defaults.

## Small-model reliability

Four mechanisms compensate for unreliable tag emission from small/free LLMs:

1. **Deterministic direct-title shortcut** (`lib/directTitleLookup.ts` → `route.ts`): Quoted titles and explicit title declarations skip the model entirely and emit the recommendation tag immediately.
2. **Few-shot seeding** (`route.ts` → `SEED_MESSAGES`): Synthetic exchanges are prepended to every conversation, including a quoted-title lookup, so the model sees itself already producing correct tags.
3. **Prescriptive info messages** (`lib/chat/systemMessages.ts` + `ChatInterface.tsx`): Instead of teaching the model 6 response patterns, each `[System]` message includes the exact wording to use. Moves decision logic from the LLM to app code.
4. **Silent tag retry** (`hooks/useChatSendMessage.ts`): After streaming, if no `<recommendation>` tag is found and the response is substantive, a background follow-up nudges the model to emit the tag. The card appears with a brief delay.

## Setup wizard

`app/setup/page.tsx` is a first-run redirect target for bare-metal installs — middleware checks config completeness (at least one LLM configured) and redirects new installs to `/setup` to collect the Plex token and optional API keys before landing on the chat.

## Architecture notes

- `instrumentation.ts` is stable in Next.js 15 — no config flag needed
- All Transmission/Plex fetches use `cache: 'no-store'` — prevents Next.js data cache bloat
- TMDB/OMDB fetches use `{ next: { revalidate: METADATA_CACHE_SECONDS } }` — 8h TTL (constant defined in each module)
- `lib/appTorrents.ts` uses a 30s TTL cache so the autoMove poller (separate Next.js bundle) picks up new registrations within one cache window
- `lib/chatTags.ts` centralises chat-tag parsing/stripping so `Message`, `ChatInterface`, and the route stay in sync when tag formats evolve
- The refactored client hooks abort in-flight fetches/timers on unmount; preserve that cleanup when extending `useChatSendMessage`, `useAppDownloads`, or `useRecommendationCardState`
- `components/chat/` and `components/recommendation/` now hold the presentational pieces; the heavier orchestration lives in `hooks/`
- AutoMove poller: serialised moves, 15s gap between each to avoid I/O spikes
- Post-move Plex re-check: 2 min → 10 min → 60 min backoff; stops early once Plex confirms; all timeouts cancelled on unmount
- Card year display comes from TMDB (`ReviewData.year`), not the LLM — `RecommendationCard` shows `reviews?.year ?? year`
- **Movie disambiguation**: When a bare title (no year) matches multiple TMDB results, `/api/reviews` returns `ambiguityCandidates` and the card shows a `MovieMatchChooser` instead of proceeding. Once the user picks, the resolved title+year propagate with `strictYear: true` through Plex checks, torrent searches, and downloads so nothing can drift across remakes
- **strictYear flow**: `Recommendation.strictYear` gates year-exact matching in Plex (`searchLibraryWithOptions`) and YTS (`searchTorrents` with `strictYear` option). Without it, year is treated as a hint (fuzzy match). Set automatically by disambiguation, by the reviews route when it resolves an exact single TMDB match, or propagated from the LLM's tag when `strictYear: true` is present in the payload
- **Chat history persistence**: `hooks/useChatHistory.ts` stores messages in `localStorage['movie-chat-history']`, trimmed to the last 100 and to a 7-day age window (`MAX_HISTORY_AGE_MS`). Messages without `timestamp` are dropped on load (legacy pre-timestamp data). The save effect is suppressed while `isStreaming` is true so in-progress assistant placeholders aren't persisted
- **Callback stability in message list**: `components/chat/ChatMessageList.tsx` renders each message through a memoised per-item component (`ChatMessageItem`) so the inline arrows wrapping `onResolveRecommendation` and `isDownloading` keep stable identity across parent re-renders. Without this, the recommendation card's main effect re-fires every keystroke / streaming token and issues a storm of `/api/reviews`, `/api/plex/check`, `/api/torrents/search` requests. If you touch this file, preserve the per-item memoisation

## Debugging guidelines

When debugging connection or API issues, always ask the user about the deployment topology first (e.g. "Is the server running locally or on a remote machine?"). Do not assume services are co-located.

Map out the architecture before attempting fixes: what services are involved, where each one runs (local vs remote), and how they communicate.

## Observability

`lib/logger.ts` provides `getLogger(source)` returning `{ info, warn, error }`. Each call writes one JSONL line to the day's file AND mirrors to `console.*` so pm2's stdout capture and dev-mode terminals keep working unchanged.

- **Sources in use**: `server`, `llm`, `autoMove`, `transmission`, `plex`, `move`, `reviews`, `torrents`. Tag new ones consistently.
- **Log directory** (resolution order):
  1. `process.env.MOVIE_CHAT_LOG_DIR` — optional override for reverse-proxied / containerised deployments
  2. `dirname(CONFIG_PATH)/logs` — same root as `config.local.json`
  3. `./logs` — bare-metal fallback alongside `pm2-out.log` / `pm2-error.log` (set in `ecosystem.config.js`)
- **Caps**: 32 KB per entry (truncates with `_truncated: true`), 50 MB per daily file (drops to console-only with one warn), 7-day file retention.
- **Chat content** is logged in full (user message + assistant response) per turn — useful for prompt debugging, but bundles contain household conversation data. Worth flagging to anyone you ship a bundle to.

## Diagnostics bundle

`GET /api/diagnostics/bundle?token=<diagnosticsToken>` returns one JSON document containing recent logs, redacted config, and version/system info. The token is auto-generated on first server start by `ensureDiagnosticsToken()` (called from `instrumentation.ts`) and stored in `config.local.json`. The Settings page reads it from `GET /api/config` and wires it into the download URL — no manual setup.

`SENSITIVE` (in `lib/config.ts`) drives both UI masking (`GET /api/config` returns `"set"`/`""`) and bundle redaction (replaces with `"[REDACTED]"`). Bundle redaction additionally covers `diagnosticsToken` so a leaked bundle can't be used to pull more bundles.

## Testing

`npm test` (Vitest, Node env) covers the unit + integration suite under `__tests__/` — 34 files / 623 tests at last run, covering libs, route handlers (using fetch-API `Request` cast to `NextRequest`), tag helpers, direct-title lookup, chat client helpers, media-key normalization, logger/diagnostics surfaces, middleware/IP validation, OAuth CSRF flows, system prompt routing, ThinkFilter streaming, YTS popular-list fetching and API-route param clamping, and shell-script contract tests for `install.sh` / `update.sh`. `npm run test:e2e` runs production HTTP smoke tests from `__e2e__/` against a built app. `npm run ci` mirrors the full CI pipeline locally: `lint` → `test:coverage` → `build` → `test:e2e`. Conventions:

- Mock `fs` with `vi.mock('fs', () => ({ default: fsMock, ...fsMock }))` so both ESM and CJS imports see the mock.
- `vi.resetModules()` in `beforeEach` so module-level state (rate-limit map, logger caches, etc.) is fresh per test.
- Stream-based tests (`__tests__/chat-route.test.ts`) build a `ReadableStream` of SSE chunks and pass it through the real route handler.
- `lib/autoMove.ts` exposes `__testHooks = { tick }` so tests can drive a single poll pass without fake-timer juggling.
- If a change touches install, setup, deployment, pm2, cron, or rollback behavior, always inspect `update.sh` and keep the shell-script tests green.

CI runs against `20` and `24` LTS. Any Node version is accepted at runtime — `install.sh` / `setup.sh` / `update.sh` report the version but do not gate on it. Node 25 was empirically verified (full `npm run ci` pass on 25.9.0).

CI runs `npm run lint`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e` on push and PRs for both Node 20 and Node 24 (`.github/workflows/test.yml`, `TZ=UTC` for deterministic date tests, `NEXT_TELEMETRY_DISABLED=1`).

## Deployment

### Bare-metal (current production)
- Dev: `npm run dev` → http://localhost:3001
- Production: `pm2 restart movie-chat` (server-side changes like system prompt or autoMove require this)
- Server machine: user `mpbi5`, path `~/movie-chat`, pm2 managed
- Auto-update: cron runs `update.sh --auto` nightly at 3 AM, logs to `~/.movie-chat-update.log`
- If server has drifted: `git fetch origin && git reset --hard origin/main && npm run build && pm2 restart movie-chat`

### Landing page
- Static site at `docs/index.html`, hosted via GitHub Pages at [nookied.github.io/movie-chat](https://nookied.github.io/movie-chat)
- Primary CTA is the `install.sh` one-liner (copy-to-clipboard code block); secondary links go to the GitHub repo + README
- Screenshots in `docs/images/` — strip metadata before committing (`sips -d all` or `exiftool -all=`)

## Documentation maintenance

Every change — feature, fix, or refactor — must keep these files in sync before the session ends:

| File | Update when |
|---|---|
| `CHANGELOG.md` | Any user-visible change. Add to `[Unreleased]` under the correct section (`Added` / `Changed` / `Fixed` / `Security`). **Never create a duplicate section heading** — merge into the existing one. |
| `HANDOFF.md` | Every session. Add a "Latest pass" block at the top with what changed and a validation snapshot. |
| `CLAUDE.md` + `AGENTS.md` | Key files table, architecture notes, or guidelines become stale. Both files must stay in sync with each other. |
| `NEXT_STEPS.md` | A planned item ships (mark it done + date) or a new follow-up is identified. |
| `README.md` | User-facing behaviour changes (new UI, new config fields, new flows). |
| `.agents/skills/qa/SCENARIOS.md` | Test counts change, or a tested scenario is added/removed/renamed. |

**Rules:**
- Read the target file before editing — never assume its current content.
- Merge into existing sections; never duplicate headings.
- CHANGELOG entries go in `[Unreleased]` only — do not bump version numbers.
- `CLAUDE.md` and `AGENTS.md` are kept identical in structure; a change to one requires the same change to the other.
- `HANDOFF.md` is append-only at the top — do not edit previous passes.

- **Never commit or push without explicit user instruction**
