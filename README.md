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

Install the development dependencies (includes `pytest` and `pytest-cov`):

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

## Project Structure

```
MapEditor_ClaudeCode/
├── main.py                      # Entry point / Phase 1-2 smoke test
├── requirements.txt             # Runtime dependencies
├── requirements-dev.txt         # Dev dependencies (pytest, pytest-cov)
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
│   ├── tools/                   # Mouse interaction tools (paint, fill, …)
│   ├── io/                      # Tiled TMJ read/write
│   ├── ui/                      # PyQt6 windows, panels, dialogs
│   └── assets/
│       └── placeholders/        # Auto-generated placeholder tilesets
│
└── tests/
    ├── models/                  # Unit tests for data models
    └── rendering/               # Unit tests for renderers
```

---

## Development Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Done | Data models (tileset, layer, tile map, hex map, objects) |
| 2 | Done | Renderers (tile grid + hex grid via QPainter → QImage) |
| 3 | Planned | Core UI shell (main window, canvases, new map dialog) |
| 4 | Planned | Editing tools + undo/redo (paint, fill, erase, objects) |
| 5 | Planned | File I/O (Tiled TMJ save/load) + PNG export |

---

## License

MIT — see [LICENSE](LICENSE) for details.
