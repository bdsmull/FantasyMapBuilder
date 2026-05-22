---
phase: 06-canvas-integration
plan: 03
subsystem: ui
tags: [react, typescript, zustand, worldset, navigation]

requires:
  - phase: 06-01
    provides: CSS classes .status-breadcrumb and .status-breadcrumb-link in App.css
  - phase: 03-world-set-store
    provides: worldSetStore with parentOf() computed helper and navigateToMap() utility

provides:
  - StatusBar.tsx with parent breadcrumb showing ancestor map name as clickable nav link
  - Dirty-map guard modal (Save / Discard / Cancel) wired to breadcrumb click

affects:
  - 06-04 (canvas integration — any component consuming StatusBar)

tech-stack:
  added: []
  patterns:
    - "Dirty-map guard modal pattern: useState<string | null> for target, render modal outside status bar in fragment"
    - "worldSetStore subscription in leaf component: useWorldSetStore() + parentOf(mapName) for breadcrumb"

key-files:
  created: []
  modified:
    - frontend/src/components/StatusBar.tsx

key-decisions:
  - "Used React fragment wrapper so dirty-guard modal renders outside .status-bar div — modal is sibling, not child"
  - "HTML entity &#8593; used for up-arrow character — avoids encoding issues in TSX"
  - "parentNode guard uses !== null (not truthy) — consistent with WorldSetNode | null return type of parentOf()"

patterns-established:
  - "Breadcrumb guard: mapName ? worldSetStore.parentOf(mapName) : null — null-safe guard matches store contract"

requirements-completed: [CANVAS-06]

duration: 5min
completed: 2026-05-22
---

# Phase 06 Plan 03: Status Bar Breadcrumb Summary

**Parent breadcrumb in StatusBar.tsx using worldSetStore.parentOf() with dirty-map guard modal (Save / Discard / Cancel)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-22T13:10:00Z
- **Completed:** 2026-05-22T13:15:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- StatusBar.tsx now subscribes to worldSetStore and renders a breadcrumb when the current map has a parent in the active world set
- Breadcrumb shows up-arrow, parent map name as clickable button (.status-breadcrumb-link), and a muted > separator
- Clicking the parent button navigates directly if map is clean; shows dirty-map guard modal if isDirty
- Dirty-guard modal provides Save & Navigate, Discard, and Cancel options — same pattern as MapCanvas.tsx
- Breadcrumb is absent when no world set is active or map has no parent; absent in "No map open" state
- TypeScript compiles cleanly with no errors (strict mode, noUnusedLocals, noUnusedParameters)

## Task Commits

1. **Task 1: Add parent breadcrumb to StatusBar.tsx** - `a62f377` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `frontend/src/components/StatusBar.tsx` - Added worldSetStore subscription, parentOf() call, breadcrumb JSX, dirty-map guard modal

## Decisions Made
- Used React fragment (`<>...</>`) to render the dirty-guard modal as a sibling of `.status-bar` div, not nested inside it — correct for a full-screen backdrop overlay at z-index 3000
- HTML entity `&#8593;` for the up-arrow — avoids any encoding/escape issues in TSX strings
- Checked `parentNode !== null` (strict equality) rather than truthy check — consistent with `WorldSetNode | null` return contract from `parentOf()`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- CANVAS-06 requirement fulfilled: parent breadcrumb navigation is live in the status bar
- Plan 06-04 (if any) can proceed — no blockers from this plan
- All CSS classes (.status-breadcrumb, .status-breadcrumb-link) were already in place from Plan 06-01

## Self-Check: PASSED

- `frontend/src/components/StatusBar.tsx` — FOUND
- commit `a62f377` — FOUND
