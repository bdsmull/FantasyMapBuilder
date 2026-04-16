# Phase 2: Server API — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 02-server-api
**Areas discussed:** Name validation, Test fixture organization

---

## Name Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Same as maps `[\w\-. ]+` | Allow letters, digits, underscores, hyphens, dots, spaces — e.g. 'My World', 'campaign.2025' | ✓ |
| Stricter `[\w\-]+` | Only letters, digits, underscores, hyphens — avoids double-extension filenames and spaces | |

**User's choice:** Same as maps (recommended)
**Notes:** Consistent with map naming conventions; user preferred ergonomics over filename purity.

---

## Test Fixture Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing `tests/api/conftest.py` | Add `patch_world_sets_dir` to shared conftest alongside `patch_maps_dir` | ✓ |
| New `tests/api/world_sets/` subdirectory | Separate conftest and test file in own subdirectory | |

**User's choice:** Extend existing conftest.py (recommended)
**Notes:** Keeps all API test infrastructure in one place, consistent with current structure.

---

## Claude's Discretion

- Response shapes (`{"saved": name}`, `{"deleted": name}`) — follow maps API exactly
- DELETE 404 behavior — confirmed by ROADMAP language "delete-of-nonexistent error cases"
- `_WORLD_SETS_DIR.mkdir(exist_ok=True)` at module level — same as maps
- Router tags, import location in `server/main.py`, TypeScript return types

## Deferred Ideas

None.
