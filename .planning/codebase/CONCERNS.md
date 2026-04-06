# Codebase Concerns

## High Priority

- **Object-add redo is broken** (`mapStore.ts:349`): The `redo` handler for `object-add` steps is explicitly skipped with the comment `// We can't fully redo object-add without storing the object — skip for now`. Undo removes the object, but redo silently does nothing. The object reference needs to be stored in the undo step.

- **Tileset path is an absolute filesystem path**: `server/api/tilesets.py` serves images by absolute path passed from the frontend. This works on the machine where the map was created, but maps are not portable — moving maps to another machine or sharing `.tmj` files will break tileset image loading. The TMJ `image` field stores the absolute path as-is.

- **No atomic file writes**: `server/api/maps.py` writes map files with `path.write_text()` directly. A crash mid-write corrupts the file. Should write to a temp file then rename (atomic on POSIX; near-atomic on Windows).

## Technical Debt

- **Python domain models (`map_editor/`) are unused at runtime**: The FastAPI server passes TMJ JSON through without ever deserializing into `TileMap`/`HexMap` etc. The Python models exist only for tests and the IO layer. This creates a maintenance burden — two parallel representations of the same data (Python dataclasses + TypeScript TMJ types) that can drift.

- **`saves/` directory purpose unclear**: There are `.tmj` files in both `maps/` (the runtime storage dir) and `saves/`. The `saves/` directory is not referenced by any code and appears to be leftover/manual copies.

- **Frontend `dist/` committed to git**: `frontend/dist/` (production build output) appears to be committed. Build artifacts in git create merge conflicts and inflate repo size.

- **No linting configuration**: No `pyproject.toml [tool.ruff/black]`, no `.eslintrc`. Code consistency relies on developer discipline. TypeScript strict mode catches type errors but not style issues.

## Performance Risks

- **Full map JSON on every save**: `saveMapToServer()` POSTs the entire TMJ JSON body on every save. For large maps with many layers, this could be slow. No delta/patch protocol.

- **`applyTile()` scans `pendingTiles` linearly**: During drag strokes, `applyTile()` calls `pendingTiles.some(c => c.layerIndex === ... && c.col === ... && c.row === ...)` which is O(n) per tile. For long strokes over large areas this becomes quadratic. (The fill path uses `applyFill()` which avoids this.)

- **Store re-renders on every `applyTile` call**: Each `applyTile()` call during a drag triggers a Zustand state update, causing a React re-render + canvas redraw. For fast mouse movement this can be many renders per frame. Should batch within a requestAnimationFrame.

- **Undo stack unbounded**: `past` array grows without limit. Painting a large map extensively could accumulate thousands of undo steps consuming significant memory.

## Security Considerations

- **Tileset endpoint serves any absolute path**: `GET /api/tilesets/{path:path}` will serve any image file anywhere on the filesystem as long as it has an allowed extension and is an absolute path. Intended for LAN-only use — if accidentally exposed to internet, any image file on the machine could be read.

- **CORS allows all origins**: `allow_origins=["*"]` is fine for LAN-only use but is flagged in a comment in `server/main.py`. If the server is ever exposed externally, this needs restricting.

- **Map name sanitization allows spaces and dots**: `_SAFE_NAME_RE = r"^[\w\-. ]+$"` permits spaces and multiple dots in map names. While path traversal is blocked, filenames like `..tmj` or names with leading spaces could cause subtle issues on some filesystems.

## Missing Error Handling

- **Frontend has no global error boundary**: Uncaught errors in React components will crash the whole app with a blank screen. No `<ErrorBoundary>` component wraps the app.

- **`saveMapToServer()` errors not surfaced to user**: The async save can throw (network error, 500), but there's no visible error feedback mechanism in the UI beyond the unhandled promise rejection.

- **Tileset load failures are silent**: When a tileset image fails to load in the canvas renderers, the tile is just skipped. No user-visible error or retry mechanism.

- **`list_maps()` doesn't handle filesystem errors**: If `maps/` directory is not readable, the endpoint throws an unhandled Python exception rather than a clean 500.

## Known Fragilities

- **Route registration order is load-bearing**: `POST /api/maps/upload` MUST be registered before `POST /api/maps/{name}` in `server/api/maps.py`. This is documented in the module docstring but is easy to break if routes are reordered. FastAPI has no built-in guard against this.

- **`removeTileset()` mutates tilesets in place**: `mapStore.ts:removeTileset()` calls `ts.firstgid = nextGid` directly on tileset objects from the store state array, then sets state. This bypasses Zustand's immutability convention used elsewhere in the store.

- **`reset_object_ids` autouse fixture**: Python tests use an autouse fixture to reset `MapObject`'s class-level ID counter. If any test creates objects outside this fixture's scope (e.g., in a conftest), IDs bleed between tests.

## Low Priority / Nice to Have

- **No pagination on `GET /api/maps`**: Returns all map names in one response. Fine for personal use but would need pagination for large collections.

- **No map metadata**: Maps have no creation date, last-modified timestamp, or author stored in the TMJ file or alongside it.

- **`docs/world-sets-design.md` is untracked**: This design doc is in the working tree but not committed to git (shown in `git status`).

- **`site/` (MkDocs output) is committed**: Generated HTML docs are committed alongside source. Makes PRs noisy.

- **Frontend has no loading states**: Dialogs that fetch from the API (OpenMapDialog) have no loading spinner or disabled state while the fetch is in-flight.
