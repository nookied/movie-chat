# Refactor Recommendations

## Goal

This document proposes a high-value refactor pass for `movie-chat` without changing user-facing behavior. The emphasis is:

- Lower change risk in the movie and TV flows
- Smaller, more testable modules around chat orchestration and recommendation rendering
- Clearer ownership boundaries between UI state, network side effects, and provider routing
- A path that can be executed incrementally without destabilizing production

## Executive Summary

The highest-value refactor is not a broad rewrite. It is a focused pass across four seams:

1. ~~Split `components/RecommendationCard.tsx`~~ — **DONE** (v2.1.0–v2.2.0)
2. ~~Extract the chat state machine in `components/ChatInterface.tsx`~~ — **DONE** (v2.1.0–v2.2.0)
3. Break `app/api/chat/route.ts` into provider clients, request builders, and stream adapters so the route stops carrying transport details, retry logic, prompt wiring, and SSE parsing at once.
4. Consolidate setup/settings config workflows around shared config form/test helpers.

Phases 1 and 2 are complete. The next high-value work is Phase 3 (chat route modularization).

## Why This Pass Is High Value

### Evidence from current hotspots

| Area | Current shape | Why it matters |
|---|---|---|
| `components/RecommendationCard.tsx` | **Refactored** — ~190 lines, layout + disambiguation chooser wiring. Data logic in `useRecommendationCardState`. | Phase 1 complete |
| `components/ChatInterface.tsx` | **Refactored** — ~150 lines, composition root. Logic in focused hooks. | Phase 2 complete |
| `app/settings/page.tsx` | ~496 lines, multiple service-test responsibilities, config load/save, diagnostics download | Still pending (Phase 4) |
| `app/setup/page.tsx` | ~400 lines, step flow + service tests + config writes | Still pending (Phase 4) |
| `app/api/chat/route.ts` | ~344 lines, direct-title shortcut + rate limiting + prompt selection + provider retries + SSE parsing + think-filter + logging | Still pending (Phase 3) — highest remaining leverage |

### Secondary signals

- ~~`RecommendationCard` mixing~~ — **resolved**: data logic now in `useRecommendationCardState`, UI sections in `components/recommendation/`
- ~~`ChatInterface` mixing~~ — **resolved**: streaming in `useChatSendMessage`, history in `useChatHistory`, downloads in `useAppDownloads`
- The chat route still encodes transport/state-machine behavior inline rather than through reusable services (Phase 3 target).

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

## Phase 1: Recommendation Flow Split — COMPLETE

**Status:** Done. Implemented in v2.1.0–v2.2.0.

### What was done

- `RecommendationCard.tsx` is now ~190 lines of layout/wiring (grew from ~120 with disambiguation chooser integration in v2.2.0)
- All fetch logic lives in `hooks/useRecommendationCardState.ts` (~517 lines — grew with disambiguation + strictYear flow)
- Presentational pieces extracted to `components/recommendation/`: `LibraryStatusBadge`, `MovieDownloadSection`, `MovieMatchChooser`, `TvDownloadSection`, `ScoreBadge`
- No `react-hooks/exhaustive-deps` suppressions remain in the recommendation flow
- Post-move Plex recheck (2 min → 10 min → 60 min backoff) and TV season selection are in the hook with full AbortController cleanup

### Remaining refinement

- Movie and TV availability logic still lives in one combined hook (`useRecommendationCardState`) rather than separate `useMovieAvailability`/`useTvAvailability` hooks. This is functional but could be split further for narrower testing.

## Phase 2: Chat State Machine Extraction — COMPLETE

**Status:** Done. Implemented in v2.1.0–v2.2.0.

### What was done

- `ChatInterface.tsx` is now ~150 lines — pure composition root (grew slightly with disambiguation callback wiring)
- Hooks extracted: `useChatHistory`, `useChatSendMessage`, `useAppDownloads`, `usePendingTorrents`, `useDownloadTrigger`
- `lib/chat/systemMessages.ts` centralises all `[System]` message strings
- Components extracted: `components/chat/ChatMessageList`, `components/chat/ChatComposer`
- All hooks use AbortController cleanup on unmount
- Silent tag retry, streaming, and fallback logic live in `useChatSendMessage`

### Remaining refinement

- `useChatSendMessage` is the largest hook and could be further decomposed (streaming vs retry vs fallback)
- No hook-level unit tests yet — streaming/retry logic is tested via the route-level tests in `chat-route.test.ts`

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

### Sprint 1 — COMPLETE

- Phase 1: `RecommendationCard` split
- Phase 2: `ChatInterface` extraction
- Both completed in v2.1.0–v2.2.0

### Next sprint

- Phase 3: chat route modularization
- Add provider/stream unit tests

### Following sprint

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

- ~~`RecommendationCard.tsx` and `ChatInterface.tsx` each lose at least half their current orchestration weight~~ — **DONE**: both are now thin composition/layout shells
- ~~Recommendation flow effects no longer need lint suppressions~~ — **DONE**: zero `exhaustive-deps` suppressions in the recommendation flow
- Chat provider and stream behavior are testable without exercising the full route (Phase 3)
- Setup/settings service checks are shared instead of duplicated (Phase 4)
- Future feature work can target movie flow, TV flow, provider logic, or config UX independently

## Optional Follow-Up After This Pass

Once the four phases above are complete, the next best maintainer-quality improvements would be:

- migrate `npm run lint` to the ESLint CLI flow so lint becomes a real non-interactive check
- add lightweight integration tests around the new hooks/components
- consider a typed API client layer for internal fetch calls if the team keeps expanding the settings/setup surfaces
