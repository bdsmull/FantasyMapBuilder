# World Set Feature — Requirements & Design Spec

Captured from planning session 2026-03-31.

---

## Decisions Summary

| # | Topic | Decision |
|---|---|---|
| 1 | Storage | Option A — separate `.worldset.json` file, authoritative source of truth. Maps stay clean. |
| 2 | Multi-world membership | A map may appear in multiple world sets. Allowed silently. |
| 3 | Multiple parents | One parent per map per world set. Hard rule. |
| 4 | Duplicate in same world set | Blocked with error message. |
| 5 | Level (Z) | Integer + optional label string. |
| 6 | Coordinate system | Center-cell anchor `(col, row)` in parent grid. Footprint auto-computed from child dimensions × `feetPerUnit`. No sub-tile precision. |
| 7 | Footprint anchor | Center of child map. Floor() used for even-sized footprint dimensions (asymmetry goes bottom-right). |
| 8 | Scale unit size | Add `feetPerUnit: number` to `MapScale`. Used for footprint math and scale-order warnings. |
| 9 | Overlap detection | Warn-but-allow for same Z + overlapping footprints. Checked at placement and shown persistently in hierarchy panel. |
| 10 | Scale enforcement | Warn-but-allow when `child.feetPerUnit >= parent.feetPerUnit`. Use `feetPerUnit` for comparison (not array index). |
| 11 | Standalone maps | Valid permanent state. Can be added to world sets at any time via the world set management dialog. |
| 12 | Persistence | Server-managed in `world_sets/` subdirectory alongside `maps/`. |
| 13 | UI scope | All 5 interactions: hierarchy panel, click-to-navigate, footprint overlay, "add child here" context menu, world set management dialog. |

---

## Data Model

### Updated `MapScale` (`frontend/src/data/mapScales.ts`)

```typescript
export interface MapScale {
  id: string;
  label: string;
  unit: string;
  feetPerUnit: number;      // feet per tile/hex; drives footprint calc and scale ordering
  defaultShape: 'tile' | 'hex';
}
```

| Scale ID | Label | Unit | feetPerUnit | defaultShape |
|---|---|---|---|---|
| `room` | Room Scale | 1' square | 1 | tile |
| `building` | Building Scale | 5' square | 5 | tile |
| `dungeon` | Dungeon Scale | 10' square | 10 | tile |
| `town` | Town Scale | 30' hex | 30 | hex |
| `local` | Local Scale | 1 mile hex | 5,280 | hex |
| `kingdom` | Kingdom Scale | 5 mile hex | 26,400 | hex |
| `region` | Region Scale | 50 mile hex | 264,000 | hex |
| `world` | World Scale | 500 mile hex | 2,640,000 | hex |

### World Set File Format

Stored at: `<data_dir>/world_sets/<name>.worldset.json`

Flat node list with parent references (easier to query and update than a nested tree):

```json
{
  "name": "My World",
  "version": "1.0",
  "nodes": [
    {
      "mapName": "world-map",
      "parentMapName": null,
      "parentAnchor": null,
      "z": 0,
      "zLabel": null
    },
    {
      "mapName": "region-north",
      "parentMapName": "world-map",
      "parentAnchor": { "col": 3, "row": 5 },
      "z": 0,
      "zLabel": null
    },
    {
      "mapName": "inn-ground-floor",
      "parentMapName": "town-riverdale",
      "parentAnchor": { "col": 4, "row": 6 },
      "z": 0,
      "zLabel": "Ground Floor"
    },
    {
      "mapName": "inn-second-floor",
      "parentMapName": "town-riverdale",
      "parentAnchor": { "col": 4, "row": 6 },
      "z": 1,
      "zLabel": "Second Floor"
    }
  ]
}
```

**Invariants enforced by the system:**
- Each `mapName` appears at most once per world set (uniqueness enforced, hard block)
- `parentAnchor` is always set when `parentMapName` is set, and null when it isn't
- No cycles (the tree must remain a forest of directed trees)
- Multiple root nodes (null parent) are allowed

### TypeScript Types (`frontend/src/types/worldSet.ts`)

```typescript
export interface WorldSetNode {
  mapName: string;
  parentMapName: string | null;
  parentAnchor: { col: number; row: number } | null;
  z: number;
  zLabel?: string | null;
}

export interface WorldSet {
  name: string;
  version: string;
  nodes: WorldSetNode[];
}
```

---

## Server API

New file: `server/api/world_sets.py`

```
GET    /api/world_sets           -> string[]      list world set names
GET    /api/world_sets/{name}    -> WorldSet JSON  load one
POST   /api/world_sets/{name}    -> 200            create or replace
DELETE /api/world_sets/{name}    -> 200            delete
```

Registered in `server/main.py` under `/api` prefix.

---

## Footprint Calculation

Given a child map and its scale, and the parent's scale:

