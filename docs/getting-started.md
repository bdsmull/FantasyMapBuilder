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

```bash
python main.py
```

The application opens a 1280 × 800 window with a dark multi-document workspace.

**Creating your first map:**

1. Go to **File → New Tile Map** (Ctrl+T) or **File → New Hex Map** (Ctrl+H).
2. Enter a name, choose dimensions, and click **OK**.
3. A new canvas sub-window opens inside the workspace.

You can open multiple maps simultaneously — use **Window → Tile Windows** or
**Window → Cascade** to arrange them.

**Navigation:**

| Action | Input |
|--------|-------|
| Pan | Middle-mouse drag |
| Zoom in / out | Ctrl + scroll wheel |
| Fit map to view | Ctrl+0 |
| Toggle grid | G |

The status bar shows the active map name, the tile or hex cell under the cursor, and the
current zoom level.

---

## Editing

### Selecting a tool

Four tools are available in the toolbar (or via keyboard shortcuts):

| Tool | Shortcut | Left-click | Right-click |
|------|----------|-----------|-------------|
| Paint | Ctrl+1 | Paint the active tile onto the map | — |
| Erase | Ctrl+2 | Erase tiles (set to empty) | — |
| Fill | Ctrl+3 | Flood-fill a contiguous region | — |
| Point | Ctrl+4 | Place a named point object | Remove nearest point object |

Paint and Erase accumulate the whole drag stroke into a **single undo step** — press, drag,
release, then Ctrl+Z reverts the entire stroke at once.

### Selecting a tile

The **Tile Palette** dock (right side) shows the active tileset's sprite sheet. Click any
tile to select it; the selection is highlighted in yellow. The selected tile is used by
Paint and Fill tools.

### Managing layers

The **Layers** dock (left side) lists every layer in the active map, top-first. Click a
layer to make it active. Toggle its checkbox to show or hide it — hidden layers are skipped
by the renderer immediately.

### Undo / Redo

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z |
| Redo | Ctrl+Y |

Each open map canvas has its own independent undo history. Switching between sub-windows
reconnects the Edit menu to the newly active canvas's undo stack.

### Clear / Fill Layer

- **Edit → Clear Layer** — sets every cell in the active tile layer to empty (0).
- **Edit → Fill Layer** — sets every cell to the currently selected tile.

---

## Saving and Loading Maps

Maps are saved in [Tiled's `.tmj` JSON format](file-format.md), which is compatible with
Tiled itself and any Tiled-compatible game engine.

| Action | Shortcut | Description |
|--------|----------|-------------|
| Open… | Ctrl+O | Load a `.tmj` file into a new canvas |
| Save | Ctrl+S | Save to the current file path |
| Save As… | Ctrl+Shift+S | Save to a new file path |
| Export as Image… | — | Render the map to a PNG or JPEG |

!!! note "First save"
    A newly created map has no file path yet. The first **Ctrl+S** automatically opens
    the Save As dialog.

!!! tip "All layers exported"
    The image exporter renders every layer regardless of its visibility toggle, so the
    exported image always shows the complete map content.

---

## Managing Tilesets

Go to **Edit → Manage Tilesets…** to open the tileset management dialog for the active map.

**Add from PNG** — browse for a sprite-sheet image and enter a tileset name and tile
dimensions. The editor computes the tile count and column layout automatically.

**Remove** — removes the selected tileset. If any tile layer still references tiles from
that tileset, the removal is blocked and a warning is shown.

After adding or removing a tileset the Tile Palette updates automatically.

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
