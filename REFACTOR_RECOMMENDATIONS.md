# Refactor Recommendations

## Goal

This document proposes a high-value refactor pass for `movie-chat` without changing user-facing behavior. The emphasis is:

- Lower change risk in the movie and TV flows
- Smaller, more testable modules around chat orchestration and recommendation rendering
- Clearer ownership boundaries between UI state, network side effects, and provider routing
- A path that can be executed incrementally without destabilizing production

## Executive Summary

The highest-value refactor is not a broad rewrite. It is a focused pass across four seams:

1. Split `components/RecommendationCard.tsx` into movie-specific and TV-specific orchestration plus smaller shared presentation pieces.
2. Extract the chat state machine in `components/ChatInterface.tsx` into hooks/services so message streaming, download control, and persistence stop living in one component.
3. Break `app/api/chat/route.ts` into provider clients, request builders, and stream adapters so the route stops carrying transport details, retry logic, prompt wiring, and SSE parsing at once.
4. Consolidate setup/settings config workflows around shared config form/test helpers.

If only one refactor is funded, do `RecommendationCard` plus `ChatInterface` first. That pair carries the most state, side effects, and feature branching.

## Why This Pass Is High Value

### Evidence from current hotspots

| Area | Current shape | Why it matters |
|---|---|---|
| `components/RecommendationCard.tsx` | ~599 lines, 5 `useEffect`s, 6 fetch sites, movie and TV flows in one component, 3 `react-hooks/exhaustive-deps` suppressions | Highest UI complexity and the clearest source of accidental regressions between movie vs TV behavior |
| `components/ChatInterface.tsx` | ~536 lines, 8 `useCallback`s, 7 fetch sites, streaming + persistence + downloads + LLM retry all together | Hard to reason about state transitions and difficult to test in isolation |
| `app/settings/page.tsx` | ~496 lines, multiple service-test responsibilities, config load/save, diagnostics download, provider fallback test | Manageable now, but still shaped like a second orchestration page rather than a composition of smaller sections |
| `app/setup/page.tsx` | ~405 lines, step flow + service tests + config writes in one component | Lower risk than the chat surfaces, but shares patterns that should be aligned with settings |
| `app/api/chat/route.ts` | ~323 lines, direct-title shortcut + rate limiting + prompt selection + provider retries + SSE parsing + think-filter + logging | High leverage server-side entry point; difficult to extend safely with new providers or logging rules |

### Secondary signals

- `RecommendationCard` currently mixes:
  - movie availability logic
  - TV season-pack selection
  - post-move Plex backoff polling
  - metadata loading
  - multiple callback side effects to influence chat behavior
- `ChatInterface` currently mixes:
  - persisted message history
  - streaming transport
  - fallback provider retry
  - silent recommendation-tag retry
  - Transmission download bookkeeping
  - UI rendering concerns
- The route and client both still encode significant transport/state-machine behavior inline rather than through reusable services.

## Recommended Scope

### In scope

- File/module extraction
- Hook extraction
- Responsibility boundaries
- Test reshaping to support smaller units
- Shared helpers for config/service tests and provider calls

### Out of scope

- UI redesign
- Prompt redesign beyond keeping current behavior intact
- Data model changes to Plex/Transmission/TMDB/OMDB responses
- New features
- Swapping providers or changing deployment topology

## Recommended Refactor Order

## Phase 1: Recommendation Flow Split

### Target

- [components/RecommendationCard.tsx](/Users/karolnowacki/Documents/GitHub/movie-chat/components/RecommendationCard.tsx:45)

### Current problems

- Movie and TV flows diverge heavily but are rendered from one component.
- Network orchestration, retry logic, derived library state, and UI rendering are all interwoven.
- Three effects currently suppress `react-hooks/exhaustive-deps`, which is a sign that responsibilities and closure boundaries are doing too much.

### Proposed shape

- `components/recommendation/RecommendationCardShell.tsx`
  - Shared layout: poster, title, overview, scores, Plex badge shell
- `components/recommendation/MovieRecommendationActions.tsx`
  - Movie torrent availability and download button UI
- `components/recommendation/TvRecommendationActions.tsx`
  - Season picker, pack status, option select, TV download button UI