```
childFeetWide = child.mapData.width  × childScale.feetPerUnit
childFeetTall = child.mapData.height × childScale.feetPerUnit

fp_cols = ceil(childFeetWide / parentScale.feetPerUnit)
fp_rows = ceil(childFeetTall / parentScale.feetPerUnit)

// Footprint centered on anchor; floor() for even dimensions (asymmetry goes bottom-right)
col_min = anchor.col - floor(fp_cols / 2)
col_max = anchor.col + floor((fp_cols - 1) / 2)
row_min = anchor.row - floor(fp_rows / 2)
row_max = anchor.row + floor((fp_rows - 1) / 2)
```

Hex parents use the same formula, treating hex grid coordinates as rectangular (accepted approximation).

---

## Validation Rules

| Condition | Severity | Message |
|---|---|---|
| `mapName` already in world set | Error (block) | "'X' is already in this world set. Duplicate the map file first if you want a separate location." |
| `child.feetPerUnit >= parent.feetPerUnit` | Warning (allow) | "'X' (Y scale) is the same or larger scale than its parent 'Z' (W scale)." |
| Same Z, overlapping footprint, different mapNames | Warning (allow) | "'X' and 'Y' have overlapping footprints at level Z." |
| Referenced `mapName` not found on server | Warning (allow) | "Map 'X' is referenced in this world set but does not exist on the server." |

Warnings appear: (a) at the moment a relationship is created, and (b) as persistent badges on affected nodes in the hierarchy panel.

---

## New & Modified Files

### New files
| File | Purpose |
|---|---|
| `frontend/src/types/worldSet.ts` | TypeScript types for WorldSet and WorldSetNode |
| `frontend/src/store/worldSetStore.ts` | Zustand store for active world set state and actions |
| `frontend/src/components/WorldHierarchyPanel.tsx` | Tree view panel for the active world set |
| `frontend/src/components/dialogs/WorldSetDialog.tsx` | Create/manage/delete world sets |
| `frontend/src/canvas/worldSetOverlay.ts` | Renders child footprint overlays on the map canvas |
| `server/api/world_sets.py` | FastAPI CRUD endpoints for world set files |
| `tests/api/test_world_sets.py` | Python API tests |

### Modified files
| File | Change |
|---|---|
| `frontend/src/data/mapScales.ts` | Add `feetPerUnit` to all 8 scales; add `computeFootprint()` and `detectOverlaps()` helpers |
| `frontend/src/api/client.ts` | Add 4 world set API functions |
| `frontend/src/components/MapCanvas.tsx` | Render footprint overlay; click-to-navigate on child footprint cells |
| `frontend/src/components/MenuBar.tsx` | Add "World Sets…" menu item |
| `frontend/src/components/StatusBar.tsx` | Show world set name + parent breadcrumb link |
| `frontend/src/App.tsx` | Add world set dialog type; integrate hierarchy panel into layout |
| `server/main.py` | Register world_sets router |

---

## Implementation Task List

### Phase 1 — Foundation (no UI)
1. Add `feetPerUnit` to `MapScale` interface and update all 8 entries in `mapScales.ts`; add `computeFootprint(childMap, childScale, parentScale)` and `detectOverlaps(nodes, candidateNode)` utility functions
2. Create `frontend/src/types/worldSet.ts`
3. Create `server/api/world_sets.py` with GET /, GET /{name}, POST /{name}, DELETE /{name}
4. Register world_sets router in `server/main.py`
5. Add world set API functions to `frontend/src/api/client.ts`
6. Create `frontend/src/store/worldSetStore.ts` with full state and actions (`loadWorldSet`, `saveWorldSet`, `addNode`, `removeNode`, `updateNode`; computed helpers `childrenOf`, `parentOf`, `rootNodes`)
7. Write Python tests for world_sets API (`tests/api/test_world_sets.py`)
8. Write frontend tests for worldSetStore and footprint/overlap utilities

### Phase 2 — World Set Management Dialog
9. Create `WorldSetDialog.tsx`: list world sets; create new; rename; delete; add/remove map nodes with parent + anchor + Z assignment; show validation warnings inline
10. Add "World Sets…" to `MenuBar.tsx` and wire up in `App.tsx`

### Phase 3 — Hierarchy Panel
11. Create `WorldHierarchyPanel.tsx`: collapsible tree of the active world set; warning badges on nodes; click node to navigate (load that map); context menu: "Add child here", "Remove from world set", "Change parent"
12. Integrate panel into `App.tsx` layout (below `LayerPanel` in left panel, or new collapsible section)

### Phase 4 — Canvas Integration
13. Create `worldSetOverlay.ts`: render child footprint rectangles/hex outlines; label each with child map name; highlight on hover
14. Update `MapCanvas.tsx` to draw the overlay; handle pointer events on footprint cells (click → navigate to child; hover → tooltip)
15. Add parent breadcrumb to `StatusBar.tsx`; clicking it loads the parent map

### Phase 5 — "Add Child Here" Context Menu
16. Add right-click context menu to `MapCanvas.tsx` (when a world set is active and the map can have children)
17. "Add child map here" mini-dialog: anchor pre-filled from clicked cell; select existing map or create new; set Z and optional label
