# Contributing

## Development setup

```bash
git clone https://github.com/bdsmull/FantasyMapBuilder.git
cd FantasyMapBuilder
python -m venv .venv
```

| Platform | Activate |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

```bash
pip install -r requirements-dev.txt
cd frontend && npm ci && cd ..
```

Check everything works:

```bash
pytest
cd frontend && npm test && npx tsc --noEmit -p . && cd ..
python main.py --dev          # and, in a second terminal: cd frontend && npm run dev
```

---

## Workflow

- Work on a branch, one change per pull request.
- Every pull request includes tests for what it changes, and **updates the documentation**:
  - `CHANGELOG.md`: an entry under `[Unreleased]`
  - `README.md`: if features, setup or usage change
  - `docs/`: the user guide, file formats and architecture pages it affects
- Run both test suites and the type check before opening the pull request.
- **CI** ([GitHub Actions](https://github.com/bdsmull/FantasyMapBuilder/actions), `.github/workflows/ci.yml`)
  runs on every pull request and every push to `main`: `pytest`, the Vitest suite, the type check
  and build (`npm run build`), the Godot addon's tests and `mkdocs build --strict`. All four checks
  (**Backend**, **Frontend**, **Godot addon**, **Docs**) should pass before merging; see [Testing](testing.md#continuous-integration).

---

## Code conventions

### Python

- Python 3.11+; `from __future__ import annotations` in every module
- Type hints on public functions; `pathlib.Path`, not `os.path`
- Models are `@dataclass`es
- `map_editor/` (the model library) never imports from `server/`, and the server doesn't use the
  model library at runtime: it passes Tiled JSON through

### TypeScript / React

- Strict mode with `noUnusedLocals` and `noUnusedParameters`
- `interface` for data shapes, `type` for unions; `import type` for type-only imports
- Module-level constants are `_UPPER_SNAKE`
- **Stores don't import each other**; cross-store steps go in `utils/navigation.ts` or a hook
- Renderers, tools and `utils/` stay pure functions where possible, so they're easy to test
- Layer updates are immutable (new arrays); undo steps record changes, not snapshots
- **Tiled compatibility:** new data goes in Tiled fields or custom properties, never in fields
  Tiled would drop

---

## Documentation

The documentation is built with [MkDocs](https://www.mkdocs.org/) and the
[Material theme](https://squidfunk.github.io/mkdocs-material/).

```bash
mkdocs serve -a 127.0.0.1:8001    # port 8000 is the editor's server
mkdocs build --strict             # check links before committing
```

On Windows, set `PYTHONUTF8=1` first.

---

## Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions:

- Add entries under `## [Unreleased]` with the pull request number, in `### Added`, `### Changed`,
  `### Fixed` or `### Removed`.
- When cutting a release, rename `[Unreleased]` to the version and date, then add a fresh empty
  `[Unreleased]` block above it.
