# Fantasy RPG Map Editor

## What This Is

A web-based tile map editor for fantasy RPG worldbuilding, accessible from desktop and tablet (iPad) on a local network. Users create and edit tile maps and hex maps at different geographic scales — from individual rooms up to world maps — and link them into a navigable hierarchy called a World Set.

## Core Value

A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## Requirements

### Validated

- ✓ Create, open, save, and delete maps in Tiled TMJ format — existing
- ✓ Upload and download `.tmj` map files — existing
- ✓ Paint, erase, and flood-fill tiles on tile and hex maps — existing
- ✓ Place and remove map objects on object layers — existing
- ✓ Multi-layer support (tile layers + object layers) with per-layer visibility — existing
- ✓ Undo/redo for tile edits (patch-based, one step per stroke or fill) — existing
- ✓ Zoom and pan canvas (mouse wheel + drag; pinch-zoom on tablet) — existing
- ✓ Tileset management (add, remove, switch active tileset) — existing
- ✓ Hex map rendering (flat-top and pointy-top, viewport culling, tile cache) — existing
- ✓ Map scale presets (Room → World, 8 levels) stored per map — existing
- ✓ FastAPI backend serving maps + tileset images; React SPA frontend — existing

### Active

**World Sets — Phase 1: Data Foundation**
- [ ] `TmjMap` stores `feetPerUnit: number` (feet per tile/hex cell); populated when a map scale preset is selected
- [ ] `MapScale` interface has `feetPerUnit`; all 8 presets updated with correct values
- [ ] `computeFootprint(childWidth, childHeight, childFeetPerUnit, parentFeetPerUnit, anchor)` utility returns bounding `{colMin, colMax, rowMin, rowMax}`
- [ ] `detectOverlaps(nodes, candidate, maps)` utility returns overlapping node pairs at same Z level
- [ ] `WorldSetNode` and `WorldSet` TypeScript types defined in `frontend/src/types/worldSet.ts`

**World Sets — Phase 2: Server API**
- [ ] `GET/POST/DELETE /api/world_sets/{name}` + `GET /api/world_sets` endpoints in `server/api/world_sets.py`
- [ ] World set files stored in `world_sets/` directory as `.worldset.json`
- [ ] World set API functions in `frontend/src/api/client.ts`
- [ ] Python API tests covering all endpoints (`tests/api/test_world_sets.py`)

**World Sets — Phase 3: Store**
- [ ] `worldSetStore.ts` with `activeWorldSetName`, `activeWorldSet`, `setActiveWorldSet()`, `addNode()`, `removeNode()`, `updateNode()`, `saveWorldSet()`
- [ ] Computed helpers: `childrenOf(mapName)`, `parentOf(mapName)`, `rootNodes()`
- [ ] Shared `navigateToMap(name, { saveFirst })` utility (handles dirty-map guard + load sequence)
- [ ] Frontend tests for store actions, footprint utilities, and overlap detection

**World Sets — Phase 4: Management Dialog**
- [ ] `WorldSetDialog.tsx`: list world sets; create/rename/delete; add/remove map nodes with parent + anchor + Z + scale assignment; inline validation warnings
- [ ] Map list shows each map's scale (`feetPerUnit`); maps with no scale show "No scale set — click to set" inline picker
- [ ] "World Sets…" item in `MenuBar.tsx`; dialog wired in `App.tsx`

**World Sets — Phase 5: Hierarchy Panel**
- [ ] `WorldHierarchyPanel.tsx`: collapsible tree of the active world set; warning badges on nodes with scale/overlap issues; click to navigate (with dirty-map guard); context menu: Add child here, Remove from world set, Change parent
- [ ] Panel integrated into left panel layout in `App.tsx` (below LayerPanel)

**World Sets — Phase 6: Canvas Integration**
- [ ] `worldSetOverlay.ts`: renders child footprint outlines on the canvas; labels each footprint with child map name; highlights on hover; placeholder footprint (1×1 with `?` label, warning color) for children with no `feetPerUnit`
- [ ] `MapCanvas.tsx` draws overlay; pointer events on footprints: click → navigate (with dirty-map guard), hover → tooltip
- [ ] Parent breadcrumb in `StatusBar.tsx`; clicking it navigates to parent map

**World Sets — Phase 7: "Add Child Here" Context Menu**
- [ ] Right-click context menu on `MapCanvas.tsx` when a world set is active
- [ ] "Add child map here" mini-dialog: anchor pre-filled from clicked cell; pick existing map or create new; set Z, optional label; scale picker (writes `feetPerUnit` to map if not set)

### Out of Scope

- Map rename endpoint — maps are identified by filename; renaming requires delete + re-upload; world set references update via the "map not found" warning flow
- Server-side world set validation — invariants (no cycles, no duplicates) are enforced in the frontend store; server is simple CRUD
- Collaborative/multi-user editing — this is a single-user local tool
- Cloud storage or remote sync — server binds to LAN only
- Sub-tile anchor precision for footprints — center-cell anchor only; no fractional positioning

## Context

- **Stack:** FastAPI (Python) + React/TypeScript (Vite), maps stored as Tiled-compatible `.tmj` JSON files in `maps/` on disk
- **Codebase state:** Fully functional web app (migrated from PyQt6 desktop app). All core editing features are working. 178 Python tests + 25 Vitest frontend tests.
- **Prior design work:** World Sets feature was fully designed in a planning session (2026-03-31). Design doc at `docs/world-sets-design.md`. During initialization, 6 issues were identified and resolved — see Key Decisions below.
- **Known issues to address:** `object-add` redo is silently broken (skipped with TODO in `mapStore.ts:349`); `removeTileset()` mutates store state directly. Neither blocks World Sets work.
- **Target usage:** Single GM on a local network; desktop browser primary, iPad secondary via LAN IP.

## Constraints

- **Tech stack:** FastAPI + React/TypeScript — no new frameworks; extend existing patterns
- **Data format:** Tiled TMJ JSON — world set files are a companion format (`.worldset.json`), maps stay clean
- **Backward compatibility:** Existing maps without `feetPerUnit` must load and work; World Set overlay degrades gracefully (placeholder footprint + prompt)
- **No database:** File-based storage only; world sets live in `world_sets/` alongside `maps/`
- **Local LAN only:** CORS open, no auth needed; not designed for internet exposure

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| World set files separate from TMJ | Maps stay Tiled-compatible; world set is a separate concern | — Pending |
| Flat node list with parent references | Easier to query and update than nested tree; no recursive parsing needed | — Pending |
| `feetPerUnit` stored on `TmjMap` (not `scaleId` on `WorldSetNode`) | Map is self-describing; supports custom values; no lookup table needed at render time | — Pending |
| Scale validation is warn-but-allow | GMs know their world; strict enforcement creates friction for creative choices | — Pending |
| Overlap detection is warn-but-allow | Same reasoning; show persistent badges, don't block | — Pending |
| Dirty-map guard on all navigation | Silent data loss is worse than an extra click; applies to hierarchy panel, canvas footprint, status bar breadcrumb | — Pending |
| Cross-store navigation via shared `navigateToMap()` utility | Stores don't import each other; components wire them; utility avoids duplicating save+load sequence | — Pending |
| `worldSetStore` has explicit `activeWorldSetName` | Multiple world sets possible; UI needs to know which is open; no world set active on startup | — Pending |
| Maps without `feetPerUnit` show placeholder footprint | Degrade gracefully; prompt to fix rather than silently skip or hard-fail | — Pending |
| Phase 1 split into 3 phases (Data → Server → Store) | Each phase independently testable; cleaner commit boundaries | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*
