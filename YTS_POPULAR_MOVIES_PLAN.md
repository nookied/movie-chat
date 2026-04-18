# Plan: YTS Popular Movies Browser

## Goal

Add a browseable "Popular Movies" view that pulls real-time lists from the YTS API — sorted by downloads, rating, or recency — and lets users send any movie directly into the chat as a recommendation.

---

## YTS API Capabilities (Relevant to This Feature)

The `list_movies.json` endpoint currently used in `lib/yts.ts` already supports everything we need via query parameters that we're not yet using:

| Parameter | Values | Notes |
|---|---|---|
| `sort_by` | `download_count`, `rating`, `seeds`, `peers`, `date_added`, `year`, `title` | `download_count` = effectively "most popular" |
| `order_by` | `desc`, `asc` | Default is `desc` |
| `minimum_rating` | 0–9 | IMDb rating filter |
| `genre` | `action`, `comedy`, `drama`, `horror`, `sci-fi`, `thriller`, `animation`, `documentary`, `romance`, `adventure`, `crime`, `fantasy`, etc. | From YTS genre list |
| `quality` | `720p`, `1080p`, `3D` | Can filter to 1080p only from the start |
| `limit` | 1–50 | Default 20 |
| `page` | 1, 2, 3… | Pagination |
| `with_rt_ratings` | `true`/`false` | Adds RT score to each result (unreliable, skip) |

The response `data.movies[]` entries already contain: `title`, `year`, `imdb_code`, `rating` (IMDb float), `genres[]`, `large_cover_image` (poster URL), `synopsis`, `download_count`, `like_count`, `torrents[]`.

This means **no TMDB call is needed** for the popular browsing view — YTS provides posters, overviews, ratings, and genres natively.

---

## Architecture Overview

```
New: lib/yts.ts          fetchPopularMovies(options)
New: app/api/yts/popular/route.ts    GET /api/yts/popular
New: app/popular/page.tsx            Browse page (Server Component shell)
New: components/PopularMoviesPanel.tsx  Client-side grid + controls
New: components/PopularMovieCard.tsx    Individual movie card
Mod: app/page.tsx                    Add "Popular" nav button in header
Mod: components/ChatInterface.tsx    Accept externalRecommendation prop (or URL param)
Mod: types/index.ts                  Add YtsMovieEntry, YtsPopularOptions
```

The popular page is a **separate route** (`/popular`) rather than a panel/modal. This is simpler, testable, and preserves the chat context in history when the user navigates back.

---

## Phase 1 — Backend: Data Layer

### 1a. Add types (`types/index.ts`)

```ts
export interface YtsMovieEntry {
  ytsId: number;
  title: string;
  year: number;
  imdbCode: string;       // e.g. "tt1375666"
  imdbRating: number;     // 0–10 float from YTS
  genres: string[];
  poster: string;         // large_cover_image URL
  synopsis: string;
  downloadCount: number;
  torrents: YtsTorrentEntry[];
}

export interface YtsTorrentEntry {
  hash: string;
  quality: string;        // "720p" | "1080p" | "3D"
  type: string;           // "web" | "bluray"
  codec: string;          // "x264" | "x265"
  size: string;           // "5.8 GB"
  seeders: number;
}

export type YtsPopularSortBy =
  | 'download_count'
  | 'rating'
  | 'date_added'
  | 'seeds'
  | 'year';

export interface YtsPopularOptions {
  sortBy?: YtsPopularSortBy;    // default: 'download_count'
  genre?: string;               // YTS genre string, undefined = all
  minimumRating?: number;       // 0–9, default: 0
  page?: number;                // 1-based, default: 1
  limit?: number;               // 1–50, default: 20
}

export interface YtsPopularResult {
  movies: YtsMovieEntry[];
  totalCount: number;
  page: number;
  limit: number;
}
```

### 1b. Add `fetchPopularMovies` to `lib/yts.ts`

New export alongside `searchTorrents`. Does NOT touch the existing search path.

