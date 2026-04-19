# Next Steps

Consolidated planned refactors and features. For session-specific follow-ups and known audit items, see `HANDOFF.md`.

---

## Refactor: Chat Route Modularization

**Target:** `app/api/chat/route.ts` (~344 lines).

The route currently owns: direct-title shortcut, rate limiting, prompt selection, request shaping for two providers, retry/backoff, provider fallback, think-tag filtering, SSE token extraction, and per-turn logging. That is workable but hard to evolve cleanly when provider behavior changes.

### Proposed split

- `lib/chat/buildMessages.ts` — system prompt + seed messages + trimmed history
- `lib/chat/providers/openrouter.ts` — OpenRouter request logic
- `lib/chat/providers/ollama.ts` — Ollama request logic + Gemma tuning
- `lib/chat/providerFallback.ts` — provider order / fallback rules
- `lib/chat/streamSseText.ts` — provider-independent SSE-to-text stream adapter
- `lib/chat/thinkFilter.ts` — extracted `ThinkFilter`
- `lib/chat/rateLimit.ts` — small reusable in-memory limiter

### Acceptance

- `route.ts` becomes an orchestration wrapper, not a transport implementation
- Provider-specific changes happen in provider files, not in the route
- Stream parsing and think-filter logic are unit-testable directly
- Adding a third provider does not require expanding the route file significantly

### New tests

- `__tests__/chat-provider-openrouter.test.ts`
- `__tests__/chat-provider-ollama.test.ts`
- `__tests__/chat-stream-sse.test.ts`
- `__tests__/chat-rate-limit.test.ts`

---

## Refactor: Setup/Settings Workflow Consolidation

**Targets:** `app/settings/page.tsx` (~496 lines), `app/setup/page.tsx` (~400 lines).

Both pages currently duplicate config save logic, service-test logic, and page-level orchestration state. The UX differs but the transport mechanics are converging.

### Proposed split

- `lib/config/client.ts` — `loadConfig()`, `saveConfigFields()`
- `lib/config/serviceChecks.ts` — typed service test wrappers instead of inline fetch calls
- `hooks/useServiceCheck.ts` — generic status lifecycle (`idle/checking/ok/error`)
- `components/config/` — shared form sections or field groups where it helps

### Acceptance

- Setup and settings share save/test primitives
- Service checks stop being hand-written fetch logic per page
- Form state and page flow remain separate; transport details are shared

---

## Feature: YTS Popular Movies Browser

A browseable "Popular Movies" view pulling real-time lists from the YTS API — sorted by downloads, rating, or recency — with a click-through to send any movie into the chat as a recommendation.

### YTS API parameters (already used in `lib/yts.ts`)

| Parameter | Values | Notes |
|---|---|---|
| `sort_by` | `download_count`, `rating`, `seeds`, `date_added`, `year`, `title` | `download_count` = popularity |
| `order_by` | `desc`, `asc` | |
| `minimum_rating` | 0–9 | IMDb filter |
| `genre` | Action, Comedy, Drama, Horror, Sci-Fi, etc. | Hardcoded; YTS has no genres endpoint |
| `quality` | `720p`, `1080p`, `3D` | |
| `limit` | 1–50 | |
| `page` | 1+ | |

Response `data.movies[]` entries contain title, year, imdb_code, rating, genres[], large_cover_image, synopsis, download_count, torrents[]. **No TMDB call is needed** for the browsing view — YTS supplies posters, overviews, ratings, and genres natively.

### Architecture

```
New: lib/yts.ts                         fetchPopularMovies(options)
New: app/api/yts/popular/route.ts       GET /api/yts/popular
New: app/popular/page.tsx               Browse page (Server Component shell)
New: components/PopularMoviesPanel.tsx  Client grid + controls
New: components/PopularMovieCard.tsx    Individual movie card
Mod: app/page.tsx                       Add "Popular" nav button in header
Mod: components/ChatInterface.tsx       Read ?rec= URL param on mount
Mod: types/index.ts                     Add YtsMovieEntry, YtsPopularOptions
```

### Phase 1 — Backend

**Types** (`types/index.ts`):

```ts
export interface YtsMovieEntry {
  ytsId: number;
  title: string;
  year: number;
  imdbCode: string;
  imdbRating: number;
  genres: string[];
  poster: string;
  synopsis: string;
  downloadCount: number;
  torrents: YtsTorrentEntry[];
}

export interface YtsTorrentEntry {
  hash: string;
  quality: string;  // "720p" | "1080p" | "3D"
  type: string;     // "web" | "bluray"
  codec: string;    // "x264" | "x265"
  size: string;
  seeders: number;
}

export interface YtsPopularOptions {
  sortBy?: 'download_count' | 'rating' | 'date_added' | 'seeds' | 'year';
  genre?: string;
  minimumRating?: number;  // 0–9
  page?: number;
  limit?: number;          // 1–50
}

export interface YtsPopularResult {
  movies: YtsMovieEntry[];
  totalCount: number;
  page: number;
  limit: number;
}
```

