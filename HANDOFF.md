# Handoff

## Scope

This pass covered four related areas:

- Exact-title latency reduction for quoted titles and explicit title declarations
- Shared chat-tag helper refactor
- Settings page duplication cleanup
- System prompt tightening for title passthrough and `[System]` instruction following

## Key changes

- `lib/directTitleLookup.ts`
  Added a deterministic parser for exact-title inputs such as `"Send Help"`, `can you find "Send Help"`, and `the film is titled "Send Help"`.
- `app/api/chat/route.ts`
  Short-circuits explicit title lookups before any OpenRouter/Ollama call, adds a quoted-title seed example, and keeps shared text-stream headers in one place.
- `lib/chatTags.ts`
  Centralises `<recommendation>` / `<download>` parsing, stripping, and recommendation-tag serialization used by the route and UI.
- `components/ChatInterface.tsx`
  Now consumes shared chat-tag helpers instead of carrying local parsing logic.
- `components/Message.tsx`
  Uses the shared tag-stripping helper so display behaviour stays aligned with parsing behaviour.
- `app/settings/page.tsx`
  Extracted repeated disk-usage fetch/render logic into `useDiskInfo()` and `DiskUsageSummary`.
- `lib/chatPrompts.ts`
  Both prompt families now explicitly cover quoted titles, title declarations, and stricter exact-title passthrough.

## Validation

- `npx tsc --noEmit`
- `npm test`
  Current result: 23 test files, 417 tests passing

## Deployment notes

- Restart required for prompt and route changes:
  `pm2 restart movie-chat`
- If deploying bare-metal and rebuilding:
  `npm run build && pm2 restart movie-chat`

## Recommended next pass

- See `REFACTOR_RECOMMENDATIONS.md` for the proposed high-value refactor order.
- Recommended sequence:
  1. `RecommendationCard` split
  2. `ChatInterface` state-machine extraction
  3. Chat route modularization
  4. Setup/settings workflow consolidation

## Known follow-up

- `npm run lint` is not currently a useful non-interactive check in this repo. It launches Next's ESLint setup prompt because the project has not yet been migrated to the ESLint CLI flow. If linting needs to be enforced in CI, migrate that script first.
