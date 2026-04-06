# Tech Stack

**Analysis Date:** 2026-04-06

## Languages

- **Python 3.14** — backend server, data models, tests
- **TypeScript 5.6** — all frontend source code (`frontend/src/`)
- **CSS** — component styles (`frontend/src/App.css`)

## Backend

**Runtime:**
- Python 3.14 (managed via `.venv` virtualenv at `.venv/`)
- Entry point: `main.py` → launches uvicorn programmatically
- Run command: `python main.py` (prod) / `python main.py --dev` (hot-reload)

**Framework:**
- FastAPI 0.134 (`server/main.py`) — async REST API
- Uvicorn 0.41 with `[standard]` extras — ASGI server, listens on `0.0.0.0:8000`

**Key libraries:**
- `python-multipart >=0.0.9` — multipart form uploads (tileset/map file upload)
- `Pillow 12.1 (>=10.0)` — image processing for tileset sprites
- `fastapi.middleware.cors.CORSMiddleware` — CORS open to `*` (LAN-only server)
- `fastapi.staticfiles.StaticFiles` — serves React SPA from `frontend/dist/` in production

**API routers** (both mounted at `/api`):
- `server/api/maps.py` — map CRUD (list, get, save, delete, upload, download)
- `server/api/tilesets.py` — serve sprite-sheet images from local filesystem

## Frontend

**Framework:**
- React 18.3 with TypeScript (`frontend/src/`)
- JSX transform: `react-jsx` (no explicit React import needed)

**Build tool:**
- Vite 6.0 — dev server on default port (proxies `/api` → `localhost:8000`), bundles to `frontend/dist/`
- Plugin: `@vitejs/plugin-react 4.3`
- Build command: `cd frontend && npm run build` (`tsc && vite build`)

**Key libraries:**
- `zustand 5.0` — global state store (`frontend/src/store/mapStore.ts`)
- No routing library — single-page app with no client-side routes

**TypeScript config** (`frontend/tsconfig.json`):
- Target: `ES2020`, module resolution: `bundler`
- Strict mode: on; `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all enabled

## Data / Storage

- **Local filesystem** — map files stored as `.tmj` (Tiled Map JSON) in `maps/` directory at project root
- No database — pure file-based persistence
- No cache layer — in-memory only during server lifetime
- Tileset images referenced by absolute filesystem path within `.tmj` files; served via `GET /api/tilesets/{path:path}`

## Dev Tooling

**Testing (Python):**
- `pytest >=8.0` — test runner; config in `pytest.ini` (`testpaths = tests`, `--tb=short -q`)
- `pytest-asyncio >=0.23` — async test support for FastAPI endpoints
- `pytest-cov >=5.0` — coverage reporting
- `httpx >=0.27` — async HTTP client for API integration tests

**Testing (Frontend):**
- `vitest 2.1` — test runner configured in `vite.config.ts` (`environment: node`, `globals: true`)
- Run: `cd frontend && npm run test`

**Documentation:**
- `mkdocs >=1.6` with `mkdocs-material >=9.5` theme — project docs at `docs/`, built to `site/`
- Config: `mkdocs.yml` at project root

**Package manager:**
- Python: pip + `.venv` (no lockfile; `requirements.txt` / `requirements-dev.txt`)
- JS: npm (lockfile: `frontend/package-lock.json`)

**No CI/CD pipeline detected** — no `.github/`, `Dockerfile`, or `docker-compose.*` found.
