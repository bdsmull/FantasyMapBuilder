---
phase: 02-server-api
plan: 01
subsystem: backend
tags: [python, fastapi, world-sets, api, tests]

# Dependency graph
requires:
  - Phase 01 WorldSet types (worldSet.ts defines the data shape the API serves)
provides:
  - FastAPI CRUD router for world set files (GET/POST/DELETE /api/world_sets(/{name}))
  - world_sets/ directory auto-created on server startup
  - 11 pytest integration tests covering all endpoints plus both 404 paths and invalid name
  - patch_world_sets_dir and sample_world_set test fixtures in conftest.py
affects: [03-store, 04-management-dialog, 05-hierarchy-panel, 06-canvas-integration, 07-context-menu]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - _bare_name() helper pattern to avoid double-extension stem bug with .worldset.json files
    - Mirror pattern: world_sets.py mirrors maps.py one-for-one (same structure, same helpers, same response shapes)

key-files:
  created:
    - server/api/world_sets.py
    - tests/api/test_world_sets.py
  modified:
    - server/main.py
    - tests/api/conftest.py

key-decisions:
  - "Used _bare_name() pattern (path.name.removesuffix(_SUFFIX)) instead of Path.stem to strip .worldset.json — Path.stem only strips last extension so stem of x.worldset.json is x.worldset not x"
  - "World sets router registered after tilesets_router but before SPA mount in server/main.py"
  - "patch_world_sets_dir fixture is autouse=True — same pattern as patch_maps_dir so all tests are isolated without explicit fixture declaration"
  - "test_invalid_name_400 uses bad%21name (! char) instead of bad%2Fname (slash) — URL-encoded slash is consumed by HTTP router before reaching _safe_path, returning 404 not 400"

patterns-established:
  - "_bare_name(path) pattern: path.name.removesuffix(_SUFFIX) — required for any multi-extension suffix"
  - "URL path routing boundary: %2F (slash) is resolved by ASGI router; invalid char tests must use non-separator chars like ! (%21)"

requirements-completed: [API-01, API-02, API-03, API-04, API-05, API-07]

# Metrics
duration: 15min
completed: 2026-04-20
---

# Phase 02 Plan 01: World Sets FastAPI Router and Integration Tests Summary

**FastAPI CRUD router for `.worldset.json` files mirroring the maps API, with 11 passing pytest integration tests and correct double-extension suffix handling via `_bare_name()` pattern**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-20T00:50:00Z
- **Completed:** 2026-04-20T01:05:17Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `server/api/world_sets.py` with `GET /world_sets`, `GET /world_sets/{name}`, `POST /world_sets/{name}`, `DELETE /world_sets/{name}` endpoints under `/api` prefix
- Used `.name.removesuffix(_SUFFIX)` helper to correctly strip `.worldset.json` suffix — `Path.stem` would return `x.worldset` instead of `x` for `x.worldset.json`
- `_WORLD_SETS_DIR` auto-created at module load via `.mkdir(exist_ok=True)`, same pattern as `maps.py`
- Registered `world_sets_router` in `server/main.py` after `tilesets_router` but before SPA mount
- Extended `tests/api/conftest.py` with `patch_world_sets_dir` (autouse=True) and `sample_world_set` fixtures
- Created `tests/api/test_world_sets.py` with 11 integration tests including regression guard for the double-extension stem bug
- Full test suite: 25 passed (14 pre-existing + 11 new), 0 failed, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create world_sets FastAPI router** - `912bdd9` (feat)
2. **Task 2: Register world_sets router in server/main.py** - `a0b0794` (feat)
3. **Task 3: conftest fixtures + integration tests** - `d94d84d` (test)

## Files Created/Modified

- `server/api/world_sets.py` — New file: CRUD router for `.worldset.json` files
- `server/main.py` — Added world_sets_router import and include_router call
- `tests/api/conftest.py` — Added patch_world_sets_dir autouse fixture and sample_world_set fixture
- `tests/api/test_world_sets.py` — New file: 11 integration tests

## Decisions Made

- Used `.name.removesuffix(_SUFFIX)` (with `_SUFFIX = ".worldset.json"`) instead of `Path.stem` to avoid the double-extension stem bug: `Path("x.worldset.json").stem == "x.worldset"` not `"x"`. This is the critical correctness requirement for the list endpoint.
- Registered world sets router in `server/main.py` immediately after the tilesets router, before the SPA mount — follows route-order discipline established by maps.py.
- `patch_world_sets_dir` fixture is `autouse=True` so no test in `test_world_sets.py` accidentally writes to the real `world_sets/` directory on disk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid_name_400 test — URL-encoded slash returns 404 not 400**
- **Found during:** Task 3
- **Issue:** The plan specified `bad%2Fname` (URL-encoded `/`) for the 400 test, but `%2F` is consumed by the ASGI router's path matching before reaching `_safe_path()`, so the route returns 404 (no match) instead of 400 (validation failure)
- **Fix:** Changed test to use `bad%21name` (`!` character encoded as `%21`) which is decoded by the router but still fails `_SAFE_NAME_RE` validation, correctly returning 400
- **Files modified:** `tests/api/test_world_sets.py`
- **Commit:** `d94d84d`

## Known Stubs

None — all endpoints are fully implemented with correct logic. The `world_sets/` directory is auto-created on server startup, and the API correctly handles all 4 CRUD operations.

## Self-Check: PASSED

- `server/api/world_sets.py` exists: FOUND
- `server/main.py` contains `world_sets_router`: FOUND
- `tests/api/test_world_sets.py` exists: FOUND
- `tests/api/conftest.py` contains `patch_world_sets_dir`: FOUND
- Commit `912bdd9` exists: FOUND (feat - router creation)
- Commit `a0b0794` exists: FOUND (feat - router registration)
- Commit `d94d84d` exists: FOUND (test - integration tests)
- 25 tests pass, 0 failed: CONFIRMED

---
*Phase: 02-server-api*
*Completed: 2026-04-20*
