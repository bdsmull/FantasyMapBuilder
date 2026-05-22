---
phase: 06-canvas-integration
plan: 02
subsystem: ui
tags: [react, typescript, canvas, world-sets, footprint, navigation]

# Dependency graph
requires:
  - phase: 06-canvas-integration plan 01
    provides: footprintOverlay.ts with renderFootprintOverlay and footprintAtPoint functions
  - phase: 03-world-set-store
    provides: useWorldSetStore with childrenOf helper
  - phase: 03-world-set-store plan 02
    provides: navigateToMap utility in navigation.ts

provides:
  - MapCanvas.tsx wired to render child-map footprint outlines after every tile/hex render
  - Desktop hover highlighting with pointer cursor and footprint-tooltip
  - Desktop click-to-navigate with dirty-map guard modal
  - Touch two-tap model (first tap shows tooltip, second tap navigates)
  - Overlap picker popup (.footprint-picker) for 2+ overlapping footprints
  - Dirty-map guard modal (Save / Discard / Cancel) integrated in MapCanvas

affects:
  - 06-03 (StatusBar breadcrumb — adjacent canvas-integration work)
  - Any future canvas overlay work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Footprint overlay as final canvas pass after tile/hex render inside useCallback
    - renderedFootprintsRef for stale-closure-safe hit-testing
    - Footprint interception before tool dispatch in onPointerDown
    - Touch two-tap state machine with touchedFootprint state
    - Document-level pointerdown dismiss listener for picker popup

key-files:
  created: []
  modified:
    - frontend/src/components/MapCanvas.tsx

key-decisions:
  - "useState added to existing React import to bring in overlay state hooks"
  - "JSX wrapped in React fragment (<>) to allow sibling overlay elements alongside canvas"
  - "tooltipMapName computed from hoveredFootprint ?? touchedFootprint to unify hover and touch tooltip display"
  - "picker dismiss uses document-level pointerdown with capture:true and once:true to avoid React event bubbling race"

patterns-established:
  - "Overlay intercept pattern: footprint hit-test runs before tool dispatch in onPointerDown"
  - "Ref-based footprint list (renderedFootprintsRef) avoids stale closure in pointer handlers"

requirements-completed:
  - CANVAS-04
  - CANVAS-05

# Metrics
duration: 5min
completed: 2026-05-22
---

# Phase 6 Plan 02: Canvas Integration — Footprint Overlay Wiring Summary

**MapCanvas.tsx extended with footprint overlay rendering, desktop hover+tooltip, click-to-navigate with dirty-map guard, touch two-tap model, and overlap picker popup**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-22T13:02:00Z
- **Completed:** 2026-05-22T13:07:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added all required imports (renderFootprintOverlay, footprintAtPoint, useWorldSetStore, navigateToMap)
- Overlay state fully initialized: hoveredFootprint, touchedFootprint, tooltipPos, pickerPos, pickerCandidates, dirtyGuardTarget
- renderFootprintOverlay called after every tile/hex render in the useCallback render function
- Desktop hover tracking in onPointerMove: changes hoveredFootprint, updates tooltip position, triggers re-render
- Desktop click-to-navigate in onPointerDown: intercepts before tool dispatch; 1 hit navigates, 2+ shows picker
- Touch two-tap model: first tap sets touchedFootprint + shows tooltip, second tap navigates
- Overlap picker popup: document-level dismiss listener + Escape key handler
- Dirty-map guard modal rendered inline with Save / Discard / Cancel options
- Cursor changes to 'pointer' when hovering any footprint

## Task Commits

1. **Task 1: Wire footprint overlay into MapCanvas** - `f92352f` (feat)

## Files Created/Modified

- `frontend/src/components/MapCanvas.tsx` — Extended with footprint overlay rendering, all pointer event logic for footprints, overlay JSX siblings

## Decisions Made

- Wrapped return in React fragment `<>...</>` to allow tooltip, picker, and modal as JSX siblings to the canvas element (no structural change to the `.canvas-area` container needed since `.footprint-tooltip` and `.footprint-picker` use `position: fixed`)
- Used `tooltipMapName = hoveredFootprint ?? touchedFootprint` to unify tooltip display logic for both desktop hover and touch tap
- Added `hoveredFootprint` and `worldSetStore` to render useCallback deps so hover state changes trigger canvas re-render with updated highlight colors

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly on first attempt with no errors.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Canvas footprint overlay fully integrated — Plan 02 complete
- Plan 03 (StatusBar breadcrumb) can now proceed independently
- The footprint overlay is visible whenever a world set is active and the current map has children in that world set

---
*Phase: 06-canvas-integration*
*Completed: 2026-05-22*
