---
phase: 03-world-set-store
plan: 01
subsystem: ui
tags: [zustand, react, typescript, world-set, store]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: WorldSet/WorldSetNode types in worldSet.ts, computeFootprint/detectOverlaps utilities
  - phase: 02-server-api
    provides: getWorldSet/saveWorldSet API client functions in client.ts
provides:
  - Zustand store (useWorldSetStore) with activeWorldSetName/activeWorldSet state
  - setActiveWorldSet action (fetch + set, or clear)
  - saveWorldSet action (explicit persist via API)
  - addNode with hard-error invariants (duplicate, cycle, inconsistent parent link) and overlap warnings
  - removeNode with BFS descendant cascade
  - updateNode with immutable patch on parentAnchor/z/zLabel
  - childrenOf/parentOf/rootNodes computed helpers
  - AddNodeResult type for ok/warning/error signaling
affects:
  - 03-02 (navigation utility imports useWorldSetStore.getState())
  - 03-03 (store tests exercise all actions)
  - 04-management-dialog (WorldSetDialog reads/calls store)
  - 05-hierarchy-panel (WorldHierarchyPanel reads store)
  - 06-canvas-integration (overlay reads store for active world set)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AddNodeResult discriminated union: ok: true with warnings | ok: false with error"
    - "Explicit-save pattern: mutations update in-memory only; caller invokes saveWorldSet() separately"
    - "Computed helpers as plain store functions (not Zustand selectors) — matches mapStore.ts flat style"
    - "Invariant helpers as module-private functions (_createsCycle, _parentLinkConsistent)"

key-files:
  created:
    - frontend/src/store/worldSetStore.ts
  modified: []

key-decisions:
  - "AddNodeResult returned-result approach: addNode returns { ok, warnings } | { ok: false, error } — callers decide display"
  - "Store-level overlap check uses anchor-cell collision (1x1 footprint) — feetPerUnit-aware check deferred to Phase 4 management dialog"
  - "computeFootprint/detectOverlaps NOT imported in this store — richer overlap detection belongs in Phase 4 where map dimensions are available"
  - "Computed helpers (childrenOf, parentOf, rootNodes) exposed as plain store functions, not Zustand selectors"

patterns-established:
  - "worldSetStore follows mapStore.ts pattern: create<Store>((set, get) => ({...})) with async lifecycle actions"
  - "No cross-store imports — worldSetStore does not import mapStore; navigation utility (Plan 03-02) bridges them"

requirements-completed: [STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07]

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 3 Plan 01: World Set Store Summary

**Zustand store for active world set with full CRUD actions, cycle/duplicate/parent-link invariants, BFS descendant removal, and anchor-cell overlap warnings**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-24T13:01:50Z
- **Completed:** 2026-04-24T13:03:58Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created `worldSetStore.ts` with `activeWorldSetName` + `activeWorldSet` state (both null initially), mirroring `mapStore.ts` Zustand pattern
- Implemented all 5 actions: `setActiveWorldSet` (fetch or clear), `saveWorldSet` (explicit persist), `addNode` (3 hard-block invariants + anchor-cell overlap warning), `removeNode` (BFS cascade), `updateNode` (immutable patch)
- Implemented 3 computed helpers: `childrenOf`, `parentOf`, `rootNodes`
- Exported `AddNodeResult` discriminated union type for caller-controlled warning/error display
- No cross-store imports — `mapStore.ts` untouched

## Task Commits

1. **Tasks 1 + 2: worldSetStore.ts — state, lifecycle, mutations, computed helpers** - `1dcfd3b` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `frontend/src/store/worldSetStore.ts` — Zustand store for active world set; 246 lines; exports `useWorldSetStore`, `WorldSetStore`, `AddNodeResult`

## Decisions Made

- **AddNodeResult returned-result approach:** `addNode` returns `{ ok: true; warnings: string[] } | { ok: false; error: string }` — callers decide how to display warnings/errors. No thrown exceptions for validation failures.
- **Store-level overlap = anchor-cell collision:** The store has no access to map dimensions or `feetPerUnit`, so the overlap warning uses a 1x1 anchor comparison. Phase 4's management dialog will use `computeFootprint` + `detectOverlaps` for the full spatial check.
- **computeFootprint/detectOverlaps NOT imported in this store:** Keeping the store free of unnecessary utility imports; the richer overlap check belongs where map metadata is available.
- **Tasks 1 and 2 implemented together:** The plan called for Task 1 to create stubs and Task 2 to replace them. I wrote the complete implementation directly since both tasks use the same file and the invariant helpers (_createsCycle, _parentLinkConsistent) were already designed in Task 1. This is a non-functional deviation — the output is identical to what two separate commits would produce.

## Deviations from Plan

**1. [Minor - Implementation Order] Tasks 1 and 2 implemented in a single write instead of stub-then-fill**
- **Found during:** Task 1 implementation
- **Issue:** The plan structure called for Task 1 to write stubs (`throw new Error('addNode: implemented in Task 2')`) and Task 2 to replace them. Since both tasks target the same file and the helper functions were already designed, writing the complete implementation directly avoids a transient broken state.
- **Fix:** Wrote `worldSetStore.ts` complete in one pass; committed once with all behavior in place.
- **Files modified:** `frontend/src/store/worldSetStore.ts`
- **Verification:** TypeScript compiles clean (exit 0), all 52 existing Vitest tests pass.
- **Committed in:** `1dcfd3b`

---

**Total deviations:** 1 (implementation order only — no behavioral difference)
**Impact on plan:** No functional impact. All acceptance criteria for both tasks satisfied. Output is identical to what two sequential commits would produce.

## Issues Encountered

None — TypeScript compiled clean on first attempt, all existing tests passed.

## Known Stubs

None — all actions fully implemented. `childrenOf`, `parentOf`, `rootNodes` return live data from `activeWorldSet.nodes`. `addNode`/`removeNode`/`updateNode` perform real mutations.

## Next Phase Readiness

- `useWorldSetStore` is ready for Plan 03-02 (navigation utility)
- Plan 03-02 should call `useWorldSetStore.getState()` (not a hook) inside the navigation utility since it runs outside React components
- Plan 03-03 (store tests) can immediately write tests against all 5 actions using the `AddNodeResult` shape
- Phase 4 (management dialog) should call `computeFootprint` + `detectOverlaps` from `worldSetUtils.ts` before calling `addNode` for richer spatial overlap warnings

---
*Phase: 03-world-set-store*
*Completed: 2026-04-24*
