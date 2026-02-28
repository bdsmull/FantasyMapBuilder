# Architecture

## Project layout

```
MapEditor_ClaudeCode/
├── main.py                    # Entry point — launches the Qt application
├── requirements.txt           # Runtime: PyQt6, Pillow
├── requirements-dev.txt       # Dev: pytest, pytest-cov, mkdocs, mkdocs-material
│
├── map_editor/
│   ├── models/                # Pure data models — zero Qt dependency
│   │   ├── tileset.py         # TileCategory, TileDefinition, Tileset, placeholder PNG gen
│   │   ├── layer.py           # TileLayer (2-D grid), ObjectLayer
│   │   ├── tile_map.py        # TileMap (square grid) container
│   │   ├── hex_map.py         # HexMap (hex grid) container + coordinate math
│   │   └── map_object.py      # MapObject (free-form entities)
│   │
│   ├── commands/              # QUndoCommand subclasses
│   │   └── tile_commands.py   # SetTileRegionCommand, FloodFillCommand, Add/RemoveObjectCommand
│   ├── tools/                 # Mouse interaction tools (strategy pattern)
│   │   ├── base_tool.py       # BaseTool interface
│   │   ├── paint_tool.py      # PaintTool
│   │   ├── erase_tool.py      # EraseTool
│   │   ├── fill_tool.py       # FillTool
│   │   └── point_tool.py      # PointObjectTool
│   ├── io/                    # TMJ reader/writer
│   │   ├── tmj_writer.py      # write_tile_map / write_hex_map → .tmj JSON
│   │   └── tmj_reader.py      # read_map(path) → TileMap | HexMap
│   ├── rendering/             # QPainter → QImage (headless, no display needed)
│   │   ├── tile_renderer.py   # TileRenderer + render_clipped()
│   │   ├── hex_renderer.py    # HexRenderer + render_clipped()
│   │   └── exporter.py        # export_tile_map / export_hex_map → PNG/JPEG
│   ├── ui/                    # PyQt6 windows, panels, dialogs
│   │   ├── main_window.py     # MainWindow (QMdiArea workspace, menus, toolbar, status bar)
│   │   ├── map_canvas.py      # Abstract QGraphicsView — zoom, pan, grid, undo stack, tool dispatch
│   │   ├── tile_canvas.py     # TileCanvas (MapCanvas for TileMap)
│   │   ├── hex_canvas.py      # HexCanvas (MapCanvas for HexMap)
│   │   ├── tile_palette.py    # TilePaletteWidget (sprite sheet tile selector)
│   │   ├── layer_panel.py     # LayerPanelWidget (layer list with visibility checkboxes)
│   │   └── dialogs/
│   │       ├── new_map_dialog.py   # New map dialog (tile or hex)
│   │       └── tileset_dialog.py   # Manage Tilesets (Add from PNG / Remove)
│   └── assets/
│       └── placeholders/      # Auto-generated sprite sheets (git-ignored)
│
├── tests/
│   ├── conftest.py            # Shared fixtures (reset MapObject ID counter)
│   ├── models/                # Unit tests for all data models
│   ├── rendering/             # Pixel-level tests for both renderers
│   ├── tools/                 # Unit tests for editing tools (headless CanvasStub)
│   ├── io/                    # TMJ round-trip and export tests (15 tests)
│   └── ui/                    # UI smoke tests (pytest-qt)
│
└── docs/                      # MkDocs source (this documentation)
```

---

## Build phases

| Phase | Status | Modules added |
|-------|--------|---------------|
| 1 | ✅ Done | `models/` — data model and placeholder PNG generation |
| 2 | ✅ Done | `rendering/` — tile and hex renderers |
| 3 | ✅ Done | `ui/main_window.py`, `ui/map_canvas.py`, `ui/tile_canvas.py`, `ui/hex_canvas.py`, `ui/dialogs/new_map_dialog.py` |
| 4 | ✅ Done | `tools/` (BaseTool + 4 tools), `commands/tile_commands.py`, `ui/tile_palette.py`, `ui/layer_panel.py` |
| 5 | ✅ Done | `io/tmj_reader.py`, `io/tmj_writer.py`, `rendering/exporter.py`, `ui/dialogs/tileset_dialog.py` |

