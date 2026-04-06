# Requirements: Fantasy RPG Map Editor — World Sets

**Defined:** 2026-04-06
**Core Value:** A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## v1 Requirements

### Data Model

- [ ] **DATA-01**: `MapScale` interface has `feetPerUnit: number`; all 8 presets updated with correct feet-per-unit values
- [ ] **DATA-02**: `TmjMap` has `feetPerUnit?: number` field; populated when a map scale preset is selected or manually set
- [ ] **DATA-03**: `WorldSetNode` type defined with `mapName`, `parentMapName`, `parentAnchor`, `z`, `zLabel` fields
- [ ] **DATA-04**: `WorldSet` type defined with `name`, `version`, `nodes` fields
- [ ] **DATA-05**: `computeFootprint(childWidth, childHeight, childFPU, parentFPU, anchor)` returns `{colMin, colMax, rowMin, rowMax}` using floor-center anchoring rule
- [ ] **DATA-06**: `detectOverlaps(nodes, candidate)` returns overlapping node pairs at the same Z level

### Server API

- [ ] **API-01**: `GET /api/world_sets` returns sorted list of world set names
- [ ] **API-02**: `GET /api/world_sets/{name}` returns world set JSON
- [ ] **API-03**: `POST /api/world_sets/{name}` creates or replaces a world set file
- [ ] **API-04**: `DELETE /api/world_sets/{name}` deletes a world set file
- [ ] **API-05**: World set files stored in `world_sets/` directory as `{name}.worldset.json`
- [ ] **API-06**: World set API functions available in `frontend/src/api/client.ts` (`listWorldSets`, `getWorldSet`, `saveWorldSet`, `deleteWorldSet`)
- [ ] **API-07**: Python tests cover all 4 endpoints including error cases

### Store

- [ ] **STORE-01**: `worldSetStore` has `activeWorldSetName: string | null` and `activeWorldSet: WorldSet | null`
- [ ] **STORE-02**: `setActiveWorldSet(name | null)` loads world set from server and sets it as active; null clears active
- [ ] **STORE-03**: `addNode(node)` adds a node, enforcing no-duplicate and no-cycle invariants (hard block with error); warns on scale inversion and same-Z overlap
- [ ] **STORE-04**: `removeNode(mapName)` removes a node and all its descendants from the world set
- [ ] **STORE-05**: `updateNode(mapName, changes)` updates a node's anchor, Z, zLabel
- [ ] **STORE-06**: `saveWorldSet()` persists current world set to server
- [ ] **STORE-07**: Computed helpers `childrenOf(mapName)`, `parentOf(mapName)`, `rootNodes()` available
- [ ] **STORE-08**: `navigateToMap(name, { saveFirst })` utility handles dirty-map guard + fetch + `mapStore.loadMap()` sequence; used by all navigation triggers
- [ ] **STORE-09**: Frontend tests cover store actions, `computeFootprint`, and `detectOverlaps`

### Management Dialog

- [ ] **DIALOG-01**: User can open a "World Sets" dialog from the menu bar
- [ ] **DIALOG-02**: Dialog lists all world sets; user can create a new world set with a name
- [ ] **DIALOG-03**: User can delete a world set with confirmation
- [ ] **DIALOG-04**: User can add a map to the active world set, selecting parent + anchor + Z + zLabel
- [ ] **DIALOG-05**: Map picker in dialog shows each map's scale label (`feetPerUnit`); maps without `feetPerUnit` show "No scale set — click to set" with inline scale picker
- [ ] **DIALOG-06**: Dialog shows inline validation warnings (scale inversion, overlap) when adding/editing a node
- [ ] **DIALOG-07**: User can remove a map node from the active world set via the dialog

### Hierarchy Panel

- [ ] **PANEL-01**: Left panel shows collapsible tree of the active world set's map hierarchy
- [ ] **PANEL-02**: Clicking a map node in the panel navigates to that map (with dirty-map guard: Save / Discard / Cancel prompt)
- [ ] **PANEL-03**: Nodes with validation issues (missing scale, overlap, scale inversion, missing map) show warning badges
- [ ] **PANEL-04**: Node context menu: "Add child here", "Remove from world set", "Change parent"
- [ ] **PANEL-05**: Panel is hidden when no world set is active

### Canvas Integration

- [ ] **CANVAS-01**: When a world set is active, the canvas renders child footprint outlines for children of the current map
- [ ] **CANVAS-02**: Each footprint is labeled with the child map's name
- [ ] **CANVAS-03**: Children with no `feetPerUnit` show a 1×1 placeholder footprint in warning color with `?` label
- [ ] **CANVAS-04**: Hovering a footprint shows a tooltip with child map name and scale
- [ ] **CANVAS-05**: Clicking a footprint navigates to that child map (with dirty-map guard)
- [ ] **CANVAS-06**: Status bar shows parent breadcrumb when the current map has a parent in the active world set; clicking it navigates to the parent

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
| DATA-01 – DATA-06 | Phase 1 | Pending |
| API-01 – API-07 | Phase 2 | Pending |
| STORE-01 – STORE-09 | Phase 3 | Pending |
| DIALOG-01 – DIALOG-07 | Phase 4 | Pending |
| PANEL-01 – PANEL-05 | Phase 5 | Pending |
| CANVAS-01 – CANVAS-06 | Phase 6 | Pending |
| CTX-01 – CTX-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initialization*