- `hooks/useRecommendationMetadata.ts`
  - Fetch reviews/TMDB/OMDB and expose `{ reviews, reviewState, notFound }`
- `hooks/useMovieAvailability.ts`
  - Fetch Plex and movie torrent availability for movie recommendations
- `hooks/useTvAvailability.ts`
  - Fetch Plex seasons, TV pack availability, selected option state, default season prefetch
- `hooks/usePlexRecheck.ts`
  - Own the 2 min → 10 min → 60 min post-move recheck loop

### Why this is worth doing first

- It isolates the movie flow and TV flow, which the project docs already treat as fundamentally different.
- It reduces the chance that a TV change breaks movie availability or vice versa.
- It allows narrower tests for each flow instead of asserting everything through one giant card component.

### Acceptance criteria

- `RecommendationCard.tsx` becomes a thin composition layer under ~150 lines.
- No `react-hooks/exhaustive-deps` suppressions remain in the recommendation flow.
- Movie-only changes can be made without opening TV-specific code paths.
- TV flow logic can be tested without exercising movie torrent branches.

### Suggested test additions

- `__tests__/movie-recommendation-flow.test.ts`
- `__tests__/tv-recommendation-flow.test.ts`
- `__tests__/usePlexRecheck.test.ts`

## Phase 2: Chat State Machine Extraction

### Target

- [components/ChatInterface.tsx](/Users/karolnowacki/Documents/GitHub/movie-chat/components/ChatInterface.tsx:66)

### Current problems

- The component owns message persistence, streaming, provider fallback handling, silent retry, download triggering, active download syncing, and rendering.
- `sendMessage()` spans a large portion of the file and carries transport concerns that should be testable without rendering the entire UI.
- Message state and download state are coordinated through local component state and refs instead of explicit domain boundaries.

### Proposed shape

- `hooks/useChatHistory.ts`
  - Load/save localStorage history and welcome-message handling
- `hooks/useStreamingChat.ts`
  - Own `/api/chat` calls, stream draining, fallback to Ollama, silent tag retry, and returned assistant payload
- `hooks/useAppDownloads.ts`
  - Own Transmission sync, app torrent id persistence, and completion/removal updates
- `hooks/usePendingTorrents.ts`
  - Own pending torrent registry and recommendation-to-download mapping
- `lib/chat/systemMessages.ts`
  - Build `[System]` messages in one place instead of inline strings in the component
- Optional:
  - replace multi-piece local state with a reducer if state transitions still feel implicit after extraction

### Proposed post-refactor component split

- `ChatInterface.tsx`
  - layout + wiring only
- `ChatMessageList.tsx`
  - messages + recommendation cards
- `ChatComposer.tsx`
  - textarea + send button
- `useStreamingChat()`
  - request/response state machine

### Acceptance criteria

- `ChatInterface.tsx` is reduced to view composition plus a small set of hook calls.
- `sendMessage()` no longer contains raw retry loops and stream-drain internals inline.
- Download sync and chat streaming can be tested independently.
- System-message wording lives in one helper module.

### Suggested test additions

- `__tests__/useStreamingChat.test.ts`
- `__tests__/useAppDownloads.test.ts`
- `__tests__/chat-system-messages.test.ts`

## Phase 3: Chat API Route Modularization

### Target

- [app/api/chat/route.ts](/Users/karolnowacki/Documents/GitHub/movie-chat/app/api/chat/route.ts:69)

### Current problems

- The route currently owns:
  - direct-title shortcut
  - rate limiting
  - prompt selection
  - request shaping for two providers
  - retry/backoff
  - provider fallback rules
  - think-tag filtering
  - SSE token extraction
  - final logging
- That is workable today, but it is hard to evolve cleanly if provider behavior changes again.

### Proposed shape

- `lib/chat/buildMessages.ts`
  - system prompt + seed messages + trimmed history
- `lib/chat/providers/openrouter.ts`
  - OpenRouter request logic
- `lib/chat/providers/ollama.ts`
  - Ollama request logic + Gemma tuning
- `lib/chat/providerFallback.ts`
  - provider order / fallback rules
- `lib/chat/streamSseText.ts`
  - provider-independent SSE-to-text stream adapter
