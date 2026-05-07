---
phase: 05-hierarchy-panel
plan: "01"
subsystem: frontend/utils
tags: [css, pure-functions, validation, collapse-state, tdd, vitest]
dependency_graph:
  requires: []
  provides: [hierarchy-panel-css, hierarchy-panel-logic]
  affects: [frontend/src/App.css, frontend/src/utils/hierarchyPanelLogic.ts]
tech_stack:
  added: []
  patterns: [pure-function-utility, tdd-red-green, immutable-state-update]
key_files:
  created:
    - frontend/src/utils/hierarchyPanelLogic.ts
    - frontend/src/__tests__/hierarchyPanelLogic.test.ts
  modified:
    - frontend/src/App.css
decisions:
  - getWarnings returns [] when map not in cache — prevents spurious badges before data loads (Pitfall 2)
  - toggleCollapse always returns new outer Record — immutability contract for React state
  - WarningContext consolidates all lookup tables into one parameter — keeps function signatures stable as new checks are added
metrics:
  duration: 3 min
  completed: "2026-05-07T12:48:35Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 5 Plan 01: CSS Foundation and Pure Logic Summary

Wave-0 foundation for hierarchy panel: 14 CSS classes appended to App.css and pure validation/collapse logic in a testable utility module, with 19 unit tests covering PANEL-01 (collapse) and PANEL-03 (warnings).

## What Was Built

### Task 1: Hierarchy Panel CSS Classes (commit: 716fc4b)

Appended a new `/* Hierarchy panel */` section to the END of `frontend/src/App.css` (lines 344–461). Added exactly 14 CSS class blocks as specified in the UI-SPEC:

| Class | Lines | Purpose |
|-------|-------|---------|
| `.hierarchy-panel` | 346–349 | Wrapper: flex-column, overflow:hidden |
| `.hierarchy-header` | 351–361 | Header row: 11px/600 uppercase, space-between |
| `.hierarchy-switcher` | 363–371 | World set `<select>` or `<span>` |
| `.hierarchy-tree` | 373–378 | Scrollable tree `<ul>` |
| `.hierarchy-node` | 380–387 | Tree row: flex, 8px/12px padding, min-height:28px |
| `.hierarchy-node:hover` | 388 | Hover: `#2a2a2a` |
| `.hierarchy-node.active` | 389 | Active: `#283a50` (mirrors `.layer-item.active`) |
| `.hierarchy-toggle` | 391–399 | Collapse button: 12px wide, color:#888 |
| `.hierarchy-badge` | 401–406 | Warning glyph: amber `#fbbf24`, 11px |
| `.hierarchy-tooltip` | 408–418 | Tooltip: `position: fixed`, amber on dark-amber bg |
| `.panel-resize-handle` | 420–423 | Drag strip: 4px tall, `cursor: ns-resize` |
| `.panel-resize-handle:hover` | 424 | Hover: `#444` |
| `.hierarchy-ctx-menu` | 426–434 | Context menu: `position: fixed`, `#2d2d2d`, z-index:1500 |
| `.hierarchy-ctx-menu li` | 435–439 | Menu items: 8px/16px padding, 13px font |
| `.hierarchy-ctx-menu li:hover` | 440 | Hover: `#3d3d3d` |
| `.hierarchy-ctx-menu li.danger` | 441 | Danger: `color: #fcc` |
| `.hierarchy-ctx-menu li.danger:hover` | 442 | Danger hover: `background: #3a2222` |

Both `.hierarchy-tooltip` and `.hierarchy-ctx-menu` use `position: fixed` (not absolute) to escape `overflow: hidden` on `.left-panel` — per UI-SPEC RESEARCH Pitfall 3 and Pitfall 7.

### Task 2: hierarchyPanelLogic.ts — Pure Validation and Collapse Logic (commit: f42050c)

**File:** `frontend/src/utils/hierarchyPanelLogic.ts`

Exported API:

```typescript
export type CollapseState = Record<string, Set<string>>;

export interface WarningContext {
  mapDataCache: Record<string, TmjMap>;
  knownMapNames: Set<string>;
  allNodes: WorldSetNode[];
}

export function resolveFeetPerUnit(data: TmjMap | undefined): number | undefined
export function getWarnings(node: WorldSetNode, ctx: WarningContext): string[]
export function toggleCollapse(state: CollapseState, worldSetName: string, mapName: string): CollapseState
export function isNodeCollapsed(state: CollapseState, worldSetName: string | null, mapName: string): boolean
```

Warning strings (verbatim from UI-SPEC Copywriting Contract):
- `"Missing map: '{mapName}' file not found"`
- `"Missing scale: no feetPerUnit set on this map"`
- `"Scale inversion: this map is the same size or larger than its parent"`
- `"Footprint overlap: conflicts with '{otherMap}' at the same Z level"`

### Task 2: Tests — hierarchyPanelLogic.test.ts (commit: f42050c)

19 tests across 4 describe blocks:

| describe block | Tests | Requirement |
|----------------|-------|-------------|
| `resolveFeetPerUnit` | 3 | PANEL-03 (scale resolution) |
| `getWarnings` | 8 | PANEL-03 (warning derivation) |
| `toggleCollapse` | 4 | PANEL-01 (collapse state) |
| `isNodeCollapsed` | 4 | PANEL-01 (collapse query) |

All 19 tests pass. Full suite: 114 tests across 9 files — no regressions.

## Verification

- `cd frontend && npm run test` — 114 passed (9 test files)
- `cd frontend && npx tsc --noEmit` — exits 0
- `grep -c "\.hierarchy-" frontend/src/App.css` — returns 15 (>= 12)

## Deviations from Plan

None — plan executed exactly as written. The `mkMap` factory in tests uses `orientation: 'orthogonal'` which is valid per `TmjMap` type definition.

## Known Stubs

None. This plan adds pure logic and CSS only — no component rendering, no data wiring.

## Self-Check: PASSED

- [x] `frontend/src/App.css` — exists, modified (461 lines, 120 added)
- [x] `frontend/src/utils/hierarchyPanelLogic.ts` — exists, created
- [x] `frontend/src/__tests__/hierarchyPanelLogic.test.ts` — exists, created
- [x] Commit `716fc4b` — exists (feat(05-01): CSS classes)
- [x] Commit `f42050c` — exists (feat(05-01): logic module + tests)
- [x] All 19 new tests pass; 114 total tests pass
- [x] TypeScript strict mode clean
