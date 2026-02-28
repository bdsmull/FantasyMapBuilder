# Testing

## Setup

Install the development dependencies:

```bash
pip install -r requirements-dev.txt
```

Install frontend dependencies (requires Node.js 20+):

```bash
cd frontend && npm install
```

---

## Running the Python test suite

```bash
# All Python tests
pytest tests/models tests/io tests/api -v

# With coverage
pytest tests/models tests/io tests/api --cov=map_editor --cov=server --cov-report=term-missing

# HTML coverage report
pytest tests/models tests/io tests/api --cov=map_editor --cov=server --cov-report=html
# Open htmlcov/index.html
```

## Running the frontend (Vitest) tests

```bash
cd frontend
npm test          # run once
npm run test:watch  # watch mode
```

---

## Test layout

### Python tests

| Path | Contents |
|------|---------|
| `tests/conftest.py` | `autouse` fixture resetting `MapObject._id_counter` to 0 before every test |
| `tests/models/test_tileset.py` | 22 tests — tile definitions, placeholder PNG generation, sheet positions |
| `tests/models/test_map_object.py` | 19 tests — factory methods, ID counter isolation, properties |
| `tests/models/test_layer.py` | 39 tests — tile access, flood fill, object hit-testing |
| `tests/models/test_tile_map.py` | 33 tests — GID resolution, layer management, coordinate helpers |
| `tests/models/test_hex_map.py` | 31 tests — pixel↔hex round-trips, neighbour lookup, distance |
| `tests/io/test_tmj_io.py` | 20 tests — TMJ round-trips, object shapes, multi-tileset GIDs, POINTY_TOP hex |
| `tests/api/conftest.py` | `client` fixture (httpx `AsyncClient`), isolated temp `maps/` dir |
| `tests/api/test_api.py` | 14 tests — all CRUD endpoints, upload, download, error cases |

**Total Python tests: 178**

### Frontend tests (Vitest)

| Path | Contents |
|------|---------|
| `frontend/src/__tests__/fillTool.test.ts` | 6 tests — `bfsFloodFill`: 1×1, same-GID no-op, row fill, boundary stop, 2-D, no diagonal |
| `frontend/src/__tests__/tileRenderer.test.ts` | 10 tests — `screenToTile` and `tileToScreen` with zoom/pan; inverse relationship |
| `frontend/src/__tests__/mapStore.test.ts` | 11 tests — `loadMap`, `applyTile`, `commitPendingTiles`, undo (single/batch/no-op), redo, dirty flag |

**Total frontend tests: 27**

---

## Writing new tests

### Python model tests

Place in `tests/models/test_<module>.py`. No server fixtures needed. The `autouse`
ID-reset fixture applies automatically.

### API tests

Place in `tests/api/test_<feature>.py`. Use the `client` fixture provided by
`tests/api/conftest.py` — it supplies an `httpx.AsyncClient` wired to an in-process
FastAPI app with an isolated temporary `maps/` directory.

```python
import pytest

@pytest.mark.asyncio
async def test_my_endpoint(client):
    response = await client.get("/api/maps")
    assert response.status_code == 200
```

### Frontend tests

Place in `frontend/src/__tests__/`. Import pure functions directly (no DOM setup needed
for logic tests). Use `useMapStore.setState(...)` to reset Zustand state in `beforeEach`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../store/mapStore';

beforeEach(() => {
  useMapStore.setState({ mapData: null, past: [], future: [] });
});

describe('my feature', () => {
  it('does something', () => {
    // ...
  });
});
```

---

## Bug regressions

Every fixed bug should have a corresponding test that would have caught it before the fix.
