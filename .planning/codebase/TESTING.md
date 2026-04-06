# Testing

## Test Structure

Two independent test suites — Python (pytest) and TypeScript (Vitest) — with no shared infrastructure.

## Backend Tests

- **Count**: 178 Python tests
- **Runner**: pytest (`pytest.ini` at project root)
- **How to run**: `.venv/Scripts/python -m pytest` (must use `.venv`)

### Areas covered

| Module | File | Count |
|---|---|---|
| API endpoints | `tests/api/test_api.py` | ~14 |
| TMJ IO round-trips | `tests/io/test_tmj_io.py` | ~20 |
| HexMap model | `tests/models/test_hex_map.py` | ~31 |
| Layer model | `tests/models/test_layer.py` | ~39 |
| MapObject model | `tests/models/test_map_object.py` | ~19 |
| TileMap model | `tests/models/test_tile_map.py` | ~33 |
| Tileset model | `tests/models/test_tileset.py` | ~22 |

### Key fixtures

- `tests/conftest.py` (root): `small_tile_map`, `small_hex_map`, `reset_object_ids` (autouse — resets `MapObject` ID counter between tests)
- `tests/io/conftest.py`: IO-specific fixtures (temp dirs, sample files)
- `tests/api/conftest.py`:
  - `patch_maps_dir` (autouse) — monkeypatches `server.api.maps._MAPS_DIR` to a `tmp_path` so tests don't touch real `maps/`
  - `client` — `httpx.AsyncClient` pointed at the FastAPI app
  - `sample_tmj` — minimal valid TMJ dict

### Test style

- Class-based grouping (`class TestTileMap:`, `class TestHexMap:`) per concern
- `pytest.mark.asyncio` for all API tests
- `tmp_path` fixture for file I/O tests
- No mocking of storage — `patch_maps_dir` uses a real temp directory

## Frontend Tests

- **Count**: 25 Vitest tests (4 files)
- **Runner**: Vitest (node environment — no DOM/canvas)
- **How to run**: `cd frontend && npm test`

### Areas covered

| File | Count | What's tested |
|---|---|---|
| `__tests__/mapStore.test.ts` | ~14 | Zustand store actions: loadMap, applyTile, commitPendingTiles, applyFill, undo/redo, tileset management |
| `__tests__/fillTool.test.ts` | ~6 | BFS flood fill correctness, boundary conditions, same-GID no-op |
| `__tests__/hexRenderer.test.ts` | ~9 | Hex geometry helpers, viewport culling range calculations |
| `__tests__/tileRenderer.test.ts` | ~10 | Tile renderer logic (non-canvas path) |

### Test style

- `beforeEach` + `useMapStore.setState({...})` to reset store to known state
- Pure function testing for canvas/tool modules (no Canvas API needed)
- No DOM mocking — environment is `node`

## Gaps / Not Tested

- **Frontend components** (MapCanvas, TilePalette, LayerPanel, etc.) — no component tests
- **Canvas rendering output** — visual correctness not verified (canvas API not available in node)
- **Object-add redo** — known incomplete: store has a comment `// We can't fully redo object-add without storing the object — skip for now`
- **Tileset image serving** (`server/api/tilesets.py`) — not covered by API tests
- **Upload validation edge cases** — large files, non-JSON content-type, duplicate names
- **Concurrent saves** — no concurrency tests (file writes are not atomic)
- **Error UI paths** — frontend error states not tested
