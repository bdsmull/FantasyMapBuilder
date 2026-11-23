# Getting Started

## Prerequisites

- Python 3.11 or later (developed on 3.14)
- [Node.js 20+](https://nodejs.org/)
- Git

---

## Installation

```bash
git clone https://github.com/bdsmull/FantasyMapBuilder.git
cd FantasyMapBuilder
python -m venv .venv
```

Activate the environment:

| Platform | Command |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

Install the dependencies:

```bash
pip install -r requirements.txt
cd frontend
npm ci
cd ..
```

---

## Running the editor

### Development mode (two terminals)

**Terminal 1 — API server** (reloads Python changes):

```bash
python main.py --dev
```

**Terminal 2 — Vite dev server** (hot-reloads frontend changes):

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. The Vite dev server passes `/api` requests to the API server on
port 8000.

### Production mode (one server, including iPad access)

```bash
cd frontend
npm run build
cd ..
python main.py
```

The server serves both the API and the editor on `http://localhost:8000`.

**From an iPad or another computer on the same network:** find this computer's address
(`ipconfig | findstr IPv4` on Windows, `ip addr show | grep "inet "` on macOS / Linux) and open
`http://<address>:8000`. The server has no login and is meant for a home or studio network only.

### Where maps are stored

Each world set is a folder in the **data folder**, by default `world_sets/` in the project.
To keep your maps somewhere else (for example a synced drive), use one of these, highest
priority first:

| How | Example |
|-----|---------|
| Command-line option | `python main.py --data-dir D:\Maps` |
| Environment variable | `MAPEDITOR_DATA_DIR=D:\Maps` |
| Config file `mapeditor.config.json` in the project | `{"dataDir": "D:/Maps"}` |

See [World Sets & Scales](world-sets.md#on-disk) for what's inside a world set folder.

---

## The editor at a glance

| Area | Contents |
|------|----------|
| **Menu bar** | File, Edit and View menus |
| **Toolbar** | Tools, undo/redo, zoom, grid |
| **Left panel** | What the map is: the world set hierarchy, **Layers**, and **Show** (what's drawn over the map) |
| **Canvas** | The map |
| **Tool panel** (right) | The active tool's settings, e.g. the tile palette for Terrain (hide it with × or `P`; show it again from View → Tool Panel, or by choosing the tool again) |
| **Status bar** | Parent map link, map name (`*` = unsaved), size, scale, elevation under the cursor, zoom |

On narrow screens (an iPad in portrait) the left panel slides in from the **☰** button and the
tool panel sits under the map.

Each section of the panels (Layers, Show, the Height tool's Brush and Elevation …) collapses
from its header; the editor remembers which ones you closed.

---

## Creating and opening maps

**File → New Map…** (`Ctrl+N`):

1. Choose the **world set** the map belongs to, a **name**, and **Type**: square tiles or hexes.
2. Pick a **Scale** (Room 1 m … World 500 km) and, if needed, **Units** (metric or imperial;
   by default the world set's).
3. Set the size in cells and the on-screen cell size: tile width and height in pixels for square
   maps, the side length for hex maps (new hex maps are regular, flat-topped hexes; pointy-topped
   maps made in Tiled open fine).
4. Leave **Include default tileset** checked to start with a color tileset: **Coarse Detail**
   (plains, forest, mountains…) for Town scale and larger, **Fine Detail** (grass, stone floor,
   walls…) for Site scale and smaller.

**File → Open…** (`Ctrl+O`) lists the maps of the active world set, or of **All world sets**.
You can also upload a `.tmj` file from your device.

**File → Map Properties…** changes a map's scale and units.

---

## Tools

Tools are grouped by subject; each one only changes its own kind of thing.

| Tool | Key | What it does |
|------|-----|--------------|
| **Inspect** | `I` | Click to see what's at a point (terrain on each layer, elevation, objects and their properties, child maps); drag to pan. Never changes the map |
| **Terrain** | `1` | Tiles on the selected tile layer: **Paint** the selected tile (a whole stroke is one undo step), **Fill** a connected area of the same tile, or **Erase**. On desktop, **Shift+click** fills and **dragging with the right button** erases, whatever the mode |
| **Height** | `2` | Add the map's elevation, then paint it, place spot heights or draw contour lines (see [Elevation](elevation.md)) |
| **Water** | `3` | **Lakes & sea** (needs elevation) and **Rivers**: draw rivers, streams, brooks and canals, turn the Flow view's streams into rivers, carve them in (see [Water](elevation.md#water)) |
| **Roads** | `4` | Draw and edit roads, paths and trails (see [Roads & Rivers](roads-rivers.md)) |
| **Points** | `5` | Place a point object; right-click removes the nearest (on maps outside a world set; inside one, right-click opens the map menu) |

Erasing belongs to each tool: Terrain erases tiles, and the others delete what you select
(a spot, a lake, a road …) with **Delete** or the panel's delete button.

### Navigating the map

| Action | Mouse | Touch |
|--------|-------|-------|
| Pan | Middle-drag, or drag with the Inspect tool | Drag with the Inspect tool |
| Zoom | Scroll wheel, or the toolbar − / + | Pinch |
| Reset to 100% | Toolbar ⤢, View → Reset Zoom | Toolbar ⤢ |
| Grid on/off | `G` | Toolbar Grid |

### Undo and redo

`Ctrl+Z` and `Ctrl+Y` (or the toolbar). Every edit is undoable: tiles, objects, layer changes,
heights, spot heights, contours, water and lines.

---

## Layers and Show

The **Layers** section lists the map's layers, top first.

- **Select** a layer by clicking it; Terrain paints on the selected tile layer, Points places on
  the selected object layer.
- **Show / hide** with the checkbox (hidden layers can still be edited).
- **+ Tile** / **+ Objects** add a layer above the selected one.
- **↑ / ↓** reorder, **Rename** (or double-click), **Delete** (asks first if the layer has content),
  and the **Opacity** slider.

The **Show** section sets what's drawn over the map, whatever tool you're using; nothing in it
changes the map:

- **Roads & rivers** — every road and river on the map, plus those from parent and child maps
  (see [Roads & Rivers](roads-rivers.md#showing-lines))
- **Elevation** with its opacity, hillshade and child maps; **Water**; **Flow** with its stream
  detail (see [Elevation](elevation.md#viewing-heights))

---

## Saving and sharing

| Action | Where | Notes |
|--------|-------|-------|
| Save | File → Save, `Ctrl+S` | Saves the map, its elevation and any changed tilesets |
| Download | File → Download .tmj | The raw Tiled file |
| Export image | File → Export as PNG | The whole map as a picture |
| Export a world set | Edit → World Sets… → Export | One `.mapset` file with every map, tileset and height file |
| Import | Edit → World Sets… → Import .mapset… / Import map… | See [World Sets](world-sets.md#moving-world-sets-between-computers) |

---

## Tilesets

**Edit → Manage Tilesets…** lists the map's tilesets:

- **Add Coarse Detail** / **Add Fine Detail** — a built-in color tileset (see [Tilesets](tilesets.md#built-in-tilesets))
- **Add from PNG…** — your own sprite sheet (name and tile size)
- **Heights…** — base height and relief per terrain type (see [Elevation](elevation.md#heights-from-terrain))
- **Remove** — only when no layer uses the tileset

Tilesets are shared by every map in the world set. See [Tilesets](tilesets.md).

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New map / Open / Save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `I`, `1`–`5` | Tools: Inspect, Terrain, Height, Water, Roads, Points |
| `Shift`+click | Terrain: fill, in any mode |
| Right-drag | Terrain: erase, in any mode |
| `G` | Grid on/off |
| `P` | Tool panel on/off |
| `Esc` | Close a dialog or the inspector; cancel a line being drawn |
| `Enter` / `Backspace` / `Delete` | Roads, and Water → Rivers: finish a line / remove its last point / delete the selected point or line |

---

## Next steps

- [World Sets & Scales](world-sets.md) — link maps from world to room
- [Core Concepts](concepts.md) — how maps, layers, tilesets and objects fit together
- [Testing](testing.md) and [Contributing](contributing.md) — for development
