# Fantasy RPG Map Editor

A Python desktop application for creating and editing fantasy RPG maps, built with PyQt6.

Supports two map scales in a single workspace:

- **Tile grid** — small-scale maps for towns, dungeons, interiors, and combat (square grid)
- **Hex grid** — large-scale maps for regions, continents, and world overviews (hexagonal grid)

Maps are saved in [Tiled](https://www.mapeditor.org/) `.tmj` format and can also be exported as PNG images.

---

## Features

- Dual-mode workspace: tile and hex maps side by side
- Multiple layers per map (tile layers and object/entity layers)
- Custom tileset support (load your own PNG sprite sheets)
- Object and entity placement (NPCs, chests, spawn points, triggers, …)
- Full undo/redo history
- Tiled `.tmj` compatible save/load
- PNG image export
- Placeholder tile generator — usable out of the box with no external art

---

## Requirements

- Python 3.11+
- PyQt6
- Pillow

---

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd MapEditor_ClaudeCode

# Create a virtual environment
python -m venv .venv
```

Activate it:

| Platform | Command |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

```bash
# Install runtime dependencies
pip install -r requirements.txt

# Run the editor
python main.py
```

---

## Testing

Install the development dependencies (includes `pytest`, `pytest-cov`, `mkdocs`, and `mkdocs-material`):

```bash
pip install -r requirements-dev.txt
```

Run the full test suite:

```bash
pytest
```

Run with coverage report:

```bash
pytest --cov=map_editor --cov-report=term-missing
```

---

## Documentation

Full documentation is in the `docs/` directory and built with [MkDocs](https://www.mkdocs.org/) + [Material theme](https://squidfunk.github.io/mkdocs-material/).

Preview locally (install dev dependencies first):

```bash
# macOS / Linux
mkdocs serve

# Windows
PYTHONUTF8=1 mkdocs serve
```

Then open `http://127.0.0.1:8000`.

---

## Project Structure

```
MapEditor_ClaudeCode/
├── main.py                      # Entry point — launches the Qt application
├── requirements.txt             # Runtime dependencies
├── requirements-dev.txt         # Dev dependencies (pytest, pytest-cov, mkdocs)
├── mkdocs.yml                   # Documentation site config
│
├── map_editor/
│   ├── models/                  # Pure data models (no Qt dependency)
│   │   ├── tileset.py           # Tileset + placeholder PNG generator
│   │   ├── layer.py             # TileLayer, ObjectLayer
│   │   ├── tile_map.py          # Square-grid map container
│   │   ├── hex_map.py           # Hex-grid map + coordinate math
│   │   └── map_object.py        # Placed entities (NPCs, items, …)
│   │
│   ├── rendering/               # QPainter renderers → QImage
│   │   ├── tile_renderer.py     # Square tile map renderer
│   │   └── hex_renderer.py      # Hex map renderer
│   │
│   ├── commands/                # QUndoCommand subclasses (undo/redo)
│   │   └── tile_commands.py     # SetTileRegionCommand, FloodFillCommand, Add/RemoveObjectCommand
│   ├── tools/                   # Mouse interaction tools
│   │   ├── base_tool.py         # BaseTool interface
│   │   ├── paint_tool.py        # PaintTool
│   │   ├── erase_tool.py        # EraseTool
│   │   ├── fill_tool.py         # FillTool
│   │   └── point_tool.py        # PointObjectTool
│   ├── io/                      # Tiled TMJ read/write
│   ├── ui/                      # PyQt6 windows, panels, dialogs
│   │   ├── main_window.py       # MainWindow (QMdiArea workspace)
│   │   ├── map_canvas.py        # Abstract QGraphicsView base
│   │   ├── tile_canvas.py       # Canvas for TileMap
│   │   ├── hex_canvas.py        # Canvas for HexMap
│   │   ├── tile_palette.py      # TilePaletteWidget (sprite sheet selector)
│   │   ├── layer_panel.py       # LayerPanelWidget (layer list + visibility)
│   │   └── dialogs/
│   │       └── new_map_dialog.py  # New map creation dialog
│   └── assets/
│       └── placeholders/        # Auto-generated placeholder tilesets
│
├── tests/
│   ├── models/                  # Unit tests for data models
│   ├── rendering/               # Unit tests for renderers
│   ├── tools/                   # Unit tests for editing tools
│   └── ui/                      # UI smoke tests (pytest-qt)
│
└── docs/                        # MkDocs source (user guide)
```

---

## Development Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Done | Data models (tileset, layer, tile map, hex map, objects) |
| 2 | Done | Renderers (tile grid + hex grid via QPainter → QImage) |
| 3 | Done | Core UI shell (main window, canvases, new map dialog) |
| 4 | Done | Editing tools + undo/redo (paint, fill, erase, objects) |
| 5 | Planned | File I/O (Tiled TMJ save/load) + PNG export |

---

## License

MIT — see [LICENSE](LICENSE) for details.
