# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- MkDocs + Material theme documentation site (`docs/`, `mkdocs.yml`)
  - Getting Started, Core Concepts, Map Types, Tilesets, Layers, Objects, Coordinate Systems, File Format, Architecture, Testing, Contributing pages
  - `mkdocs>=1.6` and `mkdocs-material>=9.5` added to `requirements-dev.txt`
  - `site/` added to `.gitignore`

### Planned
- Phase 3: PyQt6 main window, dual-canvas workspace, new map dialog
- Phase 4: Paint, fill, erase, and object placement tools with undo/redo
- Phase 5: Tiled `.tmj` save/load and PNG export

---

## [0.2.0] - 2026-02-22

### Added
- `TileRenderer` — QPainter-based renderer for square tile maps; returns a `QImage` (headless, no display required)
  - Placeholder colour fill and sprite-sheet support with an LRU-style image cache
  - Semi-transparent grid lines (toggled via `show_grid`)
  - Object-layer markers: circles for points, outlines for rects/ellipses/polygons, labelled with the first letter of the object name
- `HexRenderer` — QPainter-based renderer for hex maps; same API as `TileRenderer`
  - Anti-aliased hexagon polygons (flat-top and pointy-top orientations)
  - Sprite-sheet tiles clipped to hex shape via `QPainterPath`
  - Per-hex polygon outline grid
- Rendering test suite (`tests/rendering/`) — 34 tests covering image size, pixel colours, layer visibility, grid toggles, both orientations, and cache invalidation
- Smoke-test renders saved to `map_editor/assets/renders/` on `python main.py`

### Fixed
- `HexMap._pixel_to_axial` assumed axial (0, 0) was at pixel (0, 0); now correctly subtracts the grid origin offset before applying the axial formula
- `HexRenderer` sprite-sheet branch drew a 32 × 32 square at the hex centre instead of scaling to the hex bounding box; destination rect is now derived from `hex_pixel_size()`
- `_generate_placeholder_png` always drew rectangles; hex tilesets now generate flat-top hexagon shapes using Pillow `draw.polygon()`

---

## [0.1.0] - 2026-02-22

### Added
- `TileDefinition` and `Tileset` models with 16 tile-grid types and 12 hex-world types
- Placeholder PNG sprite sheet generator (no external art required)
- `MapObject` model supporting point, rectangle, ellipse, polygon, and tile-object shapes
- `TileLayer` with flood fill, flat data export, and copy support
- `ObjectLayer` with spatial hit-testing
- `TileMap` container with multi-tileset GID resolution and pixel/tile coordinate helpers
- `HexMap` container with axial/offset/pixel coordinate conversion, neighbour lookup, and distance calculation
- Tiled `.tmj` stagger metadata properties on `HexMap`
- Project scaffolding: directory structure, `requirements.txt`, `.gitignore`
