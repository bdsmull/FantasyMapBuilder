# Architecture

## System Overview

Fantasy RPG Map Editor is a web application with a Python FastAPI backend and a React/TypeScript frontend. The backend serves a REST API for map CRUD and tileset images, and also serves the compiled React app as a SPA. In dev mode, Vite serves the frontend with HMR while the FastAPI backend runs separately.

```
Browser (React SPA)
    │   Pointer events / Canvas API
    ▼
frontend/src/
    ├── Zustand store (mapStore.ts) — single source of truth
    ├── Canvas renderers (canvas/) — tileRenderer.ts, hexRenderer.ts
    ├── Tools (tools/) — paint, erase, fill, point
    └── Components (components/) — MapCanvas, TilePalette, LayerPanel, ...
    │
    │   HTTP / fetch (api/client.ts)
    ▼
FastAPI (server/)
    ├── /api/maps  — CRUD + upload + download of .tmj files
    └── /api/tilesets — tileset image serving
    │
    └── maps/  — .tmj files on disk (flat directory, no DB)
```

## Backend Architecture

- **Entry point**: `main.py` → invokes `uvicorn server.main:app`
- **App factory**: `server/main.py` — creates FastAPI app, registers CORS middleware, includes routers, mounts React dist as SPA
- **Routers**:
  - `server/api/maps.py` — `GET /api/maps`, `GET/POST/DELETE /api/maps/{name}`, `POST /api/maps/upload`, `GET /api/maps/{name}/download`
  - `server/api/tilesets.py` — tileset image endpoints
- **Storage**: flat `.tmj` files in `maps/` directory — no database
- **Python domain models** (`map_editor/` package): `TileMap`, `HexMap`, `Layer`, `TileLayer`, `ObjectLayer`, `Tileset`, `MapObject` — used by Python tests and IO layer; NOT used by the FastAPI server at runtime (server works directly with JSON)
- **IO layer** (`map_editor/io/`): `tmj_reader.py`, `tmj_writer.py` — read/write Tiled TMJ format

## Frontend Architecture

- **Entry**: `frontend/src/main.tsx` → renders `<App />`
- **App**: `frontend/src/App.tsx` — top-level layout, routes
- **State**: `frontend/src/store/mapStore.ts` (Zustand) — single store holds all editor state: map data, active layer, active GID, selected tool, zoom/pan, undo/redo stacks
- **Canvas renderers** (`frontend/src/canvas/`):
  - `tileRenderer.ts` — renders rectangular/square tile maps to HTML5 Canvas
  - `hexRenderer.ts` — renders hex maps; flat-top and pointy-top; viewport culling + tile cache optimizations
  - `canvasUtils.ts` — shared utilities (tile lookup, viewport math)
- **Tools** (`frontend/src/tools/`): `baseTool.ts` (interface), `paintTool.ts`, `eraseTool.ts`, `fillTool.ts` (BFS flood fill), `pointTool.ts` (object placement)
- **Components** (`frontend/src/components/`): `MapCanvas.tsx` (Pointer Events API, pinch-zoom), `TilePalette.tsx`, `LayerPanel.tsx`, `Toolbar.tsx`, `MenuBar.tsx`, `StatusBar.tsx`; dialogs: `NewMapDialog.tsx`, `OpenMapDialog.tsx`, `TilesetDialog.tsx`
- **API client**: `frontend/src/api/client.ts` — thin fetch wrappers for all backend endpoints
- **Types**: `frontend/src/types/tmj.ts` — TypeScript interfaces mirroring the TMJ JSON format

## Data Flow

1. User opens a map → `api/client.ts` fetches `GET /api/maps/{name}` → JSON returned → `store.loadMap()` sets `mapData`
2. User paints tiles → tool calls `store.applyTile()` per cell → on pointer-up `store.commitPendingTiles()` creates one undo step
3. User flood-fills → `bfsFloodFill()` returns cell array → `store.applyFill()` does one data copy + one undo step
4. User saves → `store.saveMapToServer()` → `POST /api/maps/{name}` with full TMJ JSON body
5. Canvas renders on every store change via React re-render → `useEffect` redraws canvas

## State Management

Zustand store (`mapStore.ts`) is the single source of truth:
- `mapData: TmjMap | null` — full TMJ JSON in memory
- `activeLayerIndex`, `activeGid`, `selectedTool`, `zoom`, `pan`, `showGrid`
- **Undo/redo**: `past: UndoStep[]`, `future: UndoStep[]`, `pendingTiles: TileChange[]`
  - `UndoStep` = `{ type: 'tiles', changes: TileChange[] }` | `{ type: 'object-add' }` | `{ type: 'object-remove' }`
  - Tile strokes accumulate in `pendingTiles` during drag; committed as one step on pointer-up
  - Fill is one atomic step via `applyFill()`

## Key Design Decisions

- **No database** — maps stored as `.tmj` files (Tiled-compatible JSON format) in `maps/` directory; simple and portable
- **Python models not used at runtime** — the FastAPI server passes TMJ JSON through without deserializing into Python domain objects; models exist for tests and IO only
- **Upload route must precede `{name}` route** — FastAPI matches routes in order; `/api/maps/upload` must be registered before `/api/maps/{name}` or upload requests are captured by the name route
- **TMJ format** — uses Tiled map editor's JSON format, enabling compatibility with Tiled tooling
- **LAN-accessible** — server binds to `0.0.0.0:8000`, accessible from iPad/tablet on same WiFi
