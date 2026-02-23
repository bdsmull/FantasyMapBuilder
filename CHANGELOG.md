# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Planned
- Phase 4: Paint, fill, erase, and object placement tools with undo/redo
- Phase 5: Tiled `.tmj` save/load and PNG export

---

## [0.3.0] - 2026-02-22

### Added
- `MainWindow` — `QMainWindow` with a `QMdiArea` central workspace
  - File menu: New Tile Map (Ctrl+T), New Hex Map (Ctrl+H), Close Map (Ctrl+W), Quit (Ctrl+Q)
  - View menu: Zoom In/Out/Reset (Ctrl+=/−/0), Show Grid toggle (G, checkable)
  - Window menu: Tile Windows, Cascade, Close All sub-windows
  - Help menu: About dialog
  - Dock stubs: Layers panel (left) and Tile Palette (right) — wired up in Phase 4
  - Status bar: active map name, cursor tile coordinates, zoom percentage
- `MapCanvas` — abstract `QGraphicsView` base shared by tile and hex canvases
  - `cursor_moved(int, int)` and `zoom_changed(float)` signals
  - Smooth zoom via Ctrl+scroll wheel (0.1× – 16× range, 1.2× step)
  - Middle-mouse-button panning using `ScrollHandDrag` and a synthetic left-button event
  - `fit_in_view()` on first show via `QTimer.singleShot`
- `TileCanvas` — `MapCanvas` subclass that renders a `TileMap` into a `QGraphicsView`
- `HexCanvas` — `MapCanvas` subclass that renders a `HexMap` into a `QGraphicsView`
- `NewMapDialog` — `QDialog` for creating a new tile or hex map
  - Stacked widget switches between tile settings (name, width, height, tile size) and hex
    settings (name, cols, rows, hex size, orientation)
  - OK button disabled while the map name field is empty
- MkDocs + Material theme documentation site (`docs/`, `mkdocs.yml`)
  - Getting Started, Core Concepts, Map Types, Tilesets, Layers, Objects, Coordinate Systems,
    File Format, Architecture, Testing, Contributing pages
  - `mkdocs>=1.6` and `mkdocs-material>=9.5` added to `requirements-dev.txt`
  - `site/` added to `.gitignore`
- `pytest-qt>=4.4` added to `requirements-dev.txt`
- UI smoke tests (`tests/ui/test_ui.py`) — 7 tests covering window creation, dialog behaviour,
  and canvas rendering

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
