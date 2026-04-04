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
| `app/api/chat/route.ts` | LLM proxy — system prompt, streaming, rate limiter |
| `components/ChatInterface.tsx` | Main state machine — streams LLM, extracts `<recommendation>` tags |
| `components/RecommendationCard.tsx` | Fires 3 parallel checks (Plex/reviews/YTS) on mount; post-move Plex re-check |
| `components/DownloadTracker.tsx` | Polls `/api/transmission/status` every 5s; read-only, no client-side move logic |
| `lib/transmission.ts` | Transmission RPC with session-ID handshake (always 409 first) |
| `lib/moveFiles.ts` | Core file-move logic — shared between HTTP route and autoMove poller |
| `lib/autoMove.ts` | Server-side background poller — moves one torrent at a time with 15s gap |
| `lib/appTorrents.ts` | In-memory + on-disk registry of app torrent IDs + mediaType/season metadata |
| `lib/config.ts` | `cfg()` helper — 30s in-memory cache avoids per-request sync disk reads |
| `lib/yts.ts` | YTS torrent search + magnet link builder (movies) |
| `lib/eztv.ts` | Knaben/EZTV torrent search + quality scoring (TV) |
| `lib/tmdb.ts` | TMDB metadata — posters, overviews, year, season count |
| `lib/omdb.ts` | OMDB ratings — IMDb score, Rotten Tomatoes |
| `lib/plex.ts` | Plex library check — movies and per-season TV |
| `instrumentation.ts` | Next.js startup hook — starts autoMove poller |
| `types/index.ts` | All shared TypeScript types |
| `electron/main.js` | Electron main process — auto-setup → server → window lifecycle |
| `electron/setup.js` | Silent dependency installer — Homebrew, Plex, Transmission, Ollama |
| `electron/setup.html` | Static progress screen shown during auto-setup |
| `electron/preload.js` | IPC bridge between setup.html and main process |
| `app/setup/page.tsx` | Post-install wizard — summary, Plex token, metadata keys |
| `app/api/setup/status/route.ts` | Config completeness check (at least one LLM configured) |
| `app/api/setup/detect/route.ts` | Auto-detect Ollama/Plex/Transmission on network |
| `app/api/openrouter/callback/route.ts` | OAuth PKCE callback — exchanges code for API key |
| `components/ShareButton.tsx` | QR code modal for sharing app URL with household |
| `components/ui/` | Shared UI: StatusIcon, Section, Field, Toggle |

## Development guidelines

**Always identify the affected flow before making changes:**
- **Movie flow**: YTS torrent → single download → file move
- **TV flow**: Knaben/EZTV → season picker → multi-season logic

These flows diverge significantly. If a change touches both, verify behaviour in each separately.

## System prompt design

The system prompt lives in `app/api/chat/route.ts`. Key rules:

- **User-named titles**: always emit the `<recommendation>` tag — no verification, no substitution, no clarifying questions. The app handles all lookups.
- **Phrase-like titles**: film titles that look like questions or phrases ("How to Make a Killing", "Get Out", "Kill Bill") must be tagged, never treated as general questions or safety issues.
- **No hallucinated state**: the LLM must never claim a title is in Plex or available to download before emitting the tag — the app does the actual lookup.
- **Few-shot examples** are more effective than abstract rules for instruction-following models — when adding new rules, add a concrete example alongside.
- **Token efficiency**: the prompt is intentionally compact (~280 words). Don't add verbose wrong-response lists — a good positive example implies the wrong responses.
- **Prescriptive system messages**: `[System]` info messages include the exact phrasing the model should use — the system prompt just says "follow the instruction". Don't re-add response-pattern rules to the prompt; put the logic in the info message string instead.

Changing the system prompt requires a server restart (`pm2 restart movie-chat`) to take effect — it's not hot-reloaded.

## Small-model reliability

Three mechanisms compensate for unreliable tag emission from small/free LLMs:

