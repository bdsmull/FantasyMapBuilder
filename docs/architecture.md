# Architecture

## Project layout

```
MapEditor_ClaudeCode/
├── main.py                    # Entry point / Phase 1-2 smoke test
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
│   ├── rendering/             # QPainter → QImage (headless, no display needed)
│   │   ├── tile_renderer.py   # TileRenderer
│   │   └── hex_renderer.py    # HexRenderer
│   │
│   ├── commands/              # QUndoCommand subclasses (Phase 4)
│   ├── tools/                 # Mouse tools: paint, fill, erase (Phase 4)
│   ├── io/                    # TMJ reader/writer (Phase 5)
│   ├── ui/                    # PyQt6 windows, panels, dialogs (Phase 3+)
│   └── assets/
│       └── placeholders/      # Auto-generated sprite sheets (git-ignored)
│
├── tests/
│   ├── conftest.py            # Shared fixtures (reset MapObject ID counter)
│   ├── models/                # Unit tests for all data models
│   └── rendering/             # Pixel-level tests for both renderers
│
└── docs/                      # MkDocs source (this documentation)
```

---

## Build phases

| Phase | Status | Modules added |
|-------|--------|---------------|
| 1 | ✅ Done | `models/` — data model and placeholder PNG generation |
| 2 | ✅ Done | `rendering/` — tile and hex renderers |
| 3 | Planned | `ui/main_window.py`, `ui/map_canvas.py`, `ui/tile_canvas.py`, `ui/hex_canvas.py`, `ui/dialogs/new_map_dialog.py` |
| 4 | Planned | `tools/`, `commands/`, `ui/tile_palette.py`, `ui/layer_panel.py`, `ui/toolbar.py`, `ui/object_panel.py` |
| 5 | Planned | `io/tmj_reader.py`, `io/tmj_writer.py`, `rendering/exporter.py`, `ui/dialogs/tileset_dialog.py` |

---

## Key design decisions

### QImage, not QPixmap

Renderers return `QImage` rather than `QPixmap`. `QImage` is CPU-backed and works without a
running windowing system — essential for unit tests and CI environments. The future canvas
widget (Phase 3) will call `QPixmap.fromImage()` to promote the image for GPU-accelerated
display; this is effectively zero-copy on most platforms.

### Offscreen Qt platform

Both `main.py` and the rendering test conftest set `QT_QPA_PLATFORM=offscreen` before
creating a `QApplication`. This allows Qt to initialise and QPainter to operate without a
physical display.

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
- **ID isolation** — `MapObject._id_counter` is a class-level global reset to zero before
  every test by an `autouse` fixture in `tests/conftest.py`.

See [Testing](testing.md) for commands and coverage details.
