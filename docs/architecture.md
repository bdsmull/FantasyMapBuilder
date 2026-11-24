# Architecture

## Overview

```
Browser (desktop or iPad)
  React + TypeScript editor (Vite build)
  ├── Zustand stores: the open map, world set, view state
  ├── Canvas renderers: tiles, hexes, elevation, lines, footprints
  └── fetch → /api
        ↕  HTTP (port 8000, local network)
FastAPI server (Python)
  ├── /api/...          maps, world sets, tilesets, heights, .mapset, map import
  └── /                 the built editor (frontend/dist)
        ↕
Data folder (plain files, no database)
  <World set>/<World set>.worldset.json, maps/*.tmj, tilesets/*.tsj|png, heights/*.tif|png
```

**The browser owns the open map.** The whole map (Tiled JSON), its height patch and the undo
history live in the browser, so editing needs no server round-trips. **Save** sends the map,
writes its tilesets back to the shared `.tsj` files, and saves or deletes its height files.

**The server passes Tiled JSON through.** It stores and serves files, splits and joins external
tilesets, encodes height TIFFs, and builds or reads `.mapset` zips; it doesn't model maps.

---

## Project layout

```
FantasyMapBuilder/
├── main.py                      # Starts uvicorn on 0.0.0.0:8000 (--dev reload, --data-dir PATH)
├── requirements.txt             # fastapi, uvicorn, python-multipart, Pillow
├── requirements-dev.txt         # pytest, pytest-asyncio, pytest-cov, httpx, mkdocs, mkdocs-material
│
├── server/
│   ├── main.py                  # App, CORS, routers, serves frontend/dist
│   ├── data_dir.py              # Where the data folder is; safe names
│   ├── tileset_files.py         # Inline / externalize .tsj tilesets, swatch images
│   ├── heights.py               # Height TIFF + mask read/write
│   ├── map_scales.py            # Scale presets; writes each map's metersPerUnit on save
│   ├── heightmap_image.py       # 16-bit heightmap PNG encode, heightmap image decode
│   ├── map_import.py            # Single-map import planning (tileset merge, GID remap)
│   └── api/
│       ├── maps.py              # Map CRUD, upload, download, Tiled-style formatting
│       ├── world_sets.py        # World set CRUD, data folder info
│       ├── tilesets.py          # Tileset image upload and serving
│       ├── heights.py           # Binary height patch GET / PUT / DELETE
│       ├── heightmaps.py        # Engine heightmap image conversion (nothing stored)
│       ├── mapsets.py           # .mapset export / import
│       └── map_imports.py       # Inspect a .mapset, plan and run a map import
│
├── map_editor/                  # Python model library + TMJ reader/writer (tests, scripting)
│
├── frontend/src/
│   ├── App.tsx, main.tsx        # Layout, keyboard shortcuts
│   ├── types/                   # tmj.ts (Tiled JSON), worldSet.ts
│   ├── api/                     # client.ts (fetch wrappers), tmjFile.ts (custom properties ↔ fields)
│   ├── data/                    # mapScales.json (scale table; the server reads it too), mapScales.ts,
│   │                            # lineClasses.ts, defaultTilesets.ts
│   ├── store/
│   │   ├── mapStore.ts          # The open map, heights, tools, undo/redo
│   │   ├── worldSetStore.ts     # The active world set
│   │   ├── worldSurfaceStore.ts # Child maps' heights for the open map
│   │   ├── crossScaleStore.ts   # Related maps and ghost lines for the open map
│   │   ├── viewStore.ts         # Tool panel, tool modes, inspector, selections, Roads & rivers toggle
│   │   └── cursorStore.ts       # Pointer position (for the status bar)
│   ├── canvas/                  # tileRenderer, hexRenderer, hexGeometry, elevationOverlay,
│   │                            # waterOverlay, lineRenderer, footprintOverlay, canvasUtils
│   ├── tools/                   # inspect, terrain (paint / fill / erase), height, water,
│   │                            # line (roads, rivers), point
│   ├── utils/                   # heightGrid, heightBrush, terrainHeights, heightGeneration,
│   │                            # spotHeights, contours, surfaceFit, water, flow, carve, elevationFit,
│   │                            # worldSurface, worldSetUtils, worldWrap, ceilings, heightmap,
│   │                            # lines, crossScaleLines, inspect, importPlan, navigation, …
│   ├── components/              # MapCanvas, LayerPanel + ShowPanel (left), ToolPanel (right:
│   │                            # Terrain, HeightPanel, WaterPanel, LineControls), dialogs, hooks
│   └── __tests__/               # Vitest
│
├── tests/                       # pytest: models/, io/, api/
├── clients/                     # World coordinates outside the editor (World Coordinates page)
│   ├── godot/addons/worldset_coords/  # Godot 4 addon (GDScript); godot/tests: headless test runner
│   ├── python/worldset_coords/  # Python package (no dependencies); python/tests: pytest
│   └── conformance/             # Shared test world set + expected.json (written by Vitest)
└── docs/                        # This documentation (MkDocs)
```