1. **Few-shot seeding** (`route.ts` → `SEED_MESSAGES`): A synthetic Arrival exchange is prepended to every conversation. The model sees itself already producing correct tags and continues the pattern. ~40 tokens cost.
2. **Prescriptive info messages** (`ChatInterface.tsx`): Instead of teaching the model 6 response patterns, each `[System]` message includes the exact wording to use. Moves decision logic from the LLM to app code.
3. **Silent tag retry** (`ChatInterface.tsx` → `sendMessage()`): After streaming, if no `<recommendation>` tag is found and the response is substantive, a background follow-up nudges the model to emit the tag. The card appears with a brief delay.

## Electron desktop app

The app can be packaged as a macOS `.dmg` via Electron. The Electron wrapper:

- **First launch**: `electron/setup.js` installs Homebrew → Plex → Transmission (GUI + RPC enabled) → Ollama + model via `brew install`. Progress shown in `electron/setup.html`.
- **After setup**: Starts the Next.js standalone server as a child process, opens a BrowserWindow to `localhost:3000`. The post-install wizard at `/setup` collects Plex token and optional API keys.
- **Normal launch**: Detects config exists, skips setup, goes straight to server → window.
- **Lifecycle**: Window close → minimize to tray (macOS). App quit → kills server + ollama serve processes.
- **Config storage**: `~/Library/Application Support/MovieChat/config/config.local.json` via `CONFIG_PATH` env var.
- **Build**: `npm run electron:build` → `.dmg` in `dist-electron/`. Dev: `npm run electron:dev`.

The setup wizard (`app/setup/page.tsx`) serves dual purpose: post-install guided config in Electron, and first-run redirect for bare-metal installs (middleware checks config completeness).

## Architecture notes

- `instrumentation.ts` is stable in Next.js 15 — no config flag needed
- All Transmission/Plex fetches use `cache: 'no-store'` — prevents Next.js data cache bloat
- TMDB/OMDB fetches use `{ next: { revalidate: METADATA_CACHE_SECONDS } }` — 8h TTL (constant defined in each module)
- `lib/appTorrents.ts` uses a 30s TTL cache so the autoMove poller (separate Next.js bundle) picks up new registrations within one cache window
- AutoMove poller: serialised moves, 15s gap between each to avoid I/O spikes
- Post-move Plex re-check: 2 min → 10 min → 60 min backoff; stops early once Plex confirms; all timeouts cancelled on unmount
- Card year display comes from TMDB (`ReviewData.year`), not the LLM — `RecommendationCard` shows `reviews?.year ?? year`

## Debugging guidelines

When debugging connection or API issues, always ask the user about the deployment topology first (e.g. "Is the server running locally or on a remote machine?"). Do not assume services are co-located.

Map out the architecture before attempting fixes: what services are involved, where each one runs (local vs remote), and how they communicate.

## Deployment

### Bare-metal (current production)
- Dev: `npm run dev` → http://localhost:3001
- Production: `pm2 restart movie-chat` (server-side changes like system prompt or autoMove require this)
- Server machine: user `mpbi5`, path `~/movie-chat`, pm2 managed
- Auto-update: cron runs `update.sh --auto` nightly at 3 AM, logs to `~/.movie-chat-update.log`
- If server has drifted: `git fetch origin && git reset --hard origin/main && npm run build && pm2 restart movie-chat`

### Electron desktop app
- Dev: `npm run electron:dev` (requires `npm run build` first for standalone output)
- Build: `npm run electron:build` → `.dmg` in `dist-electron/`
- Release: `GH_TOKEN=<token> npm run release` → builds + publishes to GitHub Releases
- First launch installs deps via Homebrew, then opens the setup wizard
- Auto-updater checks GitHub Releases every 4h; prompts user to restart when update is ready

### Landing page
- Static site at `docs/index.html`, hosted via GitHub Pages at [nookied.github.io/movie-chat](https://nookied.github.io/movie-chat)
- Download button auto-resolves to latest `.dmg` via GitHub API
- Screenshots in `docs/images/` — strip metadata before committing (`sips -d all` or `exiftool -all=`)

- **Never commit or push without explicit user instruction**
