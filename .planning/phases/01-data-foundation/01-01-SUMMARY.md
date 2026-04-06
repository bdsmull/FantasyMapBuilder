---
phase: 01-data-foundation
plan: 01
subsystem: ui
tags: [typescript, react, world-sets, data-model]

# Dependency graph
requires: []
provides:
  - MapScale interface with feetPerUnit on all 8 presets (room=1 to world=2640000)
  - feetPerUnit optional field on TmjMap (backward compatible)
  - WorldSetNode and WorldSet TypeScript interfaces in worldSet.ts
  - computeFootprint() pure function with floor-center anchoring
  - detectOverlaps() pure function with AABB intersection and Z-level filtering
  - 16 Vitest tests covering all footprint math and overlap edge cases
affects: [02-server-api, 03-store, 04-management-dialog, 05-hierarchy-panel, 06-canvas-integration, 07-context-menu]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure function utilities in frontend/src/utils/ for world set computation
    - TypeScript interfaces for companion data format (worldSet.ts) separate from tmj.ts

key-files:
  created:
    - frontend/src/types/worldSet.ts
    - frontend/src/utils/worldSetUtils.ts
    - frontend/src/__tests__/worldSetUtils.test.ts
  modified:
    - frontend/src/data/mapScales.ts
    - frontend/src/types/tmj.ts

key-decisions:
  - "feetPerUnit stored on TmjMap (optional) so older maps load without change"
  - "WorldSet types in separate worldSet.ts, not in tmj.ts — different format, different concern"
  - "computeFootprint uses floor-center anchoring: even dimensions go bottom-right"

patterns-established:
  - "WorldSetUtils pattern: pure functions, no store imports, accept pre-computed inputs"
  - "Floor-center anchoring: colMin = anchor - floor(fp/2), colMax = anchor + floor((fp-1)/2)"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06]

# Metrics
duration: 15min
completed: 2026-04-06
---

# Phase 01 Plan 01: Scale Values, Map Types, and Computation Utilities Summary

**`MapScale` with `feetPerUnit` on all 8 presets, `TmjMap.feetPerUnit` for backward-compat storage, `WorldSetNode`/`WorldSet` types, and pure `computeFootprint`/`detectOverlaps` utilities with 16 passing Vitest tests**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-06T22:02:00Z
- **Completed:** 2026-04-06T22:17:00Z
- **Tasks:** 6 (3 plans x 2 tasks each)
- **Files modified:** 5

## Accomplishments

- Added `feetPerUnit: number` to `MapScale` interface and all 8 presets with correct values (1 ft to 2,640,000 ft)
- Added `feetPerUnit?: number` to `TmjMap` for authoritative per-map storage; optional for backward compatibility with existing maps
- Created `WorldSetNode` and `WorldSet` TypeScript interfaces plus `WORLD_SET_VERSION` constant in `frontend/src/types/worldSet.ts`
- Implemented `computeFootprint()` with floor-center anchoring in `frontend/src/utils/worldSetUtils.ts`
- Implemented `detectOverlaps()` with AABB intersection test and Z-level filtering in the same utility file
- Written 16 Vitest tests covering symmetric/asymmetric footprints, scale ratios, large maps, origin anchors, overlap detection, Z-level filtering, alphabetical pair ordering, multi-pair detection, empty/single-node edge cases

## Task Commits

Each task was committed atomically:

1. **Plan 1: Scale values, TmjMap field, WorldSet types** - `cadf7b3` (feat)
2. **Plan 2: computeFootprint and detectOverlaps utilities** - `2958ed1` (feat)
3. **Plan 3: Vitest tests for utilities** - `369503f` (test)

## Files Created/Modified

- `frontend/src/data/mapScales.ts` - Added `feetPerUnit: number` to interface and all 8 presets
- `frontend/src/types/tmj.ts` - Added `feetPerUnit?: number` field after `scale?`
- `frontend/src/types/worldSet.ts` - New file: `WorldSetNode`, `WorldSet`, `WORLD_SET_VERSION`
- `frontend/src/utils/worldSetUtils.ts` - New file: `Footprint`, `FootprintedNode`, `computeFootprint`, `detectOverlaps`
- `frontend/src/__tests__/worldSetUtils.test.ts` - New file: 16 Vitest tests

## Decisions Made

- Stored `feetPerUnit` as optional on `TmjMap` so all existing `.tmj` maps continue to load without modification
- WorldSet types live in `worldSet.ts`, not `tmj.ts` — the companion format is a separate concern from the Tiled format
- `computeFootprint` uses floor-center anchoring: even dimensions have one extra cell to the bottom-right. This matches the spec and is explicitly tested

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed on first attempt, all 16 tests passed on first run. Total test count went from 36 to 52 with no regressions.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functions are fully implemented with correct logic.

## Next Phase Readiness

- All data types and utility functions are ready for Phase 2 (Server API)
- `WorldSetNode` and `WorldSet` types can be used directly for JSON serialization/deserialization in `server/api/world_sets.py`
- `computeFootprint` and `detectOverlaps` are ready to be used by the Phase 3 store

---
*Phase: 01-data-foundation*
*Completed: 2026-04-06*
