# Fantasy RPG Map Editor

## What This Is

A web-based tile map editor for fantasy RPG worldbuilding, accessible from desktop and tablet (iPad) on a local network. Users create and edit tile maps and hex maps at different geographic scales — from individual rooms up to world maps — and link them into a navigable hierarchy called a World Set. The GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## Core Value

A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## Requirements

### Validated

**Core editing (pre-v1.0 — existing at v1.0 start):**
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

**World Sets (v1.0):**
- ✓ `WorldSetNode` and `WorldSet` TypeScript types; `.worldset.json` file format — v1.0
- ✓ `TmjMap.feetPerUnit` for scale-aware footprint computation; all 8 presets updated — v1.0
- ✓ `computeFootprint` and `detectOverlaps` pure utilities — v1.0
- ✓ World set REST API (GET/POST/DELETE `/api/world_sets/{name}`) + Python tests — v1.0
- ✓ World set client functions (`listWorldSets`, `getWorldSet`, `saveWorldSet`, `deleteWorldSet`) — v1.0
- ✓ `worldSetStore.ts` with full CRUD actions, invariant enforcement, computed helpers — v1.0
- ✓ Shared `navigateToMap()` utility with dirty-map guard used by all navigation triggers — v1.0
- ✓ Management dialog (World Sets…): create/delete world sets, add/remove map nodes, inline scale picker, validation warnings — v1.0
- ✓ Hierarchy panel: collapsible tree, warning badges, click-to-navigate, node context menu — v1.0
- ✓ Canvas footprint overlay: child outlines, labels, hover tooltip, click-to-navigate, amber placeholder for unscaled children — v1.0
- ✓ Status bar parent breadcrumb: shows parent map when current map is a child; click navigates up — v1.0
- ✓ Canvas right-click context menu: "Add child map here" with anchor pre-fill; scale picker for unscaled maps; "Create new map" chain — v1.0

### Active

*(No active requirements — next milestone not yet defined. Use `/gsd:new-milestone` to start planning.)*

### Out of Scope

- Map rename endpoint — maps are identified by filename; renaming requires delete + re-upload; world set references show "map not found" warning
- Server-side world set validation — invariants enforced in frontend store; server is simple CRUD for a local tool
- Collaborative/multi-user editing — single-user local tool; no auth, no conflict resolution
- Cloud storage or remote sync — server binds to LAN only (`0.0.0.0:8000`)
- Sub-tile anchor precision for footprints — center-cell anchor only; fractional positioning adds complexity with minimal benefit at these scales
- Hex footprint exact geometry — treated as rectangular for footprint math (accepted approximation)
- Canvas right-click on iPad — `e.pointerType === 'touch' && e.buttons === 2` does not fire on real iOS; canvas context menu is desktop-only (iPad uses the hierarchy panel context menu)

## Context

- **Stack:** FastAPI (Python 3.14) + React 18/TypeScript (Vite), maps stored as Tiled-compatible `.tmj` JSON files in `maps/` on disk; world sets as `.worldset.json` in `world_sets/`
- **Codebase state (v1.0):** ~7,500 TypeScript LOC + ~12,300 Python LOC. 152 Vitest frontend tests + 178 Python backend tests. All World Sets features shipped and verified.
- **Target usage:** Single GM on a local network; desktop browser primary, iPad secondary via LAN IP
- **Known tech debt:** `object-add` redo is silently broken (TODO in `mapStore.ts`); `removeTileset()` mutates store state directly; canvas right-click not reachable on iOS touch

## Constraints

- **Tech stack:** FastAPI + React/TypeScript — no new frameworks; extend existing patterns
- **Data format:** Tiled TMJ JSON — world set files are a companion format (`.worldset.json`), maps stay clean
- **Backward compatibility:** Existing maps without `feetPerUnit` must load and work; World Set overlay degrades gracefully (placeholder footprint + prompt)
- **No database:** File-based storage only; world sets live in `world_sets/` alongside `maps/`
- **Local LAN only:** CORS open, no auth needed; not designed for internet exposure

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| World set files separate from TMJ | Maps stay Tiled-compatible; world set is a separate concern | ✓ Good — clean separation; maps openable in Tiled editor without modification |
| Flat node list with parent references | Easier to query and update than nested tree; no recursive parsing needed | ✓ Good — simple to traverse; `childrenOf`/`parentOf`/`rootNodes` helpers cover all UI needs |
| `feetPerUnit` stored on `TmjMap` (not scaleId on WorldSetNode) | Map is self-describing; supports custom values; no lookup table needed at render time | ✓ Good — worked cleanly across all 7 phases |
| Scale validation is warn-but-allow | GMs know their world; strict enforcement creates friction for creative choices | ✓ Good — badges in hierarchy panel + warnings in dialog are sufficient |
| Overlap detection is warn-but-allow | Same reasoning; show persistent badges, don't block | ✓ Good — same as above |
| Dirty-map guard on all navigation | Silent data loss is worse than an extra click | ✓ Good — single `navigateToMap()` entry point covers hierarchy panel, canvas, breadcrumb consistently |
| Cross-store navigation via shared `navigateToMap()` utility | Stores don't import each other; utility avoids duplicating save+load sequence | ✓ Good — Phase 3 decision paid off across phases 5, 6, 7 |
| `worldSetStore` has explicit `activeWorldSetName` | Multiple world sets possible; UI needs to know which is open | ✓ Good — localStorage persistence across reloads works cleanly |
| Maps without `feetPerUnit` show placeholder footprint | Degrade gracefully; prompt to fix rather than silently skip or hard-fail | ✓ Good — amber 1×1 placeholder with `?` label is clear and non-blocking |
| Canvas context menu desktop-only (no iOS right-click) | `e.buttons === 2` on touch is non-standard; hierarchy panel context menu covers iPad use case | ✓ Acceptable — iPad users have an alternative path |

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
*Last updated: 2026-05-30 — v1.0 World Sets shipped (7 phases, 20 plans, 152 frontend tests, 178 Python tests)*
