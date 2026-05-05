---
phase: 04-management-dialog
plan: "02"
subsystem: frontend/dialog
tags: [world-sets, dialog, react, vitest, configure-view, nodes-view]
dependency_graph:
  requires: [04-management-dialog-01]
  provides: [WorldSetDialog.nodes-view, WorldSetDialog.configure-view]
  affects: [frontend/src/components/dialogs/WorldSetDialog.tsx, frontend/src/__tests__/worldSetDialog.test.ts]
tech_stack:
  added: []
  patterns: [d03-sequence, warn-but-allow, mapDataCache, computeFootprint, detectOverlaps]
key_files:
  created: []
  modified:
    - frontend/src/components/dialogs/WorldSetDialog.tsx
    - frontend/src/__tests__/worldSetDialog.test.ts
decisions:
  - "effectiveChildFPU removed — computed but unused in JSX; noUnusedLocals would reject it"
  - "resetConfigureForm expanded in Task 2 in-place (no stub needed) — cleaner than two-step placeholder"
  - "needsScale = !feetPerUnit AND !scale — per Pitfall 1, a map with scale but no feetPerUnit is treated as already-scaled"
metrics:
  duration_seconds: 480
  completed_date: "2026-05-05"
  tasks_completed: 2
  files_changed: 2
---

# Phase 4 Plan 02: WorldSetDialog Nodes + Configure Views Summary

Full nodes view (DIALOG-07 remove) and configure view (DIALOG-04 add, DIALOG-05 conditional scale picker with write-back, DIALOG-06 scale-inversion + footprint-overlap warnings) replacing the plan 04-01 stubs in WorldSetDialog.tsx, with 5 new Vitest contract tests.

## What Was Built

### Task 1 — Nodes view (DIALOG-07 remove + transition to configure)

`WorldSetDialog.tsx` nodes view branch replaced the placeholder with:
- `mapDataCache: Record<string, TmjMap>` — lazy-loaded map metadata for scale label display
- `useEffect` loading cache entries for all nodes when entering nodes view
- `nodeScaleLabel(mapName)` helper resolving scale via `MAP_SCALE_BY_ID` + `scaleLabel()`
- `handleRemoveNode(mapName)` — `removeNode(mapName)` then `await saveWorldSet()`
- Node list rendered with scale label and Remove button per row
- "Add map node" button calling `resetConfigureForm()` then transitioning to configure view
- `resetConfigureForm()` placeholder (expanded in Task 2)

### Task 2 — Configure view (DIALOG-04 add, DIALOG-05 scale picker, DIALOG-06 warnings) + tests

**Configure-view state added:**
```typescript
allMaps, selectedMap, selectedMapData, parentMapName,
anchorCol, anchorRow, z, zLabel, chosenScale, warnings
```

**`handleAddNode` implements D-03 sequence:**
1. If `needsScale`: `await saveMap(selectedMap, { ...mapData, feetPerUnit, scale })` first
2. Client-side warnings: scale inversion (childFPU >= parentFPU at same Z), footprint overlap via `computeFootprint` + `detectOverlaps`
3. `addNode(node)` — hard block returns `ok:false` → show error, skip saveWorldSet
4. `await saveWorldSet()` — only on `ok:true`
5. `setView('nodes')` — transition back

**Configure-view JSX fields (per UI-SPEC View 3):**
- Map select (with dynamic `allMaps` list from `listMaps()`)
- Scale picker `.dialog-row` — visible only when `needsScale === true`
- Parent select (`None (root)` + existing nodes excluding self)
- Anchor col/row inputs — visible only when `parentMapName !== null`
- Z level number input
- Z label text input (optional)
- `.dialog-warn` block for warnings, `.dialog-error` block for hard errors

**5 new tests in `worldSetDialog.test.ts`:**
| Test | Req | What it verifies |
|---|---|---|
| DIALOG-04 | DIALOG-04 | addNode called with full WorldSetNode shape; saveWorldSet runs after |
| DIALOG-05 write-back | DIALOG-05 | saveMap called with feetPerUnit before addNode when map lacks scale |
| DIALOG-05 no write-back | DIALOG-05 | saveMap NOT called when map already has feetPerUnit |
| DIALOG-06 | DIALOG-06 | addNode hard-error: ok:false returned; saveWorldSet NOT called |
| DIALOG-07 | DIALOG-07 | removeNode + saveWorldSet sequence; persisted without the removed node |

## D-03 Sequence Implementation Notes

Implemented exactly as specified in CONTEXT.md:
1. Scale write-back (`saveMap`) happens before `addNode` — map file must have `feetPerUnit` before the node is added to the world set
2. Client-side warnings are computed between the write-back and the `addNode` call using the updated `finalMapData`
3. Hard errors from `addNode` (dup, cycle, inconsistent parent link) suppress `saveWorldSet`
4. Soft warnings (`result.warnings`) are surfaced and merged with client-side `localWarnings` — Add still proceeds

## Client-Side Warning Algorithm

### Scale inversion warning
Condition: `childFPU >= parentFPU` (child is same size or larger than parent at same Z)  
Detection: fetch parent map data (from cache or `getMap`), compare `feetPerUnit` fields  
Display: `.dialog-warn` with `Scale inversion: this map is the same size or larger than its parent.`

### Footprint overlap warning
Condition: candidate footprint AABB intersects any sibling footprint at same parent + same Z  
Detection: `computeFootprint(childW, childH, childFPU, parentFPU, anchor)` + `detectOverlaps([candidate, ...siblings])`  
Display: `.dialog-warn` with `Footprint overlaps with '{other}' at the same Z level.`  
Note: sibling data must be in `mapDataCache`; siblings without cached data are skipped (warn when data available)

## Test Count Delta

| Suite | Before | After | Delta |
|---|---|---|---|
| All Vitest tests | 90 | 95 | +5 |
| worldSetDialog.test.ts | 3 | 8 | +5 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `effectiveChildFPU` computed variable**
- **Found during:** Task 2 TypeScript check
- **Issue:** The plan spec included `effectiveChildFPU` as a derived state declaration, but it is not consumed in the JSX or handlers. `noUnusedLocals` would reject it.
- **Fix:** Removed the variable entirely. The actual child FPU resolution is done inline within `handleAddNode` using identical logic.
- **Files modified:** `frontend/src/components/dialogs/WorldSetDialog.tsx`

None other — plan executed as specified.

## Open Questions for Plan 04-03 (Manual Smoke Test Focus Areas)

1. **Scale picker filter**: verify that tile-orientation maps only show tile-scale options and hex-orientation maps only show hex-scale options in the configure view
2. **Anchor inputs visibility**: confirm they appear/disappear correctly on parent select change
3. **Scale inversion warning**: create a child map with larger `feetPerUnit` than parent — warning should appear but Add should succeed
4. **Footprint overlap warning**: add two sibling maps at same anchor and Z — warning should appear but Add should succeed
5. **Remove cascade**: remove a parent node — all descendant nodes should also disappear from the list
6. **Hard error display**: attempt to add the same map twice — `.dialog-error` should appear, Add stays blocked
7. **mapDataCache loading**: node list should show "(loading...)" briefly then resolve to scale label
8. **Create flow end-to-end**: create new world set → add root node → add child node with parent/anchor → nodes view shows both

## Known Stubs

None — all three views (list, nodes, configure) are fully implemented.

## Self-Check: PASSED
