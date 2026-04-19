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
- ~~`lib/chat/rateLimit.ts` — small reusable in-memory limiter~~ **DONE** 2026-04-19: extracted to `lib/rateLimit.ts`, already shared between `/api/chat` and `/api/yts/popular`, soft-capped at 10k tracked IPs

### Acceptance

- `route.ts` becomes an orchestration wrapper, not a transport implementation
- Provider-specific changes happen in provider files, not in the route
- Stream parsing and think-filter logic are unit-testable directly
- Adding a third provider does not require expanding the route file significantly

### New tests

- `__tests__/chat-provider-openrouter.test.ts`
- `__tests__/chat-provider-ollama.test.ts`
- `__tests__/chat-stream-sse.test.ts`
- ~~`__tests__/chat-rate-limit.test.ts`~~ → already landed as `__tests__/rate-limit.test.ts`

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

## Feature: YTS Popular Movies Browser — SHIPPED 2026-04-19

The `/popular` browse page with `fetchPopularMovies()` in `lib/yts.ts`, the `GET /api/yts/popular` route, `PopularMoviesPanel` + `PopularMovieCard` components, and the `?rec=<json>` chat handoff all landed. See `HANDOFF.md` § *Latest pass* for the final shape (tab-specific controls, `NEWEST_MIN_YEAR` scoping, 4h cache TTL, 1080p badge removed). The Most Downloaded year filter was subsequently replaced with 7 closed 5-year ranges plus "Any year" — `maximumYear` support was threaded through `types/index.ts`, `lib/yts.ts`, `app/api/yts/popular/route.ts`, and `components/PopularMoviesPanel.tsx`. A hover-strip bug in `components/PopularMovieCard.tsx` (zoom leaking outside the poster container) was fixed with `overflow-hidden`.

### Possible follow-ups (small, opt-in)

- **Direct-download button on the card:** V1 routes every click through the chat via `?rec=`. A future direct-download path would avoid the round-trip but needs a season picker for the TV case, which doesn't exist yet on this page (TV isn't in scope for the YTS browse).
- **Genre picker on Newest tab:** deliberately omitted — YTS doesn't expose a genre-within-recent-years combination, so adding a genre dropdown would give unpredictable behaviour. Revisit only if the API changes.

---

## Feature: Third LLM Provider

Add a third LLM backend alongside OpenRouter and Ollama. **Depends on the chat route modularization landing first** — providers should live in `lib/chat/providers/<name>.ts`, not inline in the route.

### Candidate providers

- **Google AI Studio (Gemini)** — the most generous free tier of the bunch (Gemini 2.5 Flash / Pro via `generativelanguage.googleapis.com` with usable rate limits). Strong instruction-following. Likely the best first pick if we want to offer users a no-cost cloud option out of the box.
- **Anthropic Claude API** (direct, not via OpenRouter) — highest instruction-following quality for the recommendation-tag contract; no free tier
- **OpenAI** — familiar, broad model selection
- **Groq** — cheap and fast, OpenAI-compatible API
- **LM Studio / llama.cpp server** — local alternative to Ollama for users who want a different local runtime

### Scope

- New config fields (API key, model, optional base URL) in `config.local.json` + add key to `SENSITIVE` in `lib/config.ts` for masking/redaction
- Settings page field group + service test wired through `useServiceCheck` (once the setup/settings consolidation lands)
- New provider file under `lib/chat/providers/` wired into `lib/chat/providerFallback.ts` in user-configurable priority order
- Prompt variant in `lib/chatPrompts.ts` only if the provider needs different phrasing (e.g. stricter tag-emission examples)
- Tests under `__tests__/chat-provider-<name>.test.ts` mirroring the existing provider-specific tests

### Decisions still to make

- Provider fallback order when three are configured — fixed priority vs user-reorderable
- Whether to expose per-provider concurrency/rate limits or keep the single global limiter

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
