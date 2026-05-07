# Roadmap: Fantasy RPG Map Editor — World Sets Milestone

## Overview

This milestone adds the World Sets feature to a fully working brownfield web app. Starting from pure data types and utilities, the work builds upward through a server API, a Zustand store, and four UI layers (management dialog, hierarchy panel, canvas overlay, context menu) until a GM can click from a world map down to a dungeon room and back — with every level of geography connected and browsable.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - Types, scale values, and pure computation utilities (completed 2026-04-06)
- [x] **Phase 2: Server API** - CRUD endpoints, client functions, and Python tests (completed 2026-04-20)
- [x] **Phase 3: World Set Store** - Zustand store, navigation utility, and frontend tests (completed 2026-04-24)
- [ ] **Phase 4: Management Dialog** - Full world set CRUD and node editing UI
- [ ] **Phase 5: Hierarchy Panel** - Collapsible tree panel with navigation and context menu
- [ ] **Phase 6: Canvas Integration** - Footprint overlay, click-to-navigate, status bar breadcrumb
- [ ] **Phase 7: Context Menu** - Right-click "Add child here" with mini-dialog

## Phase Details

### Phase 1: Data Foundation
**Goal**: The pure data layer for World Sets exists — types are defined, scale values are correct, and computation utilities produce verifiable results with no UI or server needed
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06
**Success Criteria** (what must be TRUE):
  1. `MapScale` interface includes `feetPerUnit` and all 8 presets have correct feet-per-unit values (Room = 1 ft through World = 2,640,000 ft)
  2. `TmjMap` accepts `feetPerUnit?: number` and the field is written when a scale preset is selected
  3. `WorldSetNode` and `WorldSet` TypeScript types are defined in `frontend/src/types/worldSet.ts` and match the `.worldset.json` file format
  4. `computeFootprint()` returns correct `{colMin, colMax, rowMin, rowMax}` using floor-center anchoring for both odd and even footprint dimensions
  5. `detectOverlaps()` correctly identifies pairs of nodes at the same Z level whose footprints intersect
**Plans**: TBD
**UI hint**: no

### Phase 2: Server API
**Goal**: World set files can be created, read, and deleted on the server via a working REST API, with client functions available in the frontend and all endpoints covered by Python tests
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE):
  1. `GET /api/world_sets` returns a sorted list of world set names from the `world_sets/` directory
  2. `GET /api/world_sets/{name}` returns the full world set JSON; 404 for missing names
  3. `POST /api/world_sets/{name}` writes a `{name}.worldset.json` file; `DELETE /api/world_sets/{name}` removes it
  4. Frontend `client.ts` exports `listWorldSets`, `getWorldSet`, `saveWorldSet`, and `deleteWorldSet` functions that call the correct endpoints
  5. Python test suite in `tests/api/test_world_sets.py` covers all four endpoints including 404 and delete-of-nonexistent error cases
**Plans**: 2 plans
  - [x] 02-01-PLAN.md — Backend: FastAPI world_sets router + main.py registration + conftest fixtures + pytest integration tests
  - [x] 02-02-PLAN.md — Frontend: add world set client functions to frontend/src/api/client.ts (typed fetch wrappers)

### Phase 3: World Set Store
**Goal**: Application state for the active world set is fully managed in `worldSetStore.ts`, all store actions enforce the correct invariants, and the shared navigation utility handles the dirty-map guard so all future navigation triggers have a single, tested entry point
**Depends on**: Phase 2
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07, STORE-08, STORE-09
**Success Criteria** (what must be TRUE):
  1. `setActiveWorldSet(name)` loads the world set from the server and sets `activeWorldSetName` and `activeWorldSet`; passing null clears both
  2. `addNode()` blocks duplicate mapNames and cycles with an error; emits warnings (not errors) for scale inversion and same-Z overlap
  3. `removeNode()` removes a node and all its descendants; `updateNode()` patches anchor, Z, and zLabel cleanly
  4. `navigateToMap(name, { saveFirst })` prompts Save / Discard / Cancel when the map is dirty before loading the new map
  5. Frontend tests verify store actions, `computeFootprint` edge cases (even/odd dimensions), and `detectOverlaps` with overlapping and non-overlapping pairs
**Plans**: 3 plans
  - [x] 03-01-PLAN.md — worldSetStore.ts: state, setActiveWorldSet, saveWorldSet, mutations (addNode/removeNode/updateNode), and computed helpers (STORE-01..07)
  - [x] 03-02-PLAN.md — navigation.ts: standalone navigateToMap utility with dirty-map guard (STORE-08)
  - [x] 03-03-PLAN.md — Vitest coverage: worldSetStore.test.ts + navigation.test.ts (STORE-09)

