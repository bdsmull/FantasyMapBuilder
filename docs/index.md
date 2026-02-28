# Fantasy RPG Map Editor

A web-based application for creating and editing fantasy RPG maps, built with FastAPI and React.

The editor supports two map scales in a unified workspace:

- **Tile grid** — square-cell maps for towns, dungeons, interiors, and combat arenas
- **Hex grid** — hexagonal-cell maps for regions, continents, and world overviews

Maps save and load in [Tiled](https://www.mapeditor.org/) `.tmj` format and can be exported as PNG images.

---

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Data models — tileset, layers, tile map, hex map, objects |
| 2 | ✅ Done | File I/O — Tiled TMJ save/load, tileset management |
| 3 | ✅ Done | FastAPI backend — map CRUD, upload/download, tileset image serving |
| 4 | ✅ Done | React frontend — canvas renderers, editing tools, undo/redo, UI panels |
| 5 | ✅ Done | Touch support — pinch-to-zoom, Pointer Events API, iPad LAN access |

---

## Key Features

- Dual-mode workspace: tile and hex maps side by side
- Multiple layers per map (tile layers and object/entity layers)
- Flexible layer system — per-layer visibility, opacity, and ordering
- Custom tileset support — load your own PNG sprite sheets
- Object and entity placement (NPCs, chests, spawn points, triggers, …)
- Full undo/redo history per canvas (independent stacks)
- Tiled `.tmj` compatible save/load — maps open in Tiled and any compatible engine
- Touch support with pinch-to-zoom (iPad / touchscreen)
- Tileset management — add from PNG sprite sheet or remove unused tilesets
- Placeholder tile generator — usable out of the box with no external art

---

## Quick Links

- [Getting Started](getting-started.md) — install, set up, and run the editor
- [Core Concepts](concepts.md) — maps, layers, tilesets, and objects explained
- [Coordinate Systems](coordinates.md) — tile/pixel for square maps; axial/offset/pixel for hex maps
- [Architecture](architecture.md) — code structure and design decisions
- [Contributing](contributing.md) — dev environment and running tests
