---
phase: 05-hierarchy-panel
plan: 03
subsystem: ui
tags: [react, typescript, zustand, worldset, hierarchy-panel, navigation]

requires:
  - phase: 05-hierarchy-panel plan 01
    provides: CSS classes, getWarnings/toggleCollapse/isNodeCollapsed utilities, CollapseState type
  - phase: 05-hierarchy-panel plan 02
    provides: WorldSetDialog edit-mode props, OpenWorldSetDialogArgs interface shape
  - phase: 03-world-set-store plan 02
    provides: navigateToMap utility, dirty-map guard pattern
  - phase: 03-world-set-store plan 01
    provides: worldSetStore with rootNodes, childrenOf, removeNode, saveWorldSet, setActiveWorldSet

provides:
  - WorldHierarchyPanel React component (frontend/src/components/WorldHierarchyPanel.tsx)
  - OpenWorldSetDialogArgs exported interface
  - Logic-contract tests for PANEL-01..05 (frontend/src/__tests__/worldHierarchyPanel.test.ts)

affects: [05-04-plan, App.tsx integration, canvas overlay]

tech-stack:
  added: []
  patterns:
    - "Null-guard pattern: component returns null when activeWorldSetName === null (PANEL-05)"
    - "mapDataCache useEffect: fetch TmjMap per node on activeWorldSet change, prevents spurious badges before load (Pitfall 2)"
    - "Context menu positioned via position:fixed with clientX/clientY — no portal needed (UI-SPEC)"
    - "setTimeout(0) deferred document listener registration prevents self-closing context menu (Pitfall 4)"
    - "Dirty-guard dialog inline in component — saves/discards then calls navigateToMap"

key-files:
  created:
    - frontend/src/components/WorldHierarchyPanel.tsx
    - frontend/src/__tests__/worldHierarchyPanel.test.ts
  modified: []

key-decisions:
  - "mapDataCache stale-entry: useEffect deps on activeWorldSet; namesToFetch filters already-cached entries — prevents re-fetches on unrelated re-renders"
  - "Tooltip uses direct child div with position:fixed rather than portal — matches Plan 01 CSS contract"
  - "handleRemove is async to await saveWorldSet() after removeNode — ensures persistence before UI update"

patterns-established:
  - "WorldHierarchyPanel prop: onOpenWorldSetDialog(args: OpenWorldSetDialogArgs) — Plan 04 App.tsx passes dialog open handler"
  - "Context menu uses stopPropagation on mousedown/click to prevent document listener from immediately closing it"

requirements-completed: [PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05]

duration: 8min
completed: 2026-05-07
---

# Phase 5 Plan 03: WorldHierarchyPanel Component Summary

**Full WorldHierarchyPanel React component with collapsible tree, dirty-guard dialog, warning badges, context menu, and world-set switcher header — returns null when no world set is active**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-07T12:53:17Z
- **Completed:** 2026-05-07T12:55:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `WorldHierarchyPanel.tsx` implementing all 5 PANEL requirements: collapsible tree (PANEL-01), dirty-guard navigation dialog (PANEL-02), warning badge display (PANEL-03), context menu actions (PANEL-04), null-guard when inactive (PANEL-05)
- Created `worldHierarchyPanel.test.ts` with 9 logic-contract tests covering all requirements without JSX rendering
- Full test suite passes: 126 Vitest tests, TypeScript strict clean

## Component Exported API

- `export const WorldHierarchyPanel: React.FC<Props>` — main component
- `export interface OpenWorldSetDialogArgs { initialView?, initialParentMapName?, initialMapName? }` — prop shape for dialog integration

### Props

```typescript
interface Props {
  onOpenWorldSetDialog: (args: OpenWorldSetDialogArgs) => void;
}
```

### CSS Classes Used (from Plan 01)

`hierarchy-panel`, `hierarchy-header`, `hierarchy-switcher`, `hierarchy-tree`, `hierarchy-node`, `hierarchy-toggle`, `hierarchy-badge`, `hierarchy-ctx-menu`, `hierarchy-tooltip`, `panel-empty`, `dialog-backdrop`, `dialog`, `dialog-title`, `dialog-buttons`, `btn-secondary`, `btn-danger`, `btn-primary`, `layer-name`

### Store Hookups

- `useWorldSetStore`: `activeWorldSetName`, `activeWorldSet`, `setActiveWorldSet`, `removeNode`, `saveWorldSet`, `rootNodes`, `childrenOf`
- `useMapStore`: `isDirty`, `mapName` (currentMapName)
- `navigateToMap` from `utils/navigation` — single entry point for all navigation
- `getWarnings`, `toggleCollapse`, `isNodeCollapsed` from `utils/hierarchyPanelLogic`
- `listWorldSets`, `listMaps`, `getMap` from `api/client`

## Pitfall Mitigations Applied

1. **Pitfall 1** (scale resolution): Uses `getWarnings()` from Plan 01 which calls `resolveFeetPerUnit()` — handles missing scale gracefully
2. **Pitfall 2** (spurious badges): `getWarnings()` returns `[]` when `mapDataCache[name]` is undefined — no badge before data loads
3. **Pitfall 3** (stale mapDataCache): `namesToFetch` filters entries already in cache — avoids refetching every render
4. **Pitfall 4** (context menu self-close): `setTimeout(0)` defers global `mousedown`/`keydown` registration — avoids catching the triggering click
5. **Pitfall 5** (edit-mode useEffect): Not applicable to this component (no edit mode here — handled in Plan 02 dialog)
6. **Pitfall 7** (collapse state key): `toggleCollapse` keyed by `(worldSetName, mapName)` via `CollapseState` outer Record — survives world set switches

## Test Count by Requirement

| Requirement | Tests | Description |
|-------------|-------|-------------|
| PANEL-01 | 1 | collapse toggle contract (toggle once = collapsed, twice = expanded) |
| PANEL-02 | 4 | navigation happy path, dirty-guard no-nav, save path, discard path |
| PANEL-03 | 0 direct | covered by Plan 01 hierarchyPanelLogic.test.ts (19 tests for getWarnings) |
| PANEL-04 | 3 | handleRemove sequence, Add child here args, Change parent args |
| PANEL-05 | 1 | null when activeWorldSetName is null |
| **Total** | **9** | all in worldHierarchyPanel.test.ts |

## Task Commits

1. **Task 1: Implement WorldHierarchyPanel.tsx component** - `feda1ac` (feat)
2. **Task 2: Add WorldHierarchyPanel logic-contract tests** - `1f0be0c` (test)

## Deviations from Plan

None — plan executed exactly as written. Component skeleton from plan was used verbatim; all literal copy strings and CSS class names match UI-SPEC requirements.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 04 (App.tsx integration) can now mount `<WorldHierarchyPanel onOpenWorldSetDialog={...} />` and pass the existing dialog open callback
- Component is fully self-contained — only requires `onOpenWorldSetDialog` prop from App.tsx
- No stubs: tree renders real data from `worldSetStore`, warnings drive real badge display

---
*Phase: 05-hierarchy-panel*
*Completed: 2026-05-07*