```ts
export async function fetchPopularMovies(
  options: YtsPopularOptions = {}
): Promise<YtsPopularResult> {
  const {
    sortBy = 'download_count',
    genre,
    minimumRating = 0,
    page = 1,
    limit = 20,
  } = options;

  const url = new URL(YTS_API);
  url.searchParams.set('sort_by', sortBy);
  url.searchParams.set('order_by', 'desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', String(page));
  if (genre) url.searchParams.set('genre', genre);
  if (minimumRating > 0) url.searchParams.set('minimum_rating', String(minimumRating));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`YTS error: ${res.status}`);

  const data = await res.json();
  const raw = data?.data ?? {};
  const movies: YtsMovieEntry[] = (raw.movies ?? []).map((m: Record<string, unknown>) => ({
    ytsId: m.id as number,
    title: m.title as string,
    year: m.year as number,
    imdbCode: m.imdb_code as string,
    imdbRating: m.rating as number,
    genres: (m.genres as string[]) ?? [],
    poster: m.large_cover_image as string,
    synopsis: (m.synopsis as string) ?? '',
    downloadCount: (m.download_count as number) ?? 0,
    torrents: ((m.torrents as Record<string, unknown>[]) ?? []).map((t) => ({
      hash: t.hash as string,
      quality: t.quality as string,
      type: t.type as string,
      codec: t.video_codec as string,
      size: t.size as string,
      seeders: t.seeds as number,
    })),
  }));

  return {
    movies,
    totalCount: raw.movie_count ?? 0,
    page: raw.page_number ?? page,
    limit: raw.limit ?? limit,
  };
}
```

### 1c. New API route: `app/api/yts/popular/route.ts`

```
GET /api/yts/popular
  ?sort_by=download_count   (default)
  &genre=action             (optional)
  &minimum_rating=6         (optional, 0–9)
  &page=1                   (default)
  &limit=20                 (default, max 50)
```

- Validates params (whitelist `sort_by` values, clamp `limit` to 1–50, clamp `minimum_rating` to 0–9)
- Calls `fetchPopularMovies(options)`
- Returns `YtsPopularResult` as JSON
- Uses `{ next: { revalidate: 1800 } }` (30-min cache) — popular lists don't change per-second
- Error → 502 with `{ error: "YTS unavailable" }`

---

## Phase 2 — Frontend: Browse Page

### 2a. `app/popular/page.tsx` — Server Component shell

Minimal wrapper, just metadata + renders `<PopularMoviesPanel />`. No data fetching at server level (let the client panel fetch so filters are interactive).

```tsx
export const metadata = { title: 'Popular Movies · Movie Chat' };

export default function PopularPage() {
  return (
    <main className="flex flex-col h-screen h-dvh bg-plex-bg">
      <header ...> {/* same style as app/page.tsx header */}
        <BackToChat />
        <h1>Popular Movies</h1>
      </header>
      <PopularMoviesPanel />
    </main>
  );
}
```

### 2b. `components/PopularMoviesPanel.tsx` — Client Component

**State:**
- `sortBy: YtsPopularSortBy` (default `'download_count'`)
- `genre: string | undefined`
- `minimumRating: number` (default 0)
- `page: number` (default 1)
- `movies: YtsMovieEntry[]`
- `totalCount: number`
- `loading: boolean`
- `error: string | null`

**Controls (top bar):**
- Sort toggle: `Most Downloaded` | `Highest Rated` | `Newest`
- Genre dropdown: All + ~15 YTS genre strings
- Min rating selector: Any | 6+ | 7+ | 8+
- Results count: "Showing 1–20 of 4,382"

**Grid:**
- Responsive: 2 cols on mobile, 3 on sm, 4 on md, 5 on lg
- Each cell: `<PopularMovieCard movie={m} />`

**Pagination:**
- Previous / Next buttons
- Page jumps for large lists

**Data fetching:**
- `useEffect` on filter/page changes → fetch `/api/yts/popular?...`
- Debounce genre/rating changes by 300ms to avoid rapid API hits
- Loading: skeleton cards (pulse animation, same dimensions as real cards)
- Error: retry button + "YTS may be unavailable" message

### 2c. `components/PopularMovieCard.tsx` — Client Component

**Layout** (roughly 160×280px card):
```
┌────────────────┐
│                │
│   POSTER IMG   │  (aspect-ratio: 2/3, object-fit: cover)
│                │
│   IMDB ★ 7.8   │  (bottom-left overlay badge)
│                │
├────────────────┤
│ Title          │  (1-line clamp, font-semibold)
│ 2024 · Action  │  (year + first genre, text-xs text-gray-400)
│ [Watch in Chat]│  (button, full width)
└────────────────┘
```

