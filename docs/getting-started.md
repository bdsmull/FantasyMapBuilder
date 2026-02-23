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
