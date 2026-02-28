# Getting Started

## Prerequisites

- Python 3.11 or later
- [Node.js 20+](https://nodejs.org/) (for building the frontend)
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

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

---

## Running the Editor

### Development mode (two terminals)

**Terminal 1 — API server** (auto-reloads Python changes):

```bash
python main.py --dev
```

**Terminal 2 — Vite dev server** (hot-reloads React changes):

```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.
The Vite dev server proxies all `/api` requests to the FastAPI server on port 8000.

### Production mode (single server, including iPad access)

Build the React app first:

```bash
cd frontend
npm run build
cd ..
```

Then start the server:

```bash
python main.py
```

The server serves both the API and the React app on `http://localhost:8000`.

**iPad access (same WiFi network):**

```bash
# Find your PC's LAN IP (Windows)
ipconfig | findstr IPv4

# Find your PC's LAN IP (macOS / Linux)
ip addr show | grep "inet "
```

Open `http://<your-pc-ip>:8000` on your iPad.

---

## Using the Editor

### Creating a map

1. Go to **File → New Tile Map** or **File → New Hex Map**.
2. Enter a name, choose dimensions and tile size, then click **OK**.

### Editing tools

| Tool | Keyboard | Description |
|------|----------|-------------|
| Paint | `1` | Paint the active tile onto the map |
| Erase | `2` | Erase tiles (set to empty) |
| Fill | `3` | Flood-fill a contiguous region |
| Point | `4` | Place / remove a named point object |

Paint and Erase accumulate the entire drag stroke into a **single undo step**.

### Navigation

| Action | Mouse | Touch (iPad) |
|--------|-------|--------------|
| Pan | Middle-drag or two-finger drag | Two-finger drag |
| Zoom | Scroll wheel | Pinch |
| Grid toggle | `G` | Toolbar button |

### Tile Palette

The **Tile Palette** panel shows the active tileset's sprite sheet. Tap / click any tile
to select it. The selected tile is used by the Paint and Fill tools.

### Layers

The **Layers** panel lists every layer. Click a layer name to make it active; toggle the
eye icon to show or hide it.

### Undo / Redo

| Action | Keyboard |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |

### Saving and Loading

| Action | Keyboard | Description |
|--------|----------|-------------|
| New Tile Map | `Ctrl+T` | Create a new tile map |
| New Hex Map | `Ctrl+H` | Create a new hex map |
| Open… | `Ctrl+O` | Browse server-saved maps or upload a `.tmj` file |
| Save | `Ctrl+S` | Save to the server |
| Download | — | Download raw `.tmj` to your device |

Maps are stored in Tiled's `.tmj` JSON format — compatible with Tiled and any
Tiled-compatible game engine.

---

## Managing Tilesets

Go to **Edit → Manage Tilesets…** to add or remove sprite sheets.

- **Add from file** — browse for a PNG and enter a tileset name and tile dimensions.
- **Remove** — removes the selected tileset. Blocked if any tile layer still references it.

---

## Installing Development Dependencies

```bash
pip install -r requirements-dev.txt
```

Run the Python test suite:

```bash
pytest tests/models tests/io tests/api -v
```

Run the frontend (Vitest) tests:

```bash
cd frontend
npm test
```

Preview the documentation locally:

```bash
PYTHONUTF8=1 mkdocs serve   # Windows
mkdocs serve                 # macOS / Linux
```

Then open `http://127.0.0.1:8000` (if the API server is not running on that port).

---

## Next Steps

- Read [Core Concepts](concepts.md) to understand how maps, layers, and tilesets fit together.
- Explore [Map Types](map-types.md) to learn how tile and hex maps differ.
- See [Architecture](architecture.md) for an overview of the codebase and build phases.
