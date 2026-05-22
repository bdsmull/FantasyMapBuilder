# Requirements: Fantasy RPG Map Editor — World Sets

**Defined:** 2026-04-06
**Core Value:** A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## v1 Requirements

### Data Model

- [x] **DATA-01**: `MapScale` interface has `feetPerUnit: number`; all 8 presets updated with correct feet-per-unit values
- [x] **DATA-02**: `TmjMap` has `feetPerUnit?: number` field; populated when a map scale preset is selected or manually set
- [x] **DATA-03**: `WorldSetNode` type defined with `mapName`, `parentMapName`, `parentAnchor`, `z`, `zLabel` fields
- [x] **DATA-04**: `WorldSet` type defined with `name`, `version`, `nodes` fields
- [x] **DATA-05**: `computeFootprint(childWidth, childHeight, childFPU, parentFPU, anchor)` returns `{colMin, colMax, rowMin, rowMax}` using floor-center anchoring rule
- [x] **DATA-06**: `detectOverlaps(nodes, candidate)` returns overlapping node pairs at the same Z level

### Server API

- [x] **API-01**: `GET /api/world_sets` returns sorted list of world set names
- [x] **API-02**: `GET /api/world_sets/{name}` returns world set JSON
- [x] **API-03**: `POST /api/world_sets/{name}` creates or replaces a world set file
- [x] **API-04**: `DELETE /api/world_sets/{name}` deletes a world set file
- [x] **API-05**: World set files stored in `world_sets/` directory as `{name}.worldset.json`
- [x] **API-06**: World set API functions available in `frontend/src/api/client.ts` (`listWorldSets`, `getWorldSet`, `saveWorldSet`, `deleteWorldSet`)
- [x] **API-07**: Python tests cover all 4 endpoints including error cases

### Store

- [x] **STORE-01**: `worldSetStore` has `activeWorldSetName: string | null` and `activeWorldSet: WorldSet | null`
- [x] **STORE-02**: `setActiveWorldSet(name | null)` loads world set from server and sets it as active; null clears active
- [x] **STORE-03**: `addNode(node)` adds a node, enforcing no-duplicate and no-cycle invariants (hard block with error); warns on scale inversion and same-Z overlap
- [x] **STORE-04**: `removeNode(mapName)` removes a node and all its descendants from the world set
- [x] **STORE-05**: `updateNode(mapName, changes)` updates a node's anchor, Z, zLabel
- [x] **STORE-06**: `saveWorldSet()` persists current world set to server
- [x] **STORE-07**: Computed helpers `childrenOf(mapName)`, `parentOf(mapName)`, `rootNodes()` available
- [x] **STORE-08**: `navigateToMap(name, { saveFirst })` utility handles dirty-map guard + fetch + `mapStore.loadMap()` sequence; used by all navigation triggers
- [x] **STORE-09**: Frontend tests cover store actions, `computeFootprint`, and `detectOverlaps`

### Management Dialog

- [x] **DIALOG-01**: User can open a "World Sets" dialog from the menu bar
- [x] **DIALOG-02**: Dialog lists all world sets; user can create a new world set with a name
- [x] **DIALOG-03**: User can delete a world set with confirmation
- [x] **DIALOG-04**: User can add a map to the active world set, selecting parent + anchor + Z + zLabel
- [x] **DIALOG-05**: Map picker in dialog shows each map's scale label (`feetPerUnit`); maps without `feetPerUnit` show "No scale set — click to set" with inline scale picker
- [x] **DIALOG-06**: Dialog shows inline validation warnings (scale inversion, overlap) when adding/editing a node
- [x] **DIALOG-07**: User can remove a map node from the active world set via the dialog

### Hierarchy Panel

- [x] **PANEL-01**: Left panel shows collapsible tree of the active world set's map hierarchy
- [x] **PANEL-02**: Clicking a map node in the panel navigates to that map (with dirty-map guard: Save / Discard / Cancel prompt)
- [x] **PANEL-03**: Nodes with validation issues (missing scale, overlap, scale inversion, missing map) show warning badges
- [x] **PANEL-04**: Node context menu: "Add child here", "Remove from world set", "Change parent"
- [x] **PANEL-05**: Panel is hidden when no world set is active

### Canvas Integration

- [x] **CANVAS-01**: When a world set is active, the canvas renders child footprint outlines for children of the current map
- [x] **CANVAS-02**: Each footprint is labeled with the child map's name
- [x] **CANVAS-03**: Children with no `feetPerUnit` show a 1×1 placeholder footprint in warning color with `?` label
- [x] **CANVAS-04**: Hovering a footprint shows a tooltip with child map name and scale
- [x] **CANVAS-05**: Clicking a footprint navigates to that child map (with dirty-map guard)
- [x] **CANVAS-06**: Status bar shows parent breadcrumb when the current map has a parent in the active world set; clicking it navigates to the parent

