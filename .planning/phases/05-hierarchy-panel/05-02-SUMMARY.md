---
phase: 05-hierarchy-panel
plan: "02"
subsystem: frontend/dialog
tags: [world-sets, dialog, edit-mode, typescript, react]
dependency_graph:
  requires: [04-management-dialog/04-02]
  provides: [WorldSetDialog edit-mode API surface for Plan 05-03 context menu integration]
  affects: [frontend/src/components/dialogs/WorldSetDialog.tsx, frontend/src/__tests__/worldSetDialog.test.ts]
tech_stack:
  added: []
  patterns: [optional-props-with-defaults, edit-mode-branching-in-submit, useEffect-mount-only-pre-population]
key_files:
  created: []
  modified:
    - frontend/src/components/dialogs/WorldSetDialog.tsx
    - frontend/src/__tests__/worldSetDialog.test.ts
decisions:
  - "Edit-mode parent change uses removeNode+addNode (not a dedicated moveNode action) — preserves existing invariant enforcement (duplicate/cycle checks) in addNode"
  - "Edit-mode useEffect runs only on mount (empty deps array) — callers must pass key={node.mapName} to remount for different nodes (Pitfall 5)"
  - "Map select disabled in edit mode — mapName is identity; only parentAnchor/z/zLabel are mutable via updateNode"
metrics:
  duration: "~4 min"
  completed: "2026-05-07"
  tasks: 2
  files: 2
---

# Phase 5 Plan 02: WorldSetDialog Edit-Mode Props Summary

**One-liner:** Extended WorldSetDialog with three optional props enabling programmatic configure-view opening and edit-mode submit (updateNode vs addNode) for hierarchy panel context menu integration.

## What Was Built

### New Props Interface

```typescript
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
}
```

All three new props are optional. Existing App.tsx call site (`<WorldSetDialog onClose={...} />`) requires no changes.

### State Initialization

- `useState<View>(initialView ?? 'list')` — seeds view from prop, defaults to `'list'`
- `useState<string | null>(initialParentMapName ?? null)` — seeds parentMapName from prop

### Edit-Mode Pre-Population (mount useEffect)

When `initialMapName` is set, a mount-only `useEffect` seeds all configure form fields from the existing node in `activeWorldSet.nodes` and fetches the node's `TmjMap` for needsScale derivation.

### Edit-Mode Submit Branch (handleAddNode)

`handleAddNode` now branches on `initialMapName`:

- **Edit mode, same parent:** calls `updateNode(initialMapName, { parentAnchor, z, zLabel })`
- **Edit mode, parent changed:** calls `removeNode(initialMapName)` then `addNode({...})` — preserves cycle/duplicate invariant enforcement
- **Create mode (no initialMapName):** unchanged existing behavior

### UI Changes

- Dialog title: `{initialMapName ? 'Edit Map Node' : 'Add Map Node'}`
- Submit button: `{loading ? 'Saving…' : (initialMapName ? 'Save' : 'Add')}`
- Map select: `disabled={loading || !!initialMapName}` — identity fixed in edit mode

## Test Count Delta

| Test file | Before | After | Delta |
|-----------|--------|-------|-------|
| worldSetDialog.test.ts | 8 | 11 | +3 |
| Full suite | 95 | 98 | +3 |

### New Tests (describe: WorldSetDialog edit-mode prop contract Plan 05-02)

1. `PANEL-04 edit-mode: updateNode patches anchor/z/zLabel when parent unchanged`
2. `PANEL-04 edit-mode: parent-change path uses removeNode + addNode and preserves mapName`
3. `PANEL-04 edit-mode: updateNode does NOT change mapName (identity preserved)`

## Note for Plan 03

When rendering `WorldSetDialog` from the hierarchy panel context menu, pass `key={contextMenuTarget?.mapName}` to ensure the dialog remounts when the target node changes. Without the `key` prop, the mount-only `useEffect` will not re-run if the dialog stays mounted but `initialMapName` changes (Pitfall 5 from RESEARCH.md).

Example:
```tsx
{editTarget && (
  <WorldSetDialog
    key={editTarget}
    onClose={closeEdit}
    initialView="configure"
    initialMapName={editTarget}
  />
)}
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `frontend/src/components/dialogs/WorldSetDialog.tsx` — modified, contains all required patterns
- `frontend/src/__tests__/worldSetDialog.test.ts` — modified, contains 3 new tests
- Commit `102f7a8` — feat(05-02): Task 1 changes
- Commit `27cb04b` — test(05-02): Task 2 tests
- TypeScript: `tsc --noEmit` exits 0
- Vitest: 98/98 tests pass