**`fetchPopularMovies`** (new export in `lib/yts.ts`, alongside `searchTorrents` — does NOT touch the existing search path): builds URL with query params, fetches `list_movies.json`, maps response to `YtsMovieEntry[]`.

**`GET /api/yts/popular`** (`app/api/yts/popular/route.ts`): validates params (whitelist `sort_by`, clamp `limit` 1–50, `minimum_rating` 0–9), calls `fetchPopularMovies`, returns result JSON. Uses `{ next: { revalidate: 1800 } }` (30-min cache). Error → 502 with `{ error: "YTS unavailable" }`.

### Phase 2 — Frontend

**`app/popular/page.tsx`** — Server Component shell, metadata + `<PopularMoviesPanel />`. No server-side data fetching (let the client panel fetch so filters are interactive).

**`components/PopularMoviesPanel.tsx`** — Client component with state: `sortBy`, `genre`, `minimumRating`, `page`, `movies`, `totalCount`, `loading`, `error`.

- Controls: sort toggle (`Most Downloaded` | `Highest Rated` | `Newest`), genre dropdown, min rating selector (`Any | 6+ | 7+ | 8+`), results count ("Showing 1–20 of 4,382")
- Grid: responsive 2/3/4/5 cols
- Pagination: prev/next with page number
- Debounce filter changes 300ms to avoid rapid API hits
- Skeleton cards while loading; retry button + "YTS may be unavailable" on error

**`components/PopularMovieCard.tsx`** — ~160×280px:

- Poster (aspect 2/3, object-cover) with IMDb ★ overlay badge
- Title (1-line clamp), year + first genre, "Watch in Chat" button
- "1080p" badge when `movie.torrents.some(t => t.quality === '1080p')`, grey out otherwise
- Hover: slight scale + 3-line synopsis overlay
- Click → navigates to `/?rec=<encoded JSON>` with `{ title, year, type: 'movie' }`

### Phase 3 — Chat integration

URL-param injection in `components/ChatInterface.tsx` on mount: read `?rec=<json>`, clean the URL via `history.replaceState`, inject as an assistant message with a `recommendationTag`. Reuses the exact same `RecommendationCard` rendering path, so Plex check, torrent search, and download all work identically.

**Sanitisation:** only accept `{ title: string, year?: number, type: 'movie' | 'tv' }`; reject anything else.

### Phase 4 — Tests (`__tests__/yts-popular.test.ts`)

- `fetchPopularMovies` builds correct URL params for each option
- Maps raw YTS response to `YtsMovieEntry[]` correctly
- `GET /api/yts/popular` validates and clamps bad params
- `GET /api/yts/popular` returns 502 on YTS failure
- Passes correct cache headers

### Quality checklist

- Genre list hardcoded as a constant (YTS has no genres endpoint)
- `poster` falls back to a placeholder SVG on 404 (match `RecommendationCard`)
- `synopsis` empty-string-safe
- No torrent data is downloaded/processed client-side — just displayed for the 1080p badge
- `?rec=` injection sanitised: only `{ title, year?, type }` shape accepted
- 30-min server-side cache on `/api/yts/popular`
- Max 50 per page (YTS API limit)
- Mobile: 2-column grid readable at 375px wide; card images `loading="lazy"`

### Key decisions (already settled)

- **Surface:** separate page `/popular` (clean separation, browser-back preserves chat state)
- **Chat handoff:** `?rec=<JSON>` URL param (single param, carries full `Recommendation`)
- **Genre list:** hardcoded constant (YTS has no genres endpoint)
- **Poster source:** YTS `large_cover_image` directly (no extra API calls)
- **Pagination:** prev/next with page number (matches YTS `page` param)
- **Caching:** 30-min server-side ISR (matches TMDB/OMDB pattern)
- **Download from grid:** route through chat only in V1; direct-download button is a later follow-up

---

## Refactor Risk Notes

### Highest regression risks when refactoring

- TV season-selection and default-season prefetch behavior
- Silent recommendation-tag retry timing
- Download guard logic for TV seasons already in Plex
- Provider fallback semantics when OpenRouter returns 200 with an empty stream
- **Callback identity in `components/chat/ChatMessageList.tsx`** (learned 2026-04-19 bug hunt): inline arrows wrapping `onResolveRecommendation` and `isDownloading` must be memoised per-item. Identity churn cascades into `useRecommendationCardState`'s data effect and causes refetch storms on every keystroke / streaming token. Preserve the `ChatMessageItem` / `RecommendationSlot` per-item memoisation when touching this file.

### How to reduce risk

- Extraction-first: preserve behaviour, then refactor
- Add tests before moving subtle logic
- Keep movie and TV flow verification separate per phase
- Avoid bundling a route refactor with prompt or provider changes in the same PR

---

## Non-goals

Do not combine any of the above with:

- UI redesigns
- New provider integrations
- State management library adoption
- Data fetching library adoption
- Electron lifecycle refactors
- Changes to Plex/Transmission topology assumptions