---

## API

All routes are under `/api`. Names are world set and map names (URL-encoded).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/data_dir` | The data folder in use |
| `GET` | `/world_sets` | List world sets |
| `GET` / `POST` / `DELETE` | `/world_sets/{name}` | Load / create or replace / delete (moves to `.trash`) a world set |
| `GET` | `/maps` | List maps in every world set |
| `GET` | `/world_sets/{ws}/maps` | List a world set's maps |
| `GET` / `POST` / `DELETE` | `/world_sets/{ws}/maps/{name}` | Load (tilesets inlined) / save (tilesets written back; returns their references) / delete a map |
| `POST` | `/world_sets/{ws}/maps/upload` | Upload a `.tmj` (multipart). Registered before `{name}` so it isn't taken as a map name |
| `GET` | `/world_sets/{ws}/maps/{name}/download` | The raw `.tmj` |
| `POST` | `/world_sets/{ws}/tilesets/images` | Upload a sprite sheet |
| `GET` | `/world_sets/{ws}/tilesets/{file}` | Serve a tileset image |
| `GET` | `/tilesets/{path}` | Serve an image by absolute path (old maps) |
| `GET` / `PUT` / `DELETE` | `/world_sets/{ws}/heights/{name}` | Height patch as binary: little-endian int32 cm, then one mask byte per sample; size in `X-Height-Cols` / `X-Height-Rows` headers |
| `POST` | `/heightmaps/png` | Pack 16-bit heightmap steps (multipart `values`, `width`, `height`, `info`) into a grayscale PNG |
| `POST` | `/heightmaps/decode` | Unpack a heightmap image (multipart `file`): samples as binary; size and layout in `X-Heightmap-*` headers |
| `GET` | `/mapsets/{ws}` | Export a world set as `.mapset` |
| `POST` | `/mapsets` | Import a `.mapset` (optional new name) |
| `POST` | `/mapsets/inspect` | List the maps in an uploaded `.mapset` (for single-map import) |
| `POST` | `/world_sets/{ws}/import_map/plan` | Plan importing one map: tileset conflicts and choices |
| `POST` | `/world_sets/{ws}/import_map` | Import one map with the chosen tileset handling |

---

## Key design decisions

### Tiled compatibility first

Maps, tilesets and objects are plain Tiled files; editor settings are Tiled custom properties;
hex geometry mirrors Tiled's renderer exactly. Anything Tiled can open stays openable, and Tiled
keeps the editor's data when it saves.

### One folder per world set

A world set's maps, tilesets and heights travel together (and as one `.mapset` zip). No database:
the server reads and writes files, and the data folder is configurable.

### Child maps lead, parents summarize

Each map owns its heights and lines. A parent shows its children's heights and lines derived from
the children's files, without changing its own. A child's position in meters (its anchor, real
size and optional offset, chained up the hierarchy) is computed in one place
(`worldSetUtils.childRect` / `worldSurface.placeChild`) and used by elevation, lines, generation,
footprints and overlap warnings.

### One store per concern

Stores don't import each other. Cross-store steps (opening a map with an unsaved-changes guard,
switching world sets) live in `utils/navigation.ts`. Data from other maps (child heights, related
maps' lines) is fetched by hooks (`useWorldSurface`, `useCrossScaleLines`) into their own stores
when the open map changes.

### Patch-based undo

Undo steps record what changed, not snapshots of the whole map: tile changes per stroke, object
additions and removals, height-sample changes per stroke (or, for whole-surface operations like
re-base and generation, the grid before and after), and the layer list before and after for
layer and line edits (layers are never mutated in place, so keeping the old list is cheap).

### Pointer Events

`MapCanvas` uses Pointer Events for mouse and touch alike; two pointers pinch-zoom. Tools
implement one interface (`onPress`, `onDrag`, `onRelease`, optional `onRightPress`, `onCancel`).

---

## Testing

See [Testing](testing.md).
