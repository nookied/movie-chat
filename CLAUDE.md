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

Changing the system prompt requires a server restart (`pm2 restart movie-chat`) to take effect — it's not hot-reloaded.

## Architecture notes

- `instrumentation.ts` is stable in Next.js 15 — no config flag needed
- All Transmission/Plex fetches use `cache: 'no-store'` — prevents Next.js data cache bloat
- TMDB/OMDB fetches use `{ next: { revalidate: 28800 } }` — 8h TTL
- `lib/appTorrents.ts` uses a 30s TTL cache so the autoMove poller (separate Next.js bundle) picks up new registrations within one cache window
- AutoMove poller: serialised moves, 15s gap between each to avoid I/O spikes
- Post-move Plex re-check: 2 min → 10 min → 60 min backoff; stops early once Plex confirms; all timeouts cancelled on unmount
- Card year display comes from TMDB (`ReviewData.year`), not the LLM — `RecommendationCard` shows `reviews?.year ?? year`

## Debugging guidelines

When debugging connection or API issues, always ask the user about the deployment topology first (e.g. "Is the server running locally or on a remote machine?"). Do not assume services are co-located.

Map out the architecture before attempting fixes: what services are involved, where each one runs (local vs remote), and how they communicate.

## Deployment

- Dev: `npm run dev` → http://localhost:3000
- Production: `pm2 restart movie-chat` (server-side changes like system prompt or autoMove require this)
- Server machine: user `mpbi5`, path `~/movie-chat`, pm2 managed
- Auto-update: cron runs `update.sh --auto` nightly at 3 AM, logs to `~/.movie-chat-update.log`
- If server has drifted: `git fetch origin && git reset --hard origin/main && npm run build && pm2 restart movie-chat`
- **Never commit or push without explicit user instruction**
