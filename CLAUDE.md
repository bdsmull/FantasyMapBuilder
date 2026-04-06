<!-- GSD:project-start source:PROJECT.md -->
## Project

**Fantasy RPG Map Editor**

A web-based tile map editor for fantasy RPG worldbuilding, accessible from desktop and tablet (iPad) on a local network. Users create and edit tile maps and hex maps at different geographic scales — from individual rooms up to world maps — and link them into a navigable hierarchy called a World Set.

**Core Value:** A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

### Constraints

- **Tech stack:** FastAPI + React/TypeScript — no new frameworks; extend existing patterns
- **Data format:** Tiled TMJ JSON — world set files are a companion format (`.worldset.json`), maps stay clean
- **Backward compatibility:** Existing maps without `feetPerUnit` must load and work; World Set overlay degrades gracefully (placeholder footprint + prompt)
- **No database:** File-based storage only; world sets live in `world_sets/` alongside `maps/`
- **Local LAN only:** CORS open, no auth needed; not designed for internet exposure
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- **Python 3.14** — backend server, data models, tests
- **TypeScript 5.6** — all frontend source code (`frontend/src/`)
- **CSS** — component styles (`frontend/src/App.css`)
## Backend
- Python 3.14 (managed via `.venv` virtualenv at `.venv/`)
- Entry point: `main.py` → launches uvicorn programmatically
- Run command: `python main.py` (prod) / `python main.py --dev` (hot-reload)
- FastAPI 0.134 (`server/main.py`) — async REST API
- Uvicorn 0.41 with `[standard]` extras — ASGI server, listens on `0.0.0.0:8000`
- `python-multipart >=0.0.9` — multipart form uploads (tileset/map file upload)
- `Pillow 12.1 (>=10.0)` — image processing for tileset sprites
- `fastapi.middleware.cors.CORSMiddleware` — CORS open to `*` (LAN-only server)
- `fastapi.staticfiles.StaticFiles` — serves React SPA from `frontend/dist/` in production
- `server/api/maps.py` — map CRUD (list, get, save, delete, upload, download)
- `server/api/tilesets.py` — serve sprite-sheet images from local filesystem
## Frontend
- React 18.3 with TypeScript (`frontend/src/`)
- JSX transform: `react-jsx` (no explicit React import needed)
- Vite 6.0 — dev server on default port (proxies `/api` → `localhost:8000`), bundles to `frontend/dist/`
- Plugin: `@vitejs/plugin-react 4.3`
- Build command: `cd frontend && npm run build` (`tsc && vite build`)
- `zustand 5.0` — global state store (`frontend/src/store/mapStore.ts`)
- No routing library — single-page app with no client-side routes
- Target: `ES2020`, module resolution: `bundler`
- Strict mode: on; `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all enabled
## Data / Storage
- **Local filesystem** — map files stored as `.tmj` (Tiled Map JSON) in `maps/` directory at project root
- No database — pure file-based persistence
- No cache layer — in-memory only during server lifetime
- Tileset images referenced by absolute filesystem path within `.tmj` files; served via `GET /api/tilesets/{path:path}`
## Dev Tooling
- `pytest >=8.0` — test runner; config in `pytest.ini` (`testpaths = tests`, `--tb=short -q`)
- `pytest-asyncio >=0.23` — async test support for FastAPI endpoints
- `pytest-cov >=5.0` — coverage reporting
- `httpx >=0.27` — async HTTP client for API integration tests
- `vitest 2.1` — test runner configured in `vite.config.ts` (`environment: node`, `globals: true`)
- Run: `cd frontend && npm run test`
- `mkdocs >=1.6` with `mkdocs-material >=9.5` theme — project docs at `docs/`, built to `site/`
- Config: `mkdocs.yml` at project root
- Python: pip + `.venv` (no lockfile; `requirements.txt` / `requirements-dev.txt`)
- JS: npm (lockfile: `frontend/package-lock.json`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Python Style
- `from __future__ import annotations` in all modules (deferred type evaluation)
- `@dataclass` for all domain models — no manual `__init__`
- Full type annotations on all public functions and methods
- `Optional[T]` used over `T | None` (pre-3.10 style)
- Module-level constants: `_UPPER_SNAKE_CASE` (leading underscore = private)
- Docstrings on all public classes and non-trivial methods; single-line docstrings for simple properties
- No formatter/linter config detected (no `pyproject.toml [tool.ruff]`, no `.flake8`) — consistency maintained manually
- `pathlib.Path` used throughout (no `os.path`)
## TypeScript Style
- `tsconfig.json` strict mode with `noUnusedLocals`, `noUnusedParameters`
- `interface` for data shapes, `type` for unions and aliases
- `camelCase` for functions and variables
- `PascalCase` for interfaces, types, React components
- `_UPPER_SNAKE` for module-level constants (mirrors Python)
- Pure functions preferred in canvas/tools modules; side effects isolated in store
- `import type` used for type-only imports
## Naming Conventions
| Context | Python | TypeScript |
|---|---|---|
| Functions/methods | `snake_case` | `camelCase` |
| Classes/interfaces | `PascalCase` | `PascalCase` |
| Module constants | `_UPPER_SNAKE` | `_UPPER_SNAKE` |
| React components | n/a | `PascalCase` |
| Files | `snake_case.py` | `camelCase.ts` / `PascalCase.tsx` |
## Patterns & Idioms
- **Mirror pattern**: algorithms are implemented in Python then ported to TypeScript with explicit `@mirrors` references in comments (e.g. `hexRenderer.ts` mirrors `hex_renderer.py`)
- **Strategy pattern** for tools: `Tool` interface (baseTool.ts) with `onPointerDown`, `onPointerMove`, `onPointerUp`; concrete tools implement it
- **Zustand single store**: all editor state in one flat Zustand store; no React Context, no Redux
- **Patch-based undo**: `UndoStep` records what changed (not full snapshots); undo/redo replay changes in reverse
- **GID 0 as empty sentinel**: tile GID `0` means "no tile" — consistent with Tiled convention
- **Immutable layer updates**: `updateTileLayer()` / `updateObjectLayer()` helpers always return new layer arrays (no mutation of store state)
- **Route order dependency**: FastAPI router must register `/api/maps/upload` before `/api/maps/{name}` — documented in `maps.py` docstring
## File Organization
- Python domain logic lives in `map_editor/` (models + IO) — completely separate from `server/`
- Server does NOT import from `map_editor/` — passes TMJ JSON through without deserialization
- Frontend: one file per concern (one store, one renderer type, one tool per file)
- Tests mirror source structure: `tests/models/` ↔ `map_editor/models/`, `tests/api/` ↔ `server/api/`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```
```
## Backend Architecture
- **Entry point**: `main.py` → invokes `uvicorn server.main:app`
- **App factory**: `server/main.py` — creates FastAPI app, registers CORS middleware, includes routers, mounts React dist as SPA
- **Routers**:
- **Storage**: flat `.tmj` files in `maps/` directory — no database
- **Python domain models** (`map_editor/` package): `TileMap`, `HexMap`, `Layer`, `TileLayer`, `ObjectLayer`, `Tileset`, `MapObject` — used by Python tests and IO layer; NOT used by the FastAPI server at runtime (server works directly with JSON)
- **IO layer** (`map_editor/io/`): `tmj_reader.py`, `tmj_writer.py` — read/write Tiled TMJ format
## Frontend Architecture
- **Entry**: `frontend/src/main.tsx` → renders `<App />`
- **App**: `frontend/src/App.tsx` — top-level layout, routes
- **State**: `frontend/src/store/mapStore.ts` (Zustand) — single store holds all editor state: map data, active layer, active GID, selected tool, zoom/pan, undo/redo stacks
- **Canvas renderers** (`frontend/src/canvas/`):
- **Tools** (`frontend/src/tools/`): `baseTool.ts` (interface), `paintTool.ts`, `eraseTool.ts`, `fillTool.ts` (BFS flood fill), `pointTool.ts` (object placement)
- **Components** (`frontend/src/components/`): `MapCanvas.tsx` (Pointer Events API, pinch-zoom), `TilePalette.tsx`, `LayerPanel.tsx`, `Toolbar.tsx`, `MenuBar.tsx`, `StatusBar.tsx`; dialogs: `NewMapDialog.tsx`, `OpenMapDialog.tsx`, `TilesetDialog.tsx`
- **API client**: `frontend/src/api/client.ts` — thin fetch wrappers for all backend endpoints
- **Types**: `frontend/src/types/tmj.ts` — TypeScript interfaces mirroring the TMJ JSON format
## Data Flow
## State Management
- `mapData: TmjMap | null` — full TMJ JSON in memory
- `activeLayerIndex`, `activeGid`, `selectedTool`, `zoom`, `pan`, `showGrid`
- **Undo/redo**: `past: UndoStep[]`, `future: UndoStep[]`, `pendingTiles: TileChange[]`
## Key Design Decisions
- **No database** — maps stored as `.tmj` files (Tiled-compatible JSON format) in `maps/` directory; simple and portable
- **Python models not used at runtime** — the FastAPI server passes TMJ JSON through without deserializing into Python domain objects; models exist for tests and IO only
- **Upload route must precede `{name}` route** — FastAPI matches routes in order; `/api/maps/upload` must be registered before `/api/maps/{name}` or upload requests are captured by the name route
- **TMJ format** — uses Tiled map editor's JSON format, enabling compatibility with Tiled tooling
- **LAN-accessible** — server binds to `0.0.0.0:8000`, accessible from iPad/tablet on same WiFi
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
