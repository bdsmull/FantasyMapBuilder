# Testing

## Setup

```bash
pip install -r requirements-dev.txt
cd frontend && npm ci
```

---

## Running the tests

**Python** (253 tests: models, TMJ I/O, API):

```bash
pytest
# With coverage
pytest --cov=map_editor --cov=server --cov-report=term-missing
```

**Frontend** (340 Vitest tests):

```bash
cd frontend
npm test              # once
npm run test:watch    # watch mode
npx tsc --noEmit -p . # type check (also part of npm run build)
```

---

## What's covered

### Python (`tests/`)

| Path | Covers |
|------|--------|
| `tests/models/` | The Python model library: tilesets, layers, objects, tile and hex maps |
| `tests/io/` | TMJ reading and writing round trips |
| `tests/api/test_api.py` | Map CRUD, upload, download, Tiled-style formatting |
| `tests/api/test_world_sets.py` | World set CRUD, data folder |
| `tests/api/test_tilesets.py` | External `.tsj` tilesets, swatches, image upload and serving |
| `tests/api/test_heights.py` | Height TIFF and mask storage, binary API |
| `tests/api/test_mapsets.py` | `.mapset` export and import |
| `tests/api/test_map_import.py` | Single-map import: tileset merge, keep both, GID remapping |

`tests/api/conftest.py` points the data folder at a temporary directory with a world set named
`ws`, and provides an `httpx.AsyncClient` fixture.

### Frontend (`frontend/src/__tests__/`)

| Area | Test files |
|------|------------|
| Map store and editing | `mapStore`, `layers`, `fillTool`, `tileRenderer` |
| Tiled format | `tmjFile`, `tilesetRefs`, `hexGeometry` |
| World sets | `worldSetStore`, `worldSetUtils`, `hierarchyPanelLogic`, `worldHierarchyPanel`, `worldSetDialog`, `navigation`, `canvasContextMenu`, `placement` |
| Import / export | `mapset`, `importPlan` |
| Elevation | `heightGrid`, `elevation`, `heightBrush`, `worldSurface`, `elevationFit`, `terrainHeights`, `heightGeneration`, `spotHeights` |
| Roads and rivers | `lines`, `crossScaleLines` |
| Inspect | `inspect` |

---

## Writing tests

- **Python models** → `tests/models/test_<module>.py`
- **API endpoints** → `tests/api/test_<feature>.py`, using the `client` fixture:

```python
import pytest

@pytest.mark.asyncio
async def test_list_world_sets(client):
    response = await client.get("/api/world_sets")
    assert response.status_code == 200
```

- **Frontend logic** → `frontend/src/__tests__/<feature>.test.ts`. Most logic is pure functions
  you can import directly; stores can be driven through `useMapStore.getState()`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../store/mapStore';

beforeEach(() => {
  useMapStore.getState().loadMap(myMap, 'm', 'ws');
});

describe('my feature', () => {
  it('does something', () => {
    // ...
  });
});
```

Every fixed bug should get a test that would have caught it.

---

## Checking in a browser

For changes you can see, also try them in the running editor. Use a throwaway copy of a world set
(Edit → World Sets… → Export, then Import .mapset… under a new name) rather than real maps, and
delete it afterwards.