---

## Key design decisions

### QImage, not QPixmap

Renderers return `QImage` rather than `QPixmap`. `QImage` is CPU-backed and works without a
running windowing system — essential for unit tests and CI environments. The future canvas
widget (Phase 3) will call `QPixmap.fromImage()` to promote the image for GPU-accelerated
display; this is effectively zero-copy on most platforms.

### Offscreen Qt platform

Renderer tests and UI tests set `QT_QPA_PLATFORM=offscreen` (in their respective
`conftest.py`) before creating a `QApplication`. This allows Qt to initialise and QPainter
to operate without a physical display. `main.py` no longer sets this variable — it launches
the real windowed application.

### Axial hex coordinates

All hex math is performed in axial space `(q, r)`. The third cube coordinate `s = -q - r`
is implicit. Offset coordinates `(col, row)` are used only at storage boundaries: writing
to a `TileLayer`, and computing pixel positions via `hex_center()` and `hex_corners()`. All
algorithms (neighbours, distance, future pathfinding) stay in axial space.

### 1-based tile IDs

Tile IDs stored in layers are 1-based; `0` is reserved for "empty". This matches the Tiled
editor convention and avoids ambiguity between "no tile" and "first tile in the set".

### Global tile IDs (GIDs)

When multiple tilesets are attached to a map, tile IDs stored in `TileLayer.data` are
*global*: each tileset's `first_gid` offset is baked in. The helpers `tileset_for_gid()`
and `local_id()` abstract this away, following the same convention as Tiled.

### Tool strategy pattern

`map_editor/tools/` implements the **Strategy** pattern. `BaseTool` defines a three-method
interface (`on_press`, `on_drag`, `on_release`) plus a `cursor()` hint. `MapCanvas` holds a
single `_active_tool` reference and delegates all mouse events to it. Switching tools is a
single `canvas.set_tool(tool)` call.

Tools receive the canvas as a parameter on every call, so the same tool instance is safely
shared across multiple open canvases — no tool state is per-canvas.

**Single undo step per stroke:** `PaintTool` and `EraseTool` accumulate changes in a
`_pending` list during press and drag, then push a single `SetTileRegionCommand` on
release. This means the entire drag stroke is reverted by one Ctrl+Z.

**Skip-first-redo pattern:** All `QUndoCommand` subclasses set `_first = True`. Because
`QUndoStack.push()` immediately calls `redo()` — and the tool already applied changes for
live feedback — the first `redo()` is a no-op. Subsequent redo calls after undo replay the
changes normally.

### Per-canvas undo stacks

Each `MapCanvas` owns a `QUndoStack`. When a sub-window is activated,
`MainWindow._reconnect_undo_stack()` safely disconnects the Edit menu actions from the
previous stack and reconnects them to the newly active one. Two open maps therefore have
fully independent undo histories.

### Pure model layer

`map_editor/models/` has zero Qt dependency. This means:

- Models can be imported and tested without a `QApplication`.
- File I/O (Phase 5) can read/write maps without touching the UI.
- Future headless tools (map generators, validators) can use the model layer directly.

---

## Testing strategy

The test suite uses `pytest`. Key conventions:

- **Model tests** (`tests/models/`) — no Qt required; fast, pure-Python tests.
- **Renderer tests** (`tests/rendering/`) — require a `QApplication`; provided by a
  session-scoped `qapp` fixture in `tests/rendering/conftest.py`.
- **UI tests** (`tests/ui/`) — use `pytest-qt`'s `qtbot` fixture; `QT_QPA_PLATFORM=offscreen`
  set in `tests/ui/conftest.py`.
- **Tool tests** (`tests/tools/`) — use a plain `CanvasStub` class (no `QWidget`) that
  implements the minimal canvas interface (`push_command`, `refresh`, `_cell_to_pixel_center`,
  `_get_tile_size`). Tools can be tested headlessly alongside commands.
- **ID isolation** — `MapObject._id_counter` is a class-level global reset to zero before
  every test by an `autouse` fixture in `tests/conftest.py`.

See [Testing](testing.md) for commands and coverage details.
