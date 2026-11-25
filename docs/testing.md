# Testing

## Setup

```bash
pip install -r requirements-dev.txt
cd frontend && npm ci
```

---

## Running the tests

**Python** (281 tests: models, TMJ I/O, API, and the `clients/python` world-coordinate library):

```bash
pytest
# With coverage
pytest --cov=map_editor --cov=server --cov-report=term-missing
```

**Frontend** (539 Vitest tests):

```bash
cd frontend
npm test              # once
npm run test:watch    # watch mode
npx tsc --noEmit -p . # type check (also part of npm run build)
```

**Godot addon** (world coordinates, 674 checks; needs Godot 4):

```bash
godot --headless --path clients/godot --import
godot --headless --path clients/godot --script res://tests/run_tests.gd
```

The world-coordinate libraries share a test suite (`clients/conformance`); see
[World Coordinates](world-coordinates.md#conformance).

---

## Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` on every pull request and every push to `main`,
on a clean Ubuntu checkout. Each job is a check on the pull request:

| Check | Runs |
|-------|------|
| **Backend (pytest)** | Python 3.14: `pip install -r requirements-dev.txt`, then `pytest` |
| **Frontend (Vitest, type check, build)** | Node LTS, in `frontend/`: `npm ci`, `npm test`, `npm run build` (`tsc && vite build`) |
| **Godot addon (world coordinates)** | Downloads Godot 4 (headless) and runs `clients/godot/tests/run_tests.gd` |
| **Docs (mkdocs --strict)** | `mkdocs build --strict`: broken links, anchors or nav fail it |

A failing test, type error, build error or broken docs link marks the pull request's check as
failed. To reproduce a failure, run the same command locally (see above). A newer push to the same
branch cancels the run still in progress.

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
| Map store and editing | `mapStore`, `layers`, `fillTool`, `terrainTool`, `tileRenderer` |
| Tiled format | `tmjFile`, `tilesetRefs`, `hexGeometry` |
| World sets | `worldSetStore`, `worldSetUtils`, `hierarchyPanelLogic`, `worldHierarchyPanel`, `worldSetDialog`, `navigation`, `canvasContextMenu`, `placement` |
| Import / export | `mapset`, `importPlan` |
| Elevation | `heightGrid`, `elevation`, `heightBrush`, `worldSurface`, `elevationFit`, `terrainHeights`, `heightGeneration`, `spotHeights`, `contours`, `water`, `streamTrace` |
| Roads and rivers | `lines`, `crossScaleLines`, `lineFit` |
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
