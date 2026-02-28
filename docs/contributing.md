# Contributing

## Development setup

```bash
git clone <repo-url>
cd MapEditor_ClaudeCode
python -m venv .venv
```

Activate:

| Platform | Command |
|----------|---------|
| Windows | `.venv\Scripts\activate` |
| macOS / Linux | `source .venv/bin/activate` |

```bash
pip install -r requirements-dev.txt
```

Install frontend dependencies:

```bash
cd frontend && npm install && cd ..
```

Verify everything is working:

```bash
pytest
cd frontend && npm test && cd ..
python main.py --dev
```

---

## Code conventions

### Python

- **Version**: 3.11+
- **Style**: PEP 8; no formatter is enforced yet
- **Type hints**: used throughout — new code should follow suit
- **Imports**: standard library → third-party → local, each group separated by a blank line
- **Dataclasses**: models use `@dataclass`; avoid hand-written `__init__` boilerplate
- **Dependency boundary**: `map_editor/models/` must stay free of any server or UI import
  so it can be tested in isolation

### TypeScript / React

- **Strict mode**: `tsconfig.json` has `"strict": true` — no implicit `any`
- **State**: all map state lives in the Zustand store (`src/store/mapStore.ts`); components
  read from the store and dispatch actions
- **Pure functions**: canvas renderers and tools are pure functions with no side effects —
  keep them that way so they remain easy to test
- **Components**: prefer small, focused components; pass props rather than reaching into
  the store from deep inside a component tree

---

## Tests

All contributions should include tests. The bar is:

- New Python model code → unit tests in `tests/models/`
- New API endpoints → tests in `tests/api/` using the `client` fixture
- New frontend logic (pure functions) → Vitest tests in `frontend/src/__tests__/`
- Bug fixes → a regression test that would have caught the bug before the fix

Run the full suite before opening a pull request:

```bash
pytest --tb=short
cd frontend && npm test
```

See [Testing](testing.md) for more details.

---

## Documentation

The documentation is built with [MkDocs](https://www.mkdocs.org/) and the
[Material theme](https://squidfunk.github.io/mkdocs-material/).

Preview locally:

=== "macOS / Linux"

    ```bash
    mkdocs serve
    # Open http://127.0.0.1:8000
    ```

=== "Windows"

    ```bash
    PYTHONUTF8=1 mkdocs serve
    # Open http://127.0.0.1:8000
    ```

Deploy to GitHub Pages:

=== "macOS / Linux"

    ```bash
    mkdocs gh-deploy
    ```

=== "Windows"

    ```bash
    PYTHONUTF8=1 mkdocs gh-deploy
    ```

When adding a feature, update the relevant page in `docs/` and add a `[Unreleased]` entry
to `CHANGELOG.md`.

---

## Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions:

- Add new entries under `## [Unreleased]` as you work.
- When cutting a release, rename `[Unreleased]` to the version number and date, then add a
  fresh empty `[Unreleased]` block above it.
- Use `### Added`, `### Changed`, `### Fixed`, `### Removed` subsections as appropriate.
