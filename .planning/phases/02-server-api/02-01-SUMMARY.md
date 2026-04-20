---
phase: 02-server-api
plan: 01
subsystem: api
tags: [fastapi, python, pytest, rest, world-sets]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: WorldSet TypeScript types in worldSet.ts (JSON shape the API stores/returns)
provides:
  - FastAPI router at server/api/world_sets.py with GET/POST/DELETE /world_sets endpoints
  - world_sets router registered in server/main.py under /api prefix
  - pytest-asyncio test suite with 11 tests covering all endpoints and error paths
  - patch_world_sets_dir and sample_world_set fixtures in tests/api/conftest.py
affects: [02-02, frontend-world-sets, 03-frontend-worldset]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_bare_name() helper to strip .worldset.json double extension (Path.stem only strips last)"
    - "autouse fixture pattern for test isolation — patch_world_sets_dir redirects I/O to tmp dir"
    - "Router mirrors maps.py one-for-one: same _SAFE_NAME_RE, _safe_path, response shapes"

key-files:
  created:
    - server/api/world_sets.py
    - tests/api/test_world_sets.py
  modified:
    - server/main.py
    - tests/api/conftest.py

key-decisions:
  - "_bare_name() helper instead of Path.stem to strip .worldset.json — Path.stem only strips last extension leaving .worldset"
  - "patch_world_sets_dir is autouse=True — prevents accidental writes to real world_sets/ dir during tests"
  - "test_invalid_name_400 uses bad%21name (! char) not bad%2Fname (slash) — URL-encoded slash consumed by ASGI router before _safe_path validation"
  - "Server is pure CRUD with no body schema validation on POST (D-03)"
  - "POST returns {saved: name}, DELETE returns {deleted: name} — mirrors maps.py response shapes (D-05)"

patterns-established:
  - "Double-extension stripping: use path.name.removesuffix('.worldset.json') not Path.stem"
  - "World set test isolation: monkeypatch _WORLD_SETS_DIR to tmp_path / 'world_sets' in autouse fixture"

requirements-completed: [API-01, API-02, API-03, API-04, API-05, API-07]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 02 Plan 01: World Sets Server API Summary

**FastAPI CRUD router for .worldset.json files with 11 pytest-asyncio tests covering all endpoints, error paths, and the _bare_name double-extension regression guard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T13:09:35Z
- **Completed:** 2026-04-20T13:11:41Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created `server/api/world_sets.py` mirroring maps.py with GET list, GET by name, POST save, DELETE endpoints
- Registered world_sets router in `server/main.py` under /api prefix before SPA mount
- Added `patch_world_sets_dir` (autouse) and `sample_world_set` fixtures to `tests/api/conftest.py`
- Created `tests/api/test_world_sets.py` with 11 passing tests; full suite 25/25 pass with 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create world_sets FastAPI router** - `6f8d676` (feat)
2. **Task 2: Register world_sets_router in server/main.py** - `08c995d` (feat)
3. **Task 3: Add conftest fixtures and write test_world_sets.py** - `34c6ed6` (test)

## Files Created/Modified
- `server/api/world_sets.py` - FastAPI router with 4 CRUD endpoints for .worldset.json files
- `server/main.py` - Added world_sets_router import and include_router call before SPA mount
- `tests/api/conftest.py` - Added patch_world_sets_dir (autouse) and sample_world_set fixtures
- `tests/api/test_world_sets.py` - 11 pytest-asyncio tests covering list, get, save, delete, invalid names

## Decisions Made
- `_bare_name()` helper uses `path.name.removesuffix(".worldset.json")` instead of `Path.stem` — Path.stem on `my-world.worldset.json` returns `my-world.worldset` (strips only `.json`), not `my-world`. This would cause the list endpoint to return wrong names.
- `patch_world_sets_dir` is `autouse=True` so every test in the suite runs against a fresh tmp directory without risking writes to the real `world_sets/` directory at repo root.
- Invalid name test uses `bad%21name` (`!` URL-encoded) not `bad%2Fname` (`/` URL-encoded) — the ASGI router intercepts `%2F` before `_safe_path` is reached and returns 404 instead of 400.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend world set API is complete and fully tested
- Plan 02-02 (frontend API client) can proceed — `GET /api/world_sets`, `GET /api/world_sets/{name}`, `POST /api/world_sets/{name}`, `DELETE /api/world_sets/{name}` are all live
- No blockers

---
*Phase: 02-server-api*
*Completed: 2026-04-20*
