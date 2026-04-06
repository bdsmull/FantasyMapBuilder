# Code Conventions

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
