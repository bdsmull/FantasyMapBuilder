# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [0.5.0] - 2026-02-26

### Added
- **TMJ file save/load** — maps round-trip through Tiled's `.tmj` JSON format:
  - `map_editor/io/tmj_writer.py` — `write_tile_map()` and `write_hex_map()`
  - `map_editor/io/tmj_reader.py` — `read_map(path)` returning `TileMap | HexMap`
  - Tileset image paths stored relative to the `.tmj` file (Tiled convention)
  - Full `TileDefinition` metadata (name, color, category) reconstructed on load via per-tile custom properties
  - Hex map orientation, hex size, and stagger metadata round-trip correctly
- **Image export** (`map_editor/rendering/exporter.py`) — `export_tile_map()` / `export_hex_map()` render the complete map (all layers, regardless of visibility) to PNG or JPEG
- **Manage Tilesets dialog** (`map_editor/ui/dialogs/tileset_dialog.py`):
  - Lists all tilesets with name, source path, tile size, and tile count
  - **Add from PNG** — browse for a sprite sheet, configure tile size, auto-builds `TileDefinition` stubs
  - **Remove** — blocked if any tile layer references the tileset; recomputes `first_gid` offsets after removal
- **File menu additions** in `MainWindow`:
  - **Open…** (Ctrl+O) — load a `.tmj` file into a new canvas sub-window
  - **Save** (Ctrl+S) — save to `map_.source_path`; falls through to Save As if not yet saved
  - **Save As…** (Ctrl+Shift+S) — save to a new path and update `source_path`
  - **Export as Image…** — export to PNG/JPEG via a file dialog
  - Save / Save As / Export / Manage Tilesets disabled when no map is open
- **Edit → Manage Tilesets…** — opens the tileset management dialog for the active canvas
- IO test suite (`tests/io/test_tmj_io.py`) — 15 tests covering metadata round-trips, tile data, layer properties, object shapes, custom properties, ID counter reset, hex maps, and PNG export

### Changed
- Viewport-culled rendering: `TileRenderer` and `HexRenderer` both gain `render_clipped()` which renders only the visible viewport region into a smaller `QImage`, then positions it correctly in the scene. Panning and zooming on large maps is now dramatically faster.
- `MapCanvas` initial zoom caps at 60×60 visible cells on first open; maps smaller than this fit the view as before.
- Scroll-wheel always zooms (no Ctrl modifier required).

---

## [0.4.0] - 2026-02-23

### Added
- **Editing tools** — strategy-pattern tool system with four interchangeable tools:
  - `PaintTool` — left-click/drag to paint tiles; one undo step per full stroke
  - `EraseTool` — left-click/drag to erase tiles (set to ID 0); one undo step per stroke
  - `FillTool` — flood-fill a contiguous same-tile region with the active tile
  - `PointObjectTool` — left-click to place a named point object; right-click to remove the nearest one
- **`BaseTool`** — abstract base class defining `on_press`, `on_drag`, `on_release`, and `cursor()` interface
- **Undo/redo commands** (`map_editor/commands/tile_commands.py`):
  - `SetTileRegionCommand` — undoes/redoes a batched paint or erase stroke
  - `FloodFillCommand` — undoes/redoes a flood fill
  - `AddObjectCommand` / `RemoveObjectCommand` — undoes/redoes point object placement and deletion
  - All commands use a `_first=True` skip-first-redo pattern (changes are applied interactively before `push()`)
- **`QUndoStack` per canvas** — each open map has its own independent undo history; `indexChanged` auto-triggers `refresh()`
- **Layer panel** (`LayerPanelWidget`) — `QListWidget` dock showing all layers top-first with per-layer visibility checkboxes
- **Tile palette** (`TilePaletteWidget`) — custom `QWidget` dock displaying the active tileset sprite sheet scaled to dock width; click to select a tile (yellow highlight on selection)
- **Toolbar** — four exclusive checkable tool actions: Paint (Ctrl+1), Erase (Ctrl+2), Fill (Ctrl+3), Point (Ctrl+4)
- **Edit menu** — Undo (Ctrl+Z), Redo (Ctrl+Y), Clear Layer, Fill Layer
- `MapCanvas` additions: `set_tool()`, `set_active_layer()`, `set_active_gid()`, `push_command()`, `undo_stack()`, right-button dispatch for `on_right_press`
- `TileCanvas._cell_to_pixel_center()` and `TileCanvas._get_tile_size()`
- `HexCanvas._cell_to_pixel_center()` and `HexCanvas._get_tile_size()`
- Tool tests (`tests/tools/test_tools.py`) — 7 tests using a headless `CanvasStub` (no QWidget needed)

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
