---
phase: 04-management-dialog
plan: "01"
subsystem: frontend/dialog
tags: [world-sets, dialog, menu, react, vitest]
dependency_graph:
  requires: []
  provides: [WorldSetDialog, MenuBar.onWorldSets, App.Dialog.worldSets]
  affects: [frontend/src/App.tsx, frontend/src/components/MenuBar.tsx]
tech_stack:
  added: []
  patterns: [three-view-state-machine, zustand-store-hook, api-client-mock-vitest]
key_files:
  created:
    - frontend/src/__tests__/worldSetDialog.test.ts
    - frontend/src/components/dialogs/WorldSetDialog.tsx
  modified:
    - frontend/src/components/MenuBar.tsx
    - frontend/src/App.tsx
decisions:
  - "WorldSetDialog type alias (type View) declared inside component — not hoisted to module level, matches plan spec"
  - "No useMapStore import in WorldSetDialog — cross-store boundary respected per RESEARCH.md"
  - "World Sets... menu item has no disabled class — usable without a loaded map"
metrics:
  duration_seconds: 129
  completed_date: "2026-05-05"
  tasks_completed: 3
  files_changed: 4
---

# Phase 4 Plan 01: WorldSetDialog Foundation Summary

WorldSetDialog three-view state machine (list/nodes/configure), fully wired into App.tsx and MenuBar, with Wave 0 Vitest contract tests and complete list-view CRUD.

## What Was Built

### Task 1 — Wave 0 Vitest scaffold (`worldSetDialog.test.ts`)

Three contract tests using `node` environment (no DOM, no JSX rendering):
- Baseline: `vi.isMockFunction(listWorldSets)` confirms mock wiring
- DIALOG-02: create handler sequence — `saveWorldSet` called then `setActiveWorldSet`, store reflects name
- DIALOG-03: delete handler sequence — `deleteWorldSet` called, then `listWorldSets` refreshes

### Task 2 — WorldSetDialog component (`WorldSetDialog.tsx`)

Full list view implementation:
- `type View = 'list' | 'nodes' | 'configure'` state machine
- `useEffect` loads world sets on mount via `listWorldSets()`
- `handleCreate`: trims name, duplicate guard, saves empty WorldSet via `apiSaveWorldSet`, refreshes list, calls `setActiveWorldSet`, transitions to `nodes` view
- `handleDeleteClick`: sets `confirmDelete` state (shows inline confirm prompt, no immediate delete)
- `handleConfirmDelete`: deletes via `deleteWorldSet`, refreshes list, clears active if deleted WS was active
- `nodes` and `configure` views: stub placeholders for plan 04-02
- stopPropagation on inner `.dialog` div (prevents backdrop-click from bubbling through)

### Task 3 — MenuBar + App wiring

MenuBar:
- `onWorldSets: () => void` added to `MenuBarProps`
- Component destructuring updated to consume `onWorldSets`
- "World Sets..." `<li>` added to Edit menu after "Manage Tilesets..." (no disabled class)

App.tsx:
- `import { WorldSetDialog }` added
- `Dialog` type extended: `'new' | 'open' | 'tilesets' | 'worldSets' | null`
- `onWorldSets={() => setActiveDialog('worldSets')}` prop passed to `<MenuBar>`
- `{activeDialog === 'worldSets' && <WorldSetDialog onClose={() => setActiveDialog(null)} />}` render line added (not gated on `mapData`)

## Local State Shape of WorldSetDialog (for plan 04-02)

```typescript
type View = 'list' | 'nodes' | 'configure';
const [view, setView] = useState<View>('list');
const [worldSets, setWorldSets] = useState<string[]>([]);
const [newName, setNewName] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
const { activeWorldSetName, setActiveWorldSet } = useWorldSetStore();
```

Plan 04-02 will replace the `nodes` and `configure` stub branches in-place using `setView('configure')`.

## Integration Points Confirmed

| Point | Value |
|---|---|
| App.tsx Dialog union | `'new' \| 'open' \| 'tilesets' \| 'worldSets' \| null` |
| MenuBar prop | `onWorldSets: () => void` |
| Dialog import | `import { WorldSetDialog } from './components/dialogs/WorldSetDialog'` |
| Render guard | Not gated on `mapData` (unlike TilesetDialog) |
| Store hook | `useWorldSetStore()` — imports `activeWorldSetName`, `setActiveWorldSet` |
| API imports | `listWorldSets`, `saveWorldSet as apiSaveWorldSet`, `deleteWorldSet` |

## Test Count Delta

| Suite | Before | After | Delta |
|---|---|---|---|
| All Vitest tests | 87 | 90 | +3 |
| worldSetDialog.test.ts | 0 | 3 | +3 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| File | View | Description |
|---|---|---|
| `frontend/src/components/dialogs/WorldSetDialog.tsx` | `nodes` view | Placeholder text: "Node management view — implemented in plan 04-02." |
| `frontend/src/components/dialogs/WorldSetDialog.tsx` | `configure` view | Placeholder text: "Configure view — implemented in plan 04-02." |

These stubs are intentional — plan 04-02 replaces them with full node management UI. The plan's core goal (list view CRUD + dialog wiring) is fully achieved.

## Self-Check: PASSED
