# Getting Started

## Prerequisites

- Python 3.11 or later
- Git

---

## Installation

Clone the repository and create a virtual environment:

```bash
git clone <repo-url>
cd MapEditor_ClaudeCode
python -m venv .venv
```

Activate the environment:

| Platform | Command |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

Install runtime dependencies:

```bash
pip install -r requirements.txt
```

---

## Running the Editor

!!! note "UI not yet built"
    The interactive editor UI is planned for Phase 3. Running `main.py` currently
    executes a smoke test: it creates sample tile and hex maps, renders them to PNG,
    and prints a summary to the console.

```bash
python main.py
```

Expected output:

```
TileMap(name='Test Dungeon', 20x15, tile_size=32x32)
  Layers     : [TileLayer(name='Ground', 20x15), ObjectLayer(name='Objects')]
  Pixel size : 640x480
  Render     : map_editor\assets\renders\test_dungeon.png

HexMap(name='Test World', 12x10, hex_size=40.0, FLAT_TOP)
  Layers     : [TileLayer(name='Terrain', 12x10), ObjectLayer(name='Locations')]
  Pixel size : 880.0x694.0
  Render     : map_editor\assets\renders\test_world.png

Phase 2 complete. Renderers OK.
```

Rendered PNG files are saved to `map_editor/assets/renders/` for visual inspection.

---

## Installing Development Dependencies

To run the test suite or build this documentation, install the dev dependencies
(includes `pytest`, `pytest-cov`, `mkdocs`, and `mkdocs-material`):

```bash
pip install -r requirements-dev.txt
```

Run the full test suite:

```bash
pytest
```

Preview the documentation locally:

=== "macOS / Linux"

    ```bash
    mkdocs serve
    ```

=== "Windows"

    ```bash
    PYTHONUTF8=1 mkdocs serve
    ```

Then open `http://127.0.0.1:8000` in a browser.

---

## Next Steps

- Read [Core Concepts](concepts.md) to understand how maps, layers, and tilesets fit together.
- Explore [Map Types](map-types.md) to learn how tile and hex maps differ.
- See [Architecture](architecture.md) for an overview of the codebase and build phases.
