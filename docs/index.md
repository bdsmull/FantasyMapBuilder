# Fantasy RPG Map Editor

A Python desktop application for creating and editing fantasy RPG maps, built with PyQt6.

The editor supports two map scales in a unified workspace:

- **Tile grid** — square-cell maps for towns, dungeons, interiors, and combat arenas
- **Hex grid** — hexagonal-cell maps for regions, continents, and world overviews

Maps save and load in [Tiled](https://www.mapeditor.org/) `.tmj` format and can be exported as PNG images.

---

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Data models — tileset, layers, tile map, hex map, objects |
| 2 | ✅ Done | Renderers — tile grid and hex grid via QPainter → QImage |
| 3 | ✅ Done | Core UI shell — main window, dual canvases, new map dialog |
| 4 | ✅ Done | Editing tools — paint, fill, erase, object placement, undo/redo |
| 5 | Planned | File I/O — Tiled TMJ save/load and PNG export |

---

## Key Features

- Dual-mode workspace: tile and hex maps side by side
- Multiple layers per map (tile layers and object/entity layers)
- Flexible layer system — per-layer visibility, opacity, and ordering
- Custom tileset support — load your own PNG sprite sheets
- Object and entity placement (NPCs, chests, spawn points, triggers, …)
- Full undo/redo history per canvas (independent stacks)
- Tiled `.tmj` compatible save/load *(Phase 5)*
- PNG image export *(Phase 5)*
- Placeholder tile generator — usable out of the box with no external art

---

## Quick Links

- [Getting Started](getting-started.md) — install, set up, and run the editor
- [Core Concepts](concepts.md) — maps, layers, tilesets, and objects explained
- [Coordinate Systems](coordinates.md) — tile/pixel for square maps; axial/offset/pixel for hex maps
- [Architecture](architecture.md) — code structure and design decisions
- [Contributing](contributing.md) — dev environment and running tests