### Phase 4: Management Dialog
**Goal**: A user can open a dialog from the menu bar to manage the full lifecycle of world sets — creating, deleting, and populating them with map nodes — including inline scale assignment for maps that lack one
**Depends on**: Phase 3
**Requirements**: DIALOG-01, DIALOG-02, DIALOG-03, DIALOG-04, DIALOG-05, DIALOG-06, DIALOG-07
**Success Criteria** (what must be TRUE):
  1. "World Sets…" appears in the menu bar and opens the dialog; the dialog lists all world sets and has a "Create" action
  2. User can delete a world set after confirming; deletion is reflected immediately in the list
  3. User can add a map to the active world set by choosing parent, anchor cell, Z, and optional Z label
  4. Maps without `feetPerUnit` show "No scale set — click to set" with an inline picker that writes the value back to the map before the node is added
  5. Inline validation warnings appear for scale inversion and footprint overlap as the user configures a node
**Plans**: 3 plans
  - [x] 04-01-PLAN.md — Vitest scaffold + WorldSetDialog list view (create/delete) + MenuBar/App wiring (DIALOG-01..03)
  - [x] 04-02-PLAN.md — Nodes view (DIALOG-07) + Configure view with scale picker and warnings (DIALOG-04..06)
  - [ ] 04-03-PLAN.md — Manual smoke test checkpoint (DIALOG-01, DIALOG-05 visual gates)
**UI hint**: yes

### Phase 5: Hierarchy Panel
**Goal**: The left panel shows the active world set as a navigable, collapsible tree — complete with validation badges and a context menu for structural edits — and is hidden when no world set is active
**Depends on**: Phase 4
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05
**Success Criteria** (what must be TRUE):
  1. When a world set is active, the left panel shows a collapsible tree of its maps in parent-child order; the panel is absent when no world set is active
  2. Clicking a map node in the panel navigates to that map; if the current map has unsaved changes, a Save / Discard / Cancel prompt appears first
  3. Nodes with missing scale, overlap, scale inversion, or missing map show a visible warning badge
  4. Right-clicking a node shows a context menu with "Add child here", "Remove from world set", and "Change parent" options
**Plans**: 4 plans
  - [x] 05-01-PLAN.md — CSS spec append + hierarchyPanelLogic utilities + Wave 0 unit tests (PANEL-01, PANEL-03, PANEL-05)
  - [ ] 05-02-PLAN.md — Extend WorldSetDialog with edit-mode props (initialView/initialParentMapName/initialMapName) for context menu wiring (PANEL-04)
  - [ ] 05-03-PLAN.md — WorldHierarchyPanel component: tree render, collapse, dirty-guard navigation, context menu, warning badges (PANEL-01..05)
  - [ ] 05-04-PLAN.md — App.tsx integration + resize handle + manual smoke checkpoint (PANEL-01..05)
**UI hint**: yes

### Phase 6: Canvas Integration
**Goal**: The map canvas visualizes the world set by rendering child footprint outlines directly on the map, and the status bar provides a parent breadcrumb so the user can navigate up and down the hierarchy entirely from the canvas
**Depends on**: Phase 5
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05, CANVAS-06
**Success Criteria** (what must be TRUE):
  1. When a world set is active, the canvas renders outlined footprint regions for each child of the current map, labeled with the child map's name
  2. Children with no `feetPerUnit` show a 1×1 placeholder footprint in warning color with a `?` label rather than being silently omitted
  3. Hovering a footprint shows a tooltip with the child map name and scale; clicking it navigates to that child (with dirty-map guard)
  4. The status bar shows a parent breadcrumb when the current map has a parent in the active world set; clicking the breadcrumb navigates up to the parent
**Plans**: TBD
**UI hint**: yes

### Phase 7: Context Menu
**Goal**: Right-clicking the canvas when a world set is active gives the user a fast path to add a child map at any cell — with the anchor pre-filled — including inline scale assignment if the chosen map lacks one
**Depends on**: Phase 6
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04
**Success Criteria** (what must be TRUE):
  1. Right-clicking the canvas when a world set is active shows a context menu containing an "Add child map here" option
  2. The mini-dialog that opens has the anchor pre-filled from the right-clicked cell; the user can pick an existing map or indicate a new one, and set Z and optional label
  3. If the selected map has no `feetPerUnit`, the dialog includes a scale picker that writes `feetPerUnit` back to the map before adding the node to the world set
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 1/1 | Complete   | 2026-04-06 |
| 2. Server API | 2/2 | Complete   | 2026-04-20 |
| 3. World Set Store | 3/3 | Complete   | 2026-04-24 |
| 4. Management Dialog | 2/3 | In Progress|  |
| 5. Hierarchy Panel | 1/4 | In Progress|  |
| 6. Canvas Integration | 0/? | Not started | - |
| 7. Context Menu | 0/? | Not started | - |
