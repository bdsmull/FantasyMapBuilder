---
phase: 03-world-set-store
plan: 02
subsystem: ui
tags: [zustand, typescript, navigation, react]

# Dependency graph
requires:
  - phase: 03-01
    provides: worldSetStore.ts with useWorldSetStore export
  - phase: 02-server-api
    provides: getMap() in api/client.ts, saveMap() for mapStore.saveMapToServer
provides:
  - "navigateToMap(name, { saveFirst }) in frontend/src/utils/navigation.ts — single shared entry point for all future navigation triggers"
  - "NavigateOptions interface for typed caller API"
affects: [04-management-dialog, 05-hierarchy-panel, 06-canvas-integration, 07-context-menu]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Non-React store access via useMapStore.getState() for side-effect utilities", "Single navigation entry point pattern — callers handle dialogs, utility handles save+load sequence"]

key-files:
  created:
    - frontend/src/utils/navigation.ts
  modified: []

key-decisions:
  - "navigation.ts lives in utils/ (not worldSetStore.ts) per D-01 — keeps store self-contained, avoids circular import risk"
  - "useWorldSetStore NOT imported in navigation.ts — not needed for this utility, and would trip noUnusedLocals"
  - "No try/catch in navigateToMap — errors propagate to caller per D-02 contract; save is a precondition for load"
  - "saveFirst ignored when isDirty is false — clean short-circuit avoids unnecessary save call"

patterns-established:
  - "Dirty-map guard pattern: read isDirty via getState(), conditionally await saveMapToServer(), then fetch+load"
  - "All navigation in phases 4-7 calls navigateToMap() instead of re-implementing the save/load sequence"

requirements-completed: [STORE-08]

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 03 Plan 02: Navigation Utility Summary

**Standalone `navigateToMap(name, { saveFirst })` utility with dirty-map guard using `useMapStore.getState()` — single entry point for all future hierarchy/canvas/statusbar navigation triggers**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T14:06:16Z
- **Completed:** 2026-04-24T14:11:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `frontend/src/utils/navigation.ts` with `navigateToMap(name, { saveFirst })` and `NavigateOptions` interface
- Implements dirty-map guard: saves when `isDirty && saveFirst`, discards when `isDirty && !saveFirst`, skips guard when `!isDirty`
- Uses `useMapStore.getState()` (not a React hook) — safe to call from any non-React code
- TypeScript strict mode compile: exit 0, no output
- All 52 frontend tests pass — zero regressions

## Task Commits

1. **Task 1: Create navigation.ts with navigateToMap(name, { saveFirst })** - `73f6587` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `frontend/src/utils/navigation.ts` — Shared navigation utility with dirty-map guard; exports `navigateToMap` and `NavigateOptions`

## Decisions Made

- `useWorldSetStore` is NOT imported in `navigation.ts`. Per D-01, this keeps worldSetStore.ts free of mapStore imports. The inverse also holds: navigation.ts does not need world set context to perform its fetch+load sequence. Future callers that need world set context can read it directly from `useWorldSetStore.getState()` before calling `navigateToMap`.
- No `try/catch` wrapping. If `saveMapToServer()` rejects when `saveFirst: true`, the error propagates and `getMap`/`loadMap` are NOT called — save is a precondition for load. This matches the D-02 behavior contract exactly.
- `utils/navigation.ts` kept separate from `utils/worldSetUtils.ts`. The existing `worldSetUtils.ts` is pure math (no store/fetch coupling) and stays tree-shakeable. `navigation.ts` carries network and store side-effects — keeping them separate preserves the testability of both modules.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Notes for Plan 03-03 (Tests)

Plan 03-03 will add Vitest tests for `navigateToMap`. The three guard branches to test:

1. `isDirty=false` — `saveFirst` ignored; only `getMap` + `loadMap` called (mock `saveMapToServer` and assert NOT called)
2. `isDirty=true, saveFirst=true` — `saveMapToServer` called first, then `getMap` + `loadMap`
3. `isDirty=true, saveFirst=false` — `saveMapToServer` skipped; only `getMap` + `loadMap` called (discard path)

Mock setup: `vi.mock('../store/mapStore', ...)` to control `useMapStore.getState()` return; `vi.mock('../api/client', ...)` to control `getMap` return.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `navigateToMap` is fully implemented and type-checks — all phases 4-7 can import it from `frontend/src/utils/navigation.ts`
- `NavigateOptions` interface is exported for typed caller contracts
- Plan 03-03 (tests for store + navigation utility) is unblocked
- No blockers or concerns

---
*Phase: 03-world-set-store*
*Completed: 2026-04-24*
