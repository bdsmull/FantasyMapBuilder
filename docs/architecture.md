# Architecture

## Stack overview

```
iPad / Desktop Browser
        ↕  HTTP (port 8000, LAN)
┌───────────────────────────────────────┐
│  FastAPI server (Python)              │
│  ├── /api/maps    (CRUD + upload)     │  map_editor/models/ + io/ (unchanged)
│  ├── /api/tilesets (image serving)   │
│  └── /            (React SPA build)  │
└───────────────────────────────────────┘
```

**Client-authoritative state model:** the full TMJ JSON document lives in the
browser (Zustand store). All edits mutate local state immediately for zero-latency
feedback. Save = a single `POST /api/maps/{name}`. No round-trips on individual
paint strokes.

---

## Project layout

```
FantasyMapBuilder/
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
├── map_editor/                    # Pure-Python model layer (unchanged from desktop)
│   ├── models/                    # Zero Qt dependency
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
│       ├── canvas/
│       │   ├── tileRenderer.ts    # HTML5 Canvas tile map renderer
│       │   ├── hexRenderer.ts     # HTML5 Canvas hex map renderer
│       │   └── canvasUtils.ts     # screenToTile, tileToScreen, image cache
│       ├── tools/
│       │   ├── baseTool.ts        # Tool interface
│       │   ├── paintTool.ts       # Paint on drag
│       │   ├── eraseTool.ts       # Erase on drag
│       │   ├── fillTool.ts        # BFS flood fill (ported from Python)
│       │   └── pointTool.ts       # Place/remove point objects
│       ├── components/
│       │   ├── MapCanvas.tsx      # <canvas> + pointer events + pinch zoom
│       │   ├── LayerPanel.tsx     # Layer list with visibility toggles
│       │   ├── TilePalette.tsx    # Sprite sheet tile selector
│       │   ├── Toolbar.tsx        # Tool buttons + zoom controls
│       │   ├── MenuBar.tsx        # File/Edit/View menus
│       │   ├── StatusBar.tsx      # Cursor position + zoom %
│       │   └── dialogs/           # NewMapDialog, OpenMapDialog, TilesetDialog
│       └── __tests__/             # Vitest unit tests (no DOM)
│
├── tests/                         # Python tests
│   ├── conftest.py                # autouse fixture: reset MapObject ID counter
│   ├── models/                    # 144 unit tests — pure Python
│   ├── io/                        # 20 TMJ round-trip tests
│   └── api/                       # 14 FastAPI endpoint tests (httpx)
│
├── maps/                          # Server-side .tmj file storage
└── docs/                          # MkDocs source (this documentation)
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/maps` | List saved map names |
| `GET` | `/api/maps/{name}` | Load a map (returns TMJ JSON) |
| `POST` | `/api/maps/{name}` | Save (create or overwrite) a map |
| `DELETE` | `/api/maps/{name}` | Delete a map file |
| `POST` | `/api/maps/upload` | Upload a `.tmj` file (multipart) |
| `GET` | `/api/maps/{name}/download` | Download raw `.tmj` file |
| `GET` | `/api/tilesets/{path:path}` | Serve a tileset image by absolute path |

---

## Key design decisions

### Axial hex coordinates

All hex math is performed in axial space `(q, r)`. The third cube coordinate `s = -q - r`
is implicit. Offset coordinates `(col, row)` are used only at storage boundaries.

### 1-based tile IDs / GIDs

Tile IDs stored in layers are 1-based; `0` is reserved for "empty". This matches the
Tiled editor convention. When multiple tilesets are attached, `firstgid` offsets are baked
in to produce *global* IDs (GIDs).

### Patch-based undo/redo

The Zustand store records undo history as `TileChange[]` batches — one batch per stroke —
rather than full state snapshots. This keeps memory bounded on large maps. A single
`commitPendingTiles()` call promotes the accumulated `pendingTiles` to one undo step.

### Pointer Events API

`MapCanvas.tsx` uses the W3C Pointer Events API (`onPointerDown/Move/Up`) for unified
mouse and touch handling. Two active pointers trigger pinch-to-zoom via distance delta.

### Pure model layer

`map_editor/models/` has zero Qt dependency. Models are imported by the FastAPI server
for TMJ serialisation without touching the UI.

---

## Testing strategy

See [Testing](testing.md) for commands and coverage details.