**"Watch in Chat" button:**
- Navigates to `/?title=Inception&year=2010` (URL params)
- `router.push('/?rec=' + encodeURIComponent(JSON.stringify({ title, year, type: 'movie' })))` 
- ChatInterface reads the `rec` URL param on mount and injects it as a recommendation

**1080p badge:**
- Show a small "1080p" badge if `movie.torrents.some(t => t.quality === '1080p')`
- Grey out / show "HD unavailable" if no 1080p torrent exists

**Hover state:**
- Slight scale-up on poster (transform scale-105, transition)
- Show synopsis excerpt (absolute overlay, 3-line clamp)

### 2d. Modify `app/page.tsx` — Add "Popular" link in header

Add a films/grid icon button next to settings in the header:

```tsx
<Link href="/popular" aria-label="Browse popular movies">
  <GridIcon />  {/* or FilmIcon */}
</Link>
```

---

## Phase 3 — Chat Integration

### 3a. URL-param injection in `components/ChatInterface.tsx`

On mount, check `?rec=<json>` query param:

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const rec = params.get('rec');
  if (!rec) return;
  // Clean the URL without triggering a navigation
  window.history.replaceState({}, '', '/');
  const parsed = JSON.parse(decodeURIComponent(rec));
  // Inject as an assistant message with a recommendation tag
  const tag = recommendationTag(parsed);
  setMessages(prev => [
    ...prev,
    {
      id: randomId(),
      role: 'assistant',
      content: `Here's **${parsed.title}** — let me check availability for you.\n${tag}`,
      recommendations: [parsed],
    },
  ]);
}, []);
```

This reuses the exact same recommendation rendering path (RecommendationCard), so Plex check, torrent search, and download all work identically.

### 3b. Optional: "Ask AI about this" button on PopularMovieCard

A secondary button that navigates to chat with a pre-filled input:
```
/?q=Tell+me+about+Inception+%282010%29
```

ChatInterface reads `?q=` on mount and auto-sends it as the first message.

---

## Phase 4 — Polish & Tests

### Tests to add (`__tests__/yts-popular.test.ts`):

- `fetchPopularMovies` builds correct URL params for each option
- `fetchPopularMovies` maps raw YTS response to `YtsMovieEntry[]` correctly
- `GET /api/yts/popular` validates and clamps bad params
- `GET /api/yts/popular` returns 502 on YTS failure
- `GET /api/yts/popular` passes correct cache headers

### Quality checklist:

- [ ] Genre list hardcoded as a constant (don't fetch from YTS — it doesn't have a genres endpoint)
- [ ] `poster` field falls back to a placeholder SVG if empty or 404 (same pattern as RecommendationCard)
- [ ] `synopsis` field is empty-string-safe (not all YTS entries have one)
- [ ] No torrent data is downloaded or processed client-side on the popular page — just displayed for the 1080p badge
- [ ] The `?rec=` injection is sanitised: only accept `{ title: string, year?: number, type: 'movie'|'tv' }`, reject anything else
- [ ] 30-min server-side cache on `/api/yts/popular` avoids hammering YTS on every page visit
- [ ] Pagination: show max 50 per page to stay within YTS API limit
- [ ] Mobile: 2-column grid is readable at 375px wide; card images use `loading="lazy"`

---

## File Changeset Summary

| File | Change |
|---|---|
| `types/index.ts` | Add `YtsMovieEntry`, `YtsTorrentEntry`, `YtsPopularSortBy`, `YtsPopularOptions`, `YtsPopularResult` |
| `lib/yts.ts` | Export `fetchPopularMovies(options)` |
| `app/api/yts/popular/route.ts` | **New** — GET endpoint, validate params, call `fetchPopularMovies`, 30-min cache |
| `app/popular/page.tsx` | **New** — Server Component shell with header + `<PopularMoviesPanel />` |
| `components/PopularMoviesPanel.tsx` | **New** — Client grid with sort/filter controls, pagination, data fetching |
| `components/PopularMovieCard.tsx` | **New** — Movie card: poster, title, year, rating, genre, "Watch in Chat" button |
| `app/page.tsx` | Add grid/films icon link to `/popular` in header |
| `components/ChatInterface.tsx` | Read `?rec=` URL param on mount, inject as recommendation message |
| `__tests__/yts-popular.test.ts` | **New** — Unit tests for `fetchPopularMovies` and the API route |

No changes to existing chat flow, recommendation rendering, download logic, or Plex integration.

---

## Decision Points — All Options Documented

Each open question is listed with all viable options and their trade-offs. None of these need to be decided upfront; a coder can pick any option and it will work.

---

### D1 — Where to surface the popular movies UI

**Option A: Separate page `/popular` (recommended in this plan)**
- Pros: Clean separation, standard Next.js route, full-screen grid, Back button preserves chat state via browser history, easy to deep-link, testable in isolation
- Cons: Navigation away from chat (minor — browser back is instant)
- URL: `movie-chat.local/popular`

**Option B: Slide-over drawer/panel on the main chat page**
- Pros: Never leaves the chat page, can see both chat and popular list simultaneously on wide screens
- Cons: More complex state management, panel open/close state needs to be hoisted or stored, harder to share/deep-link, eats screen space on mobile
- Implementation: Add `showPopular: boolean` state to `app/page.tsx`, render `<PopularMoviesPanel />` as an absolutely-positioned overlay or a side column (CSS grid `grid-cols-[1fr_400px]` on large screens)

**Option C: Chat-injected list (no new page)**
- A button in the chat header that sends a pre-canned message like "[System] Show popular movies from YTS" which triggers a special rendering path
- Pros: Stays entirely within chat metaphor
- Cons: Awkward for browsing/filtering, hard to paginate, breaks chat flow
- Not recommended

---

### D2 — How to pass a selected movie from popular page → chat

**Option A: JSON blob in `?rec=` param (recommended in this plan)**
```
/?rec=%7B%22title%22%3A%22Inception%22%2C%22year%22%3A2010%2C%22type%22%3A%22movie%22%7D
```
- Pros: Single param, carries the full `Recommendation` object, ChatInterface just parses it
- Cons: Needs URI encoding, slightly ugly URL, needs validation/sanitisation on receipt

**Option B: Separate `?title=&year=&type=` params**
```
/?title=Inception&year=2010&type=movie
```
- Pros: Human-readable URL, easy to construct and destructure, no JSON encoding
- Cons: Three params to keep in sync, type needs validation against `'movie'|'tv'`

**Option C: `sessionStorage` key**
- Set `sessionStorage.setItem('pendingRecommendation', JSON.stringify(rec))` before navigating
- ChatInterface reads and clears it on mount
- Pros: No URL pollution, no encoding concerns
- Cons: Invisible (hard to debug), lost on page refresh, doesn't survive hard navigation

**Option D: React context / Zustand / Jotai global state**
- Pros: Clean, type-safe, no URL hacks
- Cons: Requires a state library or lifting state to a root provider that wraps both `/` and `/popular` routes — adds architecture complexity

---

### D3 — Genre list source

**Option A: Hardcoded constant (recommended)**
```ts
export const YTS_GENRES = ['Action','Adventure','Animation','Biography','Comedy',
  'Crime','Documentary','Drama','Fantasy','Film-Noir','History','Horror',
  'Music','Musical','Mystery','Romance','Sci-Fi','Sport','Thriller',
  'War','Western'] as const;
