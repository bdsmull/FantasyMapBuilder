# Fantasy RPG Map Builder

A web-based editor for fantasy RPG maps, built with FastAPI and React.

Maps range from a single room to the whole world. They link into a navigable hierarchy
called a **world set**, so you can click from a world map down to a dungeon room and back,
with every level of geography connected.

Maps are saved in [Tiled](https://www.mapeditor.org/) `.tmj` format, so Tiled and
Tiled-compatible game engines can open them. The editor runs in any modern browser and
works from other devices on the same network, such as an iPad.

---

## Features

- **Square or hex grids at any scale** — 11 scale levels from Room (1 m / 2 ft cells) to
  World (500 km / 500 mi), in metric or imperial
- **World sets** — place child maps on their parents, navigate by clicking, see true-size
  footprints, and position small maps exactly (e.g. a town on its city marker)
- **Layers** — tile and object layers; add, rename, delete, reorder, opacity
- **Tilesets** — built-in color tilesets or your own PNG sprite sheets, shared by every map in a
  world set as Tiled external tilesets
- **Elevation** — a height surface per map: paint it, build it from terrain types, generate
  natural detail, fit it to known spot heights and traced contour lines, and see child maps'
  heights on their parents
- **Water** — lakes and seas that fill their basins, an automatic sea below 0 m, streams and
  hollows worked out from the heights (each stream can become a drawn river), and drawn rivers
  carved into the ground
- **Roads and rivers** — drawn as lines with real-world widths; lines show across map scales
  and can be copied down to a more detailed map and refined there
- **Inspect tool** — click anywhere to see terrain, elevation, objects and child maps
- **Undo / redo** for every edit
- **Portable** — export or import a whole world set as one `.mapset` file, or import a single map
- **Touch support** — pinch to zoom and pan on iPad and touchscreens

---

## Requirements

- Python 3.11 or later (developed on 3.14)
- Node.js 20 or later

---

## Setup

```bash
git clone https://github.com/bdsmull/FantasyMapBuilder.git
cd FantasyMapBuilder
python -m venv .venv
```

Activate the virtual environment:

| Platform | Command |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

```bash
pip install -r requirements.txt
cd frontend && npm ci && cd ..
```

---

## Running

### Development mode (two terminals)

**Terminal 1 — API server** (reloads Python changes):

```bash
python main.py --dev
```

**Terminal 2 — Vite dev server** (hot-reloads frontend changes):

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173**.

### Production mode (one server)

```bash
cd frontend && npm run build && cd ..
python main.py
```

Open **http://localhost:8000**. From an iPad or another computer on the same network,
open `http://<this computer's IP>:8000` (on Windows, `ipconfig | findstr IPv4` shows the IP).

### Where your maps are stored

World sets live in a data folder, by default `world_sets/` in the project. To use another
folder (for example a synced drive), use any of these, highest priority first:

- `python main.py --data-dir PATH`
- the `MAPEDITOR_DATA_DIR` environment variable
- `{"dataDir": "PATH"}` in `mapeditor.config.json` at the project root

The data folder is not committed to git.

---

## Testing

```bash
pip install -r requirements-dev.txt
pytest                         # Python: models, TMJ I/O and API (253 tests)
cd frontend && npm test        # Frontend: Vitest (385 tests)
```

---

## Project structure

```
FantasyMapBuilder/
├── main.py                 # Entry point: starts the server on :8000 (--dev, --data-dir)
├── server/                 # FastAPI backend: maps, world sets, tilesets, heights, .mapset, import
├── map_editor/             # Python model library and TMJ reader/writer (used by tests and tools)
├── frontend/               # React + TypeScript editor (Vite, Zustand)
│   └── src/
│       ├── components/     # UI panels, canvas, dialogs
│       ├── canvas/         # Renderers: tiles, hexes, elevation, lines, footprints
│       ├── tools/          # Inspect, Paint, Erase, Fill, Point, Height, Line
│       ├── store/          # Zustand stores
│       ├── utils/          # Elevation, placement, lines, import logic
│       └── __tests__/      # Vitest tests
├── tests/                  # pytest suite
├── docs/                   # Documentation (MkDocs)
└── world_sets/             # Default data folder (not in git)
```

See the [architecture page](docs/architecture.md) for details.

---

## Documentation

The full documentation is in [`docs/`](docs/index.md), built with
[MkDocs](https://www.mkdocs.org/) and the Material theme:

```bash
pip install -r requirements-dev.txt
mkdocs serve -a 127.0.0.1:8001    # Windows: set PYTHONUTF8=1 first
```

Then open `http://127.0.0.1:8001` (port 8000 is used by the editor's server).

The [changelog](CHANGELOG.md) lists what changed in each release.

---

## License

MIT — see [LICENSE](LICENSE) for details.