### Context Menu

- [ ] **CTX-01**: Right-clicking the canvas when a world set is active shows a context menu
- [ ] **CTX-02**: "Add child map here" option pre-fills anchor from the clicked cell
- [ ] **CTX-03**: Mini-dialog lets user pick an existing map (or create new) and set Z + optional label
- [ ] **CTX-04**: If the selected map has no `feetPerUnit`, the dialog includes a scale picker that writes `feetPerUnit` back to the map before adding the node

## v2 Requirements

- Map rename support (update all world set references when a map is renamed)
- World set export/import as a single archive (all referenced maps + world set file)
- Minimap view showing all maps in a world set at once
- Footprint preview while dragging anchor position in the dialog

## Out of Scope

| Feature | Reason |
|---|---|
| Server-side world set validation | Invariants enforced in frontend store; server is simple CRUD for a local tool |
| Map rename endpoint | Maps identified by filename; delete + re-upload is the current flow; world set references show "map not found" warning |
| Collaborative/multi-user editing | Single-user local tool; no auth, no conflict resolution |
| Sub-tile anchor precision | Center-cell anchor only; fractional positioning adds complexity with minimal benefit at these scales |
| Hex footprint exact geometry | Treat hex coords as rectangular for footprint math — accepted approximation |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| DATA-01 | Phase 1 — Data Foundation | Complete |
| DATA-02 | Phase 1 — Data Foundation | Complete |
| DATA-03 | Phase 1 — Data Foundation | Complete |
| DATA-04 | Phase 1 — Data Foundation | Complete |
| DATA-05 | Phase 1 — Data Foundation | Complete |
| DATA-06 | Phase 1 — Data Foundation | Complete |
| API-01 | Phase 2 — Server API | Complete (Plan 02-01) |
| API-02 | Phase 2 — Server API | Complete (Plan 02-01) |
| API-03 | Phase 2 — Server API | Complete (Plan 02-01) |
| API-04 | Phase 2 — Server API | Complete (Plan 02-01) |
| API-05 | Phase 2 — Server API | Complete (Plan 02-01) |
| API-06 | Phase 2 — Server API | Pending (Plan 02-02) |
| API-07 | Phase 2 — Server API | Complete (Plan 02-01) |
| STORE-01 | Phase 3 — World Set Store | Complete |
| STORE-02 | Phase 3 — World Set Store | Complete |
| STORE-03 | Phase 3 — World Set Store | Complete |
| STORE-04 | Phase 3 — World Set Store | Complete |
| STORE-05 | Phase 3 — World Set Store | Complete |
| STORE-06 | Phase 3 — World Set Store | Complete |
| STORE-07 | Phase 3 — World Set Store | Complete |
| STORE-08 | Phase 3 — World Set Store | Complete |
| STORE-09 | Phase 3 — World Set Store | Complete |
| DIALOG-01 | Phase 4 — Management Dialog | Complete |
| DIALOG-02 | Phase 4 — Management Dialog | Complete |
| DIALOG-03 | Phase 4 — Management Dialog | Complete |
| DIALOG-04 | Phase 4 — Management Dialog | Complete |
| DIALOG-05 | Phase 4 — Management Dialog | Complete |
| DIALOG-06 | Phase 4 — Management Dialog | Complete |
| DIALOG-07 | Phase 4 — Management Dialog | Complete |
| PANEL-01 | Phase 5 — Hierarchy Panel | Complete |
| PANEL-02 | Phase 5 — Hierarchy Panel | Complete |
| PANEL-03 | Phase 5 — Hierarchy Panel | Complete |
| PANEL-04 | Phase 5 — Hierarchy Panel | Complete |
| PANEL-05 | Phase 5 — Hierarchy Panel | Complete |
| CANVAS-01 | Phase 6 — Canvas Integration | Complete |
| CANVAS-02 | Phase 6 — Canvas Integration | Complete |
| CANVAS-03 | Phase 6 — Canvas Integration | Complete |
| CANVAS-04 | Phase 6 — Canvas Integration | Complete |
| CANVAS-05 | Phase 6 — Canvas Integration | Complete |
| CANVAS-06 | Phase 6 — Canvas Integration | Complete |
| CTX-01 | Phase 7 — Context Menu | Pending |
| CTX-02 | Phase 7 — Context Menu | Pending |
| CTX-03 | Phase 7 — Context Menu | Pending |
| CTX-04 | Phase 7 — Context Menu | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 — traceability expanded to individual requirements after roadmap creation*
