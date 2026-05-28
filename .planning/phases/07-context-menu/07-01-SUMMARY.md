---
phase: 07-context-menu
plan: "01"
subsystem: frontend-dialogs
tags: [world-sets, dialog, props-extension, canvas-context-menu]
dependency_graph:
  requires: []
  provides: [WorldSetDialog.initialAnchor, WorldSetDialog.hideParent, WorldSetDialog.onRequestNewMap, NewMapDialog.onCreated, App.handleRequestNewMap]
  affects: [frontend/src/components/dialogs/WorldSetDialog.tsx, frontend/src/components/dialogs/NewMapDialog.tsx, frontend/src/components/WorldHierarchyPanel.tsx, frontend/src/App.tsx]
tech_stack:
  added: []
  patterns: [optional-prop-seeding, ref-brokered-interop, conditional-render-not-disable]
key_files:
  created: []
  modified:
    - frontend/src/components/WorldHierarchyPanel.tsx
    - frontend/src/components/dialogs/WorldSetDialog.tsx
    - frontend/src/components/dialogs/NewMapDialog.tsx
    - frontend/src/App.tsx
    - frontend/src/__tests__/worldSetDialog.test.ts
decisions:
  - "useState initial value (not useEffect) used for anchorCol/anchorRow seeding — dialog remounts via key increment each time it opens (Pitfall 3 from RESEARCH.md)"
  - "hideParent hides the Parent field entirely (conditional render) — not disabled — per Pitfall 4 from RESEARCH.md"
  - "pendingNewMapCreatedRef uses useRef to avoid triggering re-renders in App.tsx"
  - "onRequestNewMap && !initialMapName guard: Create new map button only shown in create mode, matching Map select disabled-in-edit-mode behavior"
metrics:
  duration_minutes: 4
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_modified: 5
---

# Phase 7 Plan 01: Dialog Props Extension Summary

Extended the WorldSetDialog and NewMapDialog components with new props required for the canvas right-click flow (Plan 7-02). Implements dialog-side contracts: initialAnchor seeding, hideParent conditional rendering, the "Create new map" chain via onRequestNewMap callback, and App.tsx wiring that brokers NewMapDialog interop.

## What Was Changed

### frontend/src/components/WorldHierarchyPanel.tsx

Extended the exported `OpenWorldSetDialogArgs` interface with two new optional fields:

```typescript
export interface OpenWorldSetDialogArgs {
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  initialAnchor?: { col: number; row: number };  // NEW
  hideParent?: boolean;                            // NEW
}
```

### frontend/src/components/dialogs/WorldSetDialog.tsx

Extended the `Props` interface with three new optional fields:

```typescript
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  initialAnchor?: { col: number; row: number };  // NEW
  hideParent?: boolean;                           // NEW
  onRequestNewMap?: (onCreated: (name: string) => void) => void;  // NEW
}
```

Component function signature updated to destructure the three new props. `anchorCol`/`anchorRow` now initialise from `initialAnchor?.col ?? 0` / `initialAnchor?.row ?? 0` (useState initial values, not useEffect). The Parent field is wrapped in `{!hideParent && (...)}` for conditional hiding (not `disabled`). A "Create new map…" button is rendered when `onRequestNewMap && !initialMapName`.

### frontend/src/components/dialogs/NewMapDialog.tsx

Extended `Props` interface with `onCreated?: (name: string) => void`. The `doCreate()` function branches:
- When `onCreated` is provided: calls `onCreated(name)` then `onClose()` — skips `loadMap()` in chain context
- When absent: original behavior (`loadMap + onClose`)

### frontend/src/App.tsx

- Added `pendingNewMapCreatedRef = useRef<((name: string) => void) | null>(null)`
- Added `handleRequestNewMap` callback that stores the callback in the ref and opens `activeDialog: 'new'`
- Updated `NewMapDialog` JSX to pass `onCreated` and clear the ref on close
- Updated `WorldSetDialog` JSX to pass `initialAnchor`, `hideParent`, and `onRequestNewMap={handleRequestNewMap}`

### frontend/src/__tests__/worldSetDialog.test.ts

Added 8 new Plan 07-01 contract tests (CTX-01 through CTX-08) covering: module exports, anchor seeding logic, onCreated branching logic. All are logic-only (no DOM rendering), consistent with the file's existing style.

## Test Results

- 134/134 tests pass (10 test files)
- TypeScript strict mode (`npx tsc --noEmit`) — zero errors
- No regressions in existing test suite

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript `never` inference in test CTX-05**
- **Found during:** Task 1, TypeScript check after RED phase
- **Issue:** `const seed: { col: number; row: number } | undefined = undefined` caused TypeScript to infer `seed` as `never` due to strict narrowing; `seed?.col` reported `Property 'col' does not exist on type 'never'`
- **Fix:** Extracted anchor resolution into a typed helper function `resolveAnchor(seed?: {...})` which gives TypeScript the correct optional parameter type
- **Files modified:** `frontend/src/__tests__/worldSetDialog.test.ts`
- **Commit:** cb12a35 (included in Task 1 commit)

## Known Stubs

None. All new props flow from callers through to the dialog UI. The "Create new map…" button calls `onRequestNewMap` which is wired in App.tsx — the full chain is connected. No hardcoded empty values or placeholder text introduced.

## Self-Check: PASSED

Files exist:
- frontend/src/components/WorldHierarchyPanel.tsx — FOUND
- frontend/src/components/dialogs/WorldSetDialog.tsx — FOUND
- frontend/src/components/dialogs/NewMapDialog.tsx — FOUND
- frontend/src/App.tsx — FOUND
- frontend/src/__tests__/worldSetDialog.test.ts — FOUND

Commits exist:
- cb12a35 (Task 1: extend interfaces + tests) — FOUND
- 8aa99f5 (Task 2: NewMapDialog + App.tsx chain) — FOUND