- `lib/chat/thinkFilter.ts`
  - extracted `ThinkFilter`
- `lib/chat/rateLimit.ts`
  - small reusable in-memory limiter

### Acceptance criteria

- `route.ts` becomes an orchestration wrapper rather than a transport implementation.
- Provider-specific changes happen in provider files, not in the route.
- Stream parsing and think-filter logic can be unit tested directly.
- Adding a third provider would not require expanding the route file significantly.

### Suggested test additions

- `__tests__/chat-provider-openrouter.test.ts`
- `__tests__/chat-provider-ollama.test.ts`
- `__tests__/chat-stream-sse.test.ts`
- `__tests__/chat-rate-limit.test.ts`

## Phase 4: Config Workflow Consolidation

### Target

- [app/settings/page.tsx](/Users/karolnowacki/Documents/GitHub/movie-chat/app/settings/page.tsx:124)
- [app/setup/page.tsx](/Users/karolnowacki/Documents/GitHub/movie-chat/app/setup/page.tsx:48)

### Current problems

- Setup and settings both contain:
  - config save logic
  - service test logic
  - page-level orchestration state
- The UX is different, but the underlying form/test/save mechanics are converging.

### Proposed shape

- `lib/config/client.ts`
  - `loadConfig()`, `saveConfigFields()`
- `lib/config/serviceChecks.ts`
  - typed service test wrappers instead of inline fetch calls
- `hooks/useServiceCheck.ts`
  - generic status lifecycle (`idle/checking/ok/error`)
- `components/config/`
  - shared form sections or field groups where it helps

### Acceptance criteria

- Setup and settings share save/test primitives.
- Service checks stop being hand-written fetch logic per page.
- Form state and page flow remain separate, but transport details are shared.

## Recommended End-State Architecture

```text
UI
  ChatInterface
    useChatHistory
    useStreamingChat
    useAppDownloads
    RecommendationCardShell
      useRecommendationMetadata
      MovieRecommendationActions
      TvRecommendationActions
      usePlexRecheck

Server
  chat/route.ts
    directTitleLookup
    rateLimit
    buildMessages
    providerFallback
    openrouterClient
    ollamaClient
    streamSseText
    thinkFilter
```

## Work Breakdown Recommendation

### Sprint 1

- Phase 1: `RecommendationCard` split
- Add targeted tests for movie vs TV orchestration

### Sprint 2

- Phase 2: `ChatInterface` extraction
- Stabilize chat streaming and download hooks

### Sprint 3

- Phase 3: chat route modularization
- Add provider/stream unit tests

### Sprint 4

- Phase 4: config workflow consolidation
- Optional lint migration in parallel if desired

## Risk Notes

### Highest regression risks

- TV season-selection and default-season prefetch behavior
- Silent recommendation-tag retry timing
- Download guard logic for TV seasons already in Plex
- Provider fallback semantics when OpenRouter returns 200 with an empty stream

### How to reduce risk

- Preserve behavior through extraction-first refactors
- Introduce tests before moving logic where the existing behavior is subtle
- Keep movie and TV flow verification separate in every phase
- Avoid bundling the route refactor with prompt changes or provider changes in the same PR

## Concrete Non-Goals For The Refactor Pass

Do not combine this pass with:

- New UI polish
- New provider integrations
- State management library adoption
- Data fetching library adoption
- Electron lifecycle refactors
- Changes to Plex/Transmission topology assumptions

Those are separate decisions and would reduce the safety of this pass.

## Success Metrics

The refactor should be considered successful if:

- `RecommendationCard.tsx` and `ChatInterface.tsx` each lose at least half their current orchestration weight
- Recommendation flow effects no longer need lint suppressions
- Chat provider and stream behavior are testable without exercising the full route
- Setup/settings service checks are shared instead of duplicated
- Future feature work can target movie flow, TV flow, provider logic, or config UX independently

## Optional Follow-Up After This Pass

Once the four phases above are complete, the next best maintainer-quality improvements would be:

- migrate `npm run lint` to the ESLint CLI flow so lint becomes a real non-interactive check
- add lightweight integration tests around the new hooks/components
- consider a typed API client layer for internal fetch calls if the team keeps expanding the settings/setup surfaces
