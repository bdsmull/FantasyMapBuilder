# Phase 2: Server API — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers a working REST CRUD API for world set files, plus matching frontend client functions and Python tests. Specifically:

1. `server/api/world_sets.py` — new FastAPI router with 4 endpoints
2. `server/main.py` — register the world_sets router under `/api` prefix
3. `frontend/src/api/client.ts` — add 4 world set client functions
4. `tests/api/test_world_sets.py` — Python API tests covering all endpoints and error cases
5. `world_sets/` directory auto-created on server startup (same pattern as `maps/`)

No Zustand store, no UI components, no frontend tests in scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Name Validation
- **D-01:** World set names use the same validation regex as maps: `[\w\-. ]+` (letters, digits, underscores, hyphens, dots, spaces)
- Same `_safe_path()` helper pattern as `maps.py` — strip `.worldset.json` suffix if present, validate stem, return `_WORLD_SETS_DIR / f"{stem}.worldset.json"`

### DELETE Behavior
- **D-02:** `DELETE /api/world_sets/{name}` returns 404 if the world set does not exist — same behavior as `DELETE /api/maps/{name}`. The ROADMAP specifies "delete-of-nonexistent error cases" in tests, confirming 404 is required.

### Server Validation
- **D-03:** Server is pure CRUD — no schema validation of request body on POST. Server accepts any valid JSON body and writes it to disk. This mirrors the maps API and is explicitly Out of Scope per REQUIREMENTS.md.

### Test Fixture Organization
- **D-04:** World set test fixtures go in the existing `tests/api/conftest.py` — add `patch_world_sets_dir` fixture (autouse=True) alongside the existing `patch_maps_dir`. No new subdirectory.
- `patch_world_sets_dir` patches `server.api.world_sets._WORLD_SETS_DIR` to a `tmp_path / "world_sets"` temp dir.
- Add a `sample_world_set` fixture returning a minimal valid WorldSet dict (name, version "1.0", empty nodes list).

### Response Shapes
- **D-05:** Response bodies mirror the maps API: `POST` returns `{"saved": name}`, `DELETE` returns `{"deleted": name}` — exact same shape.

### Claude's Discretion
- Where in `server/main.py` to insert the router import and `include_router` call (after the maps router is fine)
- Whether to use `@router.get`, `@router.post`, `@router.delete` decorators (follow maps.py exactly)
- `_WORLD_SETS_DIR.mkdir(exist_ok=True)` at module level — same as maps
- `tags=["world_sets"]` on the router

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/world-sets-design.md` — Full design spec; §Server API section defines the 4 endpoints and file format

### Existing API Pattern (template to mirror)
- `server/api/maps.py` — Template: `_MAPS_DIR`, `_SAFE_NAME_RE`, `_safe_path()`, endpoint structure, response shapes, error handling
- `server/main.py` — Where to register the new router (add after maps_router)

### Existing Test Pattern (template to mirror)
- `tests/api/conftest.py` — Test fixtures: `patch_maps_dir` (autouse monkeypatch pattern), `client` fixture (ASGITransport + AsyncClient), `sample_tmj`
- `tests/api/test_api.py` — Test style: `pytestmark = pytest.mark.asyncio`, test function naming, assertion patterns

### Existing Client Pattern (template to mirror)
- `frontend/src/api/client.ts` — `handleResponse<T>()` helper, `BASE = '/api'`, `encodeURIComponent(name)` in URLs, existing function signatures for `getMap`, `saveMap`, `deleteMap`

### Types (for TypeScript client return types)
- `frontend/src/types/worldSet.ts` — `WorldSet`, `WorldSetNode` interfaces defined in Phase 1

### Requirements
- `.planning/REQUIREMENTS.md` — API-01 through API-07 (Server API section)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_safe_path()` helper pattern from `maps.py` — copy and adapt for world sets (change suffix to `.worldset.json`, change dir var)
- `_SAFE_NAME_RE = re.compile(r"^[\w\-. ]+$")` — same regex, same constant, same validation logic
- `handleResponse<T>()` from `client.ts` — reuse directly; new functions follow the same typed wrapper pattern
- `ASGITransport` + `AsyncClient` fixture from `conftest.py` — reuse `client` fixture as-is (it uses the full app)

### Established Patterns
- **FastAPI router**: `router = APIRouter(tags=["..."])` at module level; endpoints as `@router.get/post/delete`
- **Directory initialization**: `_DIR.mkdir(exist_ok=True)` at module load — auto-creates on first import
- **Server passes JSON through**: `json.load(f)` → `JSONResponse(content=data)` for GET; `request_body: dict` → `json.dumps(...)` for POST
- **Test isolation via monkeypatch**: `monkeypatch.setattr(module, "_MAPS_DIR", tmp_path / "maps")` — world sets need same pattern for `_WORLD_SETS_DIR`
- **TypeScript client types**: `getMap()` returns `TmjMap`; `getWorldSet()` should return `WorldSet` — import type from `../types/worldSet`

### Integration Points
- `server/main.py` lines 19-20: imports `maps_router` and `tilesets_router` — add `world_sets_router` import after these
- `server/main.py` lines 38-39: `include_router` calls — add `app.include_router(world_sets_router.router, prefix="/api")` after maps router
- `frontend/src/api/client.ts` end of file (after tilesets section) — add world sets section with 4 functions
- `tests/api/conftest.py` — add `patch_world_sets_dir` and `sample_world_set` fixtures after existing fixtures

</code_context>

<specifics>
## Specific Ideas

- The `sample_world_set` fixture for tests should be a minimal valid Python dict: `{"name": "test-world", "version": "1.0", "nodes": []}` — empty nodes is sufficient to test CRUD
- `saveWorldSet(name: string, data: WorldSet): Promise<void>` — mirrors `saveMap(name: string, data: TmjMap): Promise<void>` exactly
- `getWorldSet(name: string): Promise<WorldSet>` — mirrors `getMap(name: string): Promise<TmjMap>` exactly
- The world sets router MUST be registered before any catch-all routes in `server/main.py` (follow the same registration order discipline as maps)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-server-api*
*Context gathered: 2026-04-16*
