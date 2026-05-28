---
phase: 07-context-menu
plan: "02"
subsystem: frontend-canvas
tags: [world-sets, canvas, context-menu, right-click]
dependency_graph:
  requires: [WorldSetDialog.initialAnchor, WorldSetDialog.hideParent, App.handleOpenWorldSetDialog]
  provides: [MapCanvas.canvasCtxMenu, MapCanvas.onOpenWorldSetDialog, CTX-01, CTX-02, CTX-03]
  affects: [frontend/src/components/MapCanvas.tsx, frontend/src/App.tsx, frontend/src/App.css]
tech_stack:
  added: []
  patterns: [mousedown-not-pointerdown, setTimeout-dismiss-delay, gate-and-return-early]
key_files:
  created: []
  modified:
    - frontend/src/components/MapCanvas.tsx
    - frontend/src/App.tsx
    - frontend/src/App.css
decisions:
  - "mousedown (not pointerdown) used for context menu dismiss listener — avoids conflict with MapCanvas onPointerDown handler (Pattern 2 from RESEARCH.md)"
  - "setTimeout(..., 0) delay on dismiss listener registration — prevents opening right-click from immediately dismissing the menu (Pitfall 2 from RESEARCH.md)"
  - "Picker state (pickerPos, pickerCandidates) cleared before setting canvasCtxMenu — avoids z-index conflict between picker and context menu"
  - "Gate returns early on success — tool.onRightPress never called when context menu appears (Pitfall 1)"
metrics:
  duration_minutes: 6
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_modified: 3
---

# Phase 7 Plan 02: Canvas Right-Click Context Menu Summary

Added the right-click context menu to MapCanvas with world-set gate logic, context menu state management, dismiss behavior, JSX overlay, and CSS. The canvas now shows a context menu on right-click when a world set is active and the current map is a node in that world set — routing through the WorldSetDialog configure view established by Plan 7-01.

## What Was Changed

### frontend/src/components/MapCanvas.tsx

**Task 1 changes (lines 28-29, 41-45, 71-79, 217-231):**

- Added `import type { OpenWorldSetDialogArgs } from './WorldHierarchyPanel'` (line 28)
- Added `MapCanvasProps` interface with `onOpenWorldSetDialog` prop (lines 41-43)
- Updated component signature from `React.FC` to `React.FC<MapCanvasProps> = (props)` (line 45)
- Added `CanvasCtxMenuState` type (inline union type with `{x, y, col, row, footprintMapName?} | null`) and `canvasCtxMenu` useState (lines 71-79)
- Added `ctxMenuRef = useRef<HTMLUListElement>(null)` (line 79)
- Added dismiss `useEffect` with `mousedown` + `Escape` listeners and mandatory `setTimeout(..., 0)` delay (lines 217-231)

**Task 2 changes (lines 352-378, 567-630):**

Right-click block replaced (lines 352-378). Gate logic:
```typescript
const isCurrentMapInWorldSet =
  !!worldSetStore.activeWorldSetName &&
  !!worldSetStore.activeWorldSet?.nodes.find((n) => n.mapName === mapName);

if (isCurrentMapInWorldSet && store.mapData && tile) {
  // dismiss picker, set context menu state, return early
}
// Gate failed — existing behavior
```

Context menu JSX added before closing `</>` (lines 567-630): renders `<ul className="canvas-ctx-menu">` when `canvasCtxMenu !== null`. Always shows "Add child map here". Conditionally shows Edit and Remove items when `canvasCtxMenu.footprintMapName` is set.

### frontend/src/App.tsx

Line 140 changed from:
```tsx
<MapCanvas />
```
to:
```tsx
<MapCanvas onOpenWorldSetDialog={handleOpenWorldSetDialog} />
```

`handleOpenWorldSetDialog` was already defined in App.tsx (lines 36-40) and used for `WorldHierarchyPanel`. No new function needed.

### frontend/src/App.css

Added `.canvas-ctx-menu` block (31 lines) after the `.hierarchy-ctx-menu` block (after line 503). Mirrors hierarchy-ctx-menu visual style with `min-width: 200px` (wider for "Add child map here" label). Adds `.separator` variant for the divider line between Add and Edit/Remove items.

## Test Results

- 134/134 tests pass (10 test files)
- TypeScript strict mode (`npx tsc --noEmit`) — zero errors
- No regressions in existing test suite

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The context menu is fully wired:
- "Add child map here" calls `props.onOpenWorldSetDialog` with `initialAnchor` from the clicked tile
- Edit item opens configure view with `initialMapName` for the hit footprint
- Remove item calls `worldSetStore.removeNode(fp)` then `worldSetStore.saveWorldSet()`
- App.tsx passes `handleOpenWorldSetDialog` to MapCanvas, which is already wired to `WorldSetDialog`

## Self-Check: PASSED

Files exist:
- frontend/src/components/MapCanvas.tsx — FOUND
- frontend/src/App.tsx — FOUND
- frontend/src/App.css — FOUND

Commits exist:
- 74b0edf (Task 1: MapCanvasProps + state + dismiss effect) — FOUND
- c7edcd4 (Task 2: gate + JSX + App.tsx + CSS) — FOUND
