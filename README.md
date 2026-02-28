# Fantasy RPG Map Editor

A web-based application for creating and editing fantasy RPG maps, built with FastAPI and React.

Supports two map scales in a single workspace:

- **Tile grid** — small-scale maps for towns, dungeons, interiors, and combat (square grid)
- **Hex grid** — large-scale maps for regions, continents, and world overviews (hexagonal grid)

Maps are saved in [Tiled](https://www.mapeditor.org/) `.tmj` format. The editor runs in any modern browser and is accessible from other devices (e.g. an iPad) on the same network.

---

## Features

- Dual-mode workspace: tile and hex maps side by side
- Multiple layers per map (tile layers and object/entity layers)
- Custom tileset support — load your own PNG sprite sheets
- Object and entity placement (NPCs, chests, spawn points, triggers, …)
- Full undo/redo history
- Tiled `.tmj` compatible save/load
- Touch support with pinch-to-zoom (iPad / touchscreen)
- Placeholder tile generator — usable out of the box with no external art

---

## Requirements

- Python 3.11+
- Node.js 20+

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
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install && cd ..
```

---

## Running

### Development mode (two terminals)

**Terminal 1 — API server** (auto-reloads Python changes):

```bash
python main.py --dev
```

**Terminal 2 — Vite dev server** (hot-reloads React changes):

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

### Production mode (single server)

```bash
cd frontend && npm run build && cd ..
python main.py
```

Open **http://localhost:8000** in your browser.

**LAN access** (e.g. iPad on the same WiFi): find your PC's IP and open `http://<ip>:8000`.

```bash
# Windows
ipconfig | findstr IPv4
```

---

## Testing

Install development dependencies:

```bash
pip install -r requirements-dev.txt
```

Run the Python test suite (178 tests):

```bash
pytest
```

Run the frontend test suite (27 tests):

```bash
cd frontend && npm test
```

---

## Project Structure

```
MapEditor_ClaudeCode/
├── main.py                        # Entry point — starts uvicorn on :8000
├── requirements.txt               # Runtime: fastapi, uvicorn, Pillow, python-multipart
├── requirements-dev.txt           # Dev: pytest, httpx, pytest-asyncio, mkdocs
│
├── server/                        # FastAPI backend
│   ├── main.py                    # FastAPI app, CORS, static file mount
│   └── api/
│       ├── maps.py                # Map CRUD + upload/download endpoints
│       └── tilesets.py            # Tileset image serving
│
├── map_editor/                    # Pure-Python model + I/O layer
│   ├── models/                    # Data models (zero Qt dependency)
│   │   ├── tileset.py             # TileCategory, TileDefinition, Tileset
│   │   ├── layer.py               # TileLayer (2-D grid), ObjectLayer
│   │   ├── tile_map.py            # TileMap container
│   │   ├── hex_map.py             # HexMap + hex coordinate math
│   │   └── map_object.py          # MapObject (free-form entities)
│   ├── io/
│   │   ├── tmj_writer.py          # write_tile_map / write_hex_map → .tmj JSON
│   │   └── tmj_reader.py          # read_map(path) → TileMap | HexMap
│   └── assets/
│       └── placeholders/          # Auto-generated sprite sheets (git-ignored)
│
├── frontend/                      # React + TypeScript SPA (Vite)
│   ├── index.html
│   ├── package.json               # React 18, Zustand 5, Vite 6, Vitest 2
│   ├── vite.config.ts             # Dev proxy: /api → http://localhost:8000
│   └── src/
│       ├── types/tmj.ts           # TypeScript interfaces mirroring TMJ format
│       ├── store/mapStore.ts      # Zustand store — map state + undo/redo
│       ├── api/client.ts          # fetch wrappers for all API endpoints
│       ├── canvas/                # HTML5 Canvas renderers (tile + hex)
│       ├── tools/                 # Paint, erase, fill, point-object tools
│       ├── components/            # React UI components + dialogs
│       └── __tests__/             # Vitest unit tests
│
├── tests/                         # Python pytest suite (178 tests)
│   ├── models/                    # Unit tests — pure data models
│   ├── io/                        # TMJ round-trip tests
│   └── api/                       # FastAPI endpoint tests (httpx)
│
├── maps/                          # Server-side .tmj file storage
└── docs/                          # MkDocs documentation source
```

---

## Documentation

Full documentation is in the `docs/` directory and built with [MkDocs](https://www.mkdocs.org/) + Material theme.

Preview locally (install dev dependencies first):

```bash
# macOS / Linux
mkdocs serve

# Windows
PYTHONUTF8=1 mkdocs serve
```

Then open `http://127.0.0.1:8000` (use a different port if the API server is already running there).

---

## License

MIT — see [LICENSE](LICENSE) for details.