```
- Pros: Zero network call, no stale-data edge case, instant load, fully typed
- Cons: Could miss a new genre YTS adds (extremely rare in practice)

**Option B: Fetch from YTS at route load time**
- YTS doesn't actually have a `/genres` endpoint — you'd have to scrape or infer from results
- Not feasible; hardcoded is the only real option

---

### D4 — Popular page header

**Option A: Duplicate the header markup (recommended for now)**
- Copy the `<header>` JSX from `app/page.tsx` into `app/popular/page.tsx` with minimal changes (different title, Back button instead of New Chat)
- Pros: No shared component to maintain, zero risk of breaking the main page
- Cons: Two copies to update if the header style changes

**Option B: Extract a shared `<AppHeader>` component**
```tsx
// components/AppHeader.tsx
interface AppHeaderProps {
  title?: string;
  actions?: React.ReactNode;
}
```
- Pros: Single source of truth for header styles/insets
- Cons: Small refactor touching `app/page.tsx`, adds a new shared component
- Recommended only if a third page is expected soon

---

### D5 — Poster images: YTS vs TMDB

**Option A: Use YTS `large_cover_image` directly (recommended)**
- Already in the popular API response, no extra call, ~400px wide JPG
- Fallback: placeholder SVG if image 404s (same `onError` pattern as RecommendationCard)
- Pros: Zero extra API calls for the browse page
- Cons: YTS image CDN sometimes slow; no blurhash placeholder

**Option B: Fetch TMDB poster for each movie using `imdb_code`**
- TMDB has a `find/{imdb_id}?external_source=imdb_id` endpoint
- Pros: Higher quality/consistency, TMDB CDN is faster and more reliable
- Cons: 20 extra TMDB calls per page load (or batch them), adds latency, eats TMDB rate limit quota
- Worth it only if YTS poster quality turns out to be a real problem

---

### D6 — Pagination style

**Option A: Previous / Next buttons with page number display (recommended)**
- Simple, matches the YTS API's natural `page` parameter
- No scroll-position management needed

**Option B: "Load More" / infinite scroll**
- Appends next page to existing `movies` array instead of replacing it
- Pros: More app-like, no explicit page concept for users
- Cons: Harder to re-implement filters (need to reset accumulated pages), memory grows with browsing, scroll restoration is fiddly

**Option C: Virtual / windowed scroll (react-virtual)**
- Renders only visible cards, handles thousands of results smoothly
- Overkill — YTS has ~20k movies total and 50 per page is already a small set

---

### D7 — One-click download from popular grid (bypass chat)

**Option A: Not included — route through chat only (recommended for V1)**
- User clicks "Watch in Chat" → RecommendationCard appears in chat → normal download flow
- Torrent hashes are in the response and `buildMagnet` is already exported — easy to add later

**Option B: Direct download button on PopularMovieCard**
- Best torrent (x265 1080p, highest seeders) is selected automatically
- `POST /api/transmission/add` is called directly from the card
- Shows inline download progress (or redirects to DownloadsPanel)
- Pros: Faster path for power users who just want to queue a movie
- Cons: Bypasses Plex check (user might already have it), no disambiguation, adds complexity to the card component
- Could be a follow-up feature after V1 ships

---

### D8 — Caching strategy for `/api/yts/popular`

**Option A: `{ next: { revalidate: 1800 } }` — 30-min server-side cache (recommended)**
- Next.js ISR: first request fetches, subsequent requests within 30 min serve cached response
- Pros: Familiar pattern already used for TMDB/OMDB, zero infra needed
- Cons: Popular list could be up to 30 min stale

**Option B: No cache (`cache: 'no-store'`)**
- Every page visit hits YTS API live
- Pros: Always fresh
- Cons: YTS is sometimes slow (1–3s), hammers their API on every visitor

**Option C: Redis / KV cache**
- Overkill for this use case; app has no Redis dependency

---

### D9 — Minimum rating filter UX

**Option A: Discrete buttons — Any | 6+ | 7+ | 8+ (recommended)**
- Simple, low tap-target count, clear mental model
- Translates directly to `minimum_rating` values 0, 6, 7, 8

**Option B: Slider (0–9)**
- Granular control, looks sleek
- Cons: Overkill, 0–5 stars is mostly junk on YTS anyway, slider is hard to tap precisely on mobile

**Option C: No rating filter**
- The default sort by `download_count` already implicitly surfaces well-rated films
- Valid option to skip for V1 and add later if users request it

---

### D10 — "Ask AI about this" secondary button

**Option A: Include a secondary "Ask AI" button on PopularMovieCard**
- Navigates to `/?q=Tell+me+about+Inception+%282010%29`
- ChatInterface reads `?q=` on mount and auto-submits it as the first user message
- Pros: Bridges popular browse with conversational context (plot, similar films, etc.)
- Cons: Adds a second CTA to an already small card; "Watch in Chat" already opens the chat

**Option B: "Ask AI" only on a detail view / hover overlay**
- Only visible when hovering over a card (synopsis overlay could include both buttons)
- Pros: Less cluttered card UI
- Cons: Not accessible on mobile (no hover)

**Option C: Skip for V1**
- "Watch in Chat" is sufficient; the user can ask the AI questions once they're in the chat with the RecommendationCard visible
- Simplest choice for V1
