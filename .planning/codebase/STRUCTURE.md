# Directory Structure

## Root

```
MapEditor_ClaudeCode/
├── main.py                  # Entry point: starts uvicorn, handles --dev flag
├── server/                  # FastAPI application
├── map_editor/              # Python domain models + IO (used by tests, not runtime server)
├── frontend/                # React/TypeScript SPA
├── maps/                    # Stored .tmj map files (flat, no subdirectories)
├── saves/                   # (legacy?) additional .tmj save files
├── tests/                   # Python test suite
├── docs/                    # MkDocs documentation source
├── site/                    # MkDocs built output (committed)
├── requirements.txt         # Runtime Python dependencies
├── requirements-dev.txt     # Dev Python dependencies (pytest, httpx, etc.)
├── pytest.ini               # Pytest configuration
├── mkdocs.yml               # MkDocs configuration
└── .venv/                   # Python virtual environment (not committed)
```

## Backend (`server/`)

```
server/
├── __init__.py
├── main.py                  # FastAPI app factory: CORS, routers, SPA mount
└── api/
    ├── __init__.py
    ├── maps.py              # Map CRUD endpoints (GET/POST/DELETE + upload/download)
    └── tilesets.py          # Tileset image serving endpoints
```

## Python Domain Models (`map_editor/`)

```
map_editor/
├── __init__.py
├── models/
│   ├── tile_map.py          # TileMap dataclass (rectangular maps)
│   ├── hex_map.py           # HexMap dataclass (hex grid maps)
│   ├── layer.py             # Layer, TileLayer, ObjectLayer dataclasses
│   ├── tileset.py           # Tileset dataclass + make_default_tile_tileset()
│   └── map_object.py        # MapObject dataclass (point/polygon/ellipse objects)
├── io/
│   ├── tmj_reader.py        # Parse TMJ JSON → Python domain objects
│   └── tmj_writer.py        # Python domain objects → TMJ JSON
└── assets/
    ├── placeholders/        # Placeholder tileset images
    └── renders/             # Rendered map previews
```

## Frontend (`frontend/`)

```
frontend/
├── index.html               # Vite entry HTML
├── package.json             # JS dependencies + scripts
├── vite.config.ts           # Vite config (dev proxy to :8000, etc.)
├── tsconfig.json            # TypeScript config
├── dist/                    # Production build output (served by FastAPI)
└── src/
    ├── main.tsx             # React root render
    ├── App.tsx              # Top-level layout + routing
    ├── App.css              # Global styles
    ├── api/
    │   └── client.ts        # Fetch wrappers for all backend endpoints
    ├── canvas/
    │   ├── tileRenderer.ts  # Rectangular map canvas renderer
    │   ├── hexRenderer.ts   # Hex map canvas renderer (viewport culling + tile cache)
    │   └── canvasUtils.ts   # Shared viewport math, tile lookup helpers
    ├── components/
    │   ├── MapCanvas.tsx    # Main canvas: Pointer Events, pinch-zoom, tool dispatch
    │   ├── TilePalette.tsx  # Tileset tile picker panel
    │   ├── LayerPanel.tsx   # Layer list + visibility toggles
    │   ├── Toolbar.tsx      # Tool selection bar
    │   ├── MenuBar.tsx      # File/Edit menu bar
    │   ├── StatusBar.tsx    # Status/cursor info bar
    │   └── dialogs/
    │       ├── NewMapDialog.tsx     # Create new map form
    │       ├── OpenMapDialog.tsx    # Open existing map dialog
    │       └── TilesetDialog.tsx    # Add/remove tilesets dialog
    ├── data/
    │   ├── defaultTilesets.ts  # Built-in tileset definitions
    │   └── mapScales.ts        # Map scale/zoom level definitions
    ├── store/
    │   └── mapStore.ts      # Zustand store: all editor state + undo/redo
    ├── tools/
    │   ├── baseTool.ts      # Tool interface
    │   ├── paintTool.ts     # Paint tile tool
    │   ├── eraseTool.ts     # Erase tile tool
    │   ├── fillTool.ts      # BFS flood fill tool
    │   └── pointTool.ts     # Object placement tool
    └── types/
        └── tmj.ts           # TypeScript types for TMJ JSON format
```

## Tests

```
tests/
├── conftest.py              # Root-level pytest fixtures
├── api/
│   ├── conftest.py          # Patches _MAPS_DIR to tmp dir; httpx AsyncClient fixture
│   └── test_api.py          # API endpoint integration tests
├── io/
│   ├── conftest.py          # IO test fixtures
│   └── test_tmj_io.py       # TMJ read/write round-trip tests
└── models/
    ├── test_tile_map.py     # TileMap model unit tests
    ├── test_hex_map.py      # HexMap model unit tests
    ├── test_layer.py        # Layer model unit tests
    ├── test_tileset.py      # Tileset model unit tests
    └── test_map_object.py   # MapObject model unit tests

frontend/src/__tests__/
├── fillTool.test.ts         # BFS flood fill unit tests
├── hexRenderer.test.ts      # Hex renderer unit tests
├── mapStore.test.ts         # Zustand store unit tests
└── tileRenderer.test.ts     # Tile renderer unit tests
```

## Documentation (`docs/`)

```
docs/
├── index.md
├── architecture.md
├── concepts.md
├── coordinates.md
├── file-format.md
├── getting-started.md
├── layers.md
├── map-types.md
├── objects.md
├── testing.md
├── tilesets.md
└── world-sets-design.md     # Untracked design doc (in-progress)
```
