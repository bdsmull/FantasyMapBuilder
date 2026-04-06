# Integrations

**Analysis Date:** 2026-04-06

## External APIs

None. The application makes no calls to third-party APIs. All data is local.

## Services

**No external services are used.** There is no:
- Authentication provider
- Cloud storage
- Database service
- Error tracking / monitoring
- Analytics
- Email / notification service
- Payment processor

The application is designed as a **local LAN tool** — it runs on a developer's machine and is accessed via a browser (desktop or iPad on the same WiFi network).

## Internal Service Boundaries

The app has two internal components communicating over HTTP:

### React Frontend → FastAPI Backend

**Transport:** HTTP/1.1 fetch (browser native)
**Base path:** `/api`
**Client:** `frontend/src/api/client.ts` — typed fetch wrappers, no SDK

**Endpoints consumed by frontend:**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/maps` | List saved map names |
| `GET` | `/api/maps/{name}` | Load a map as TMJ JSON |
| `POST` | `/api/maps/{name}` | Save / overwrite a map |
| `DELETE` | `/api/maps/{name}` | Delete a map |
| `POST` | `/api/maps/upload` | Upload a `.tmj` file (multipart form) |
| `GET` | `/api/maps/{name}/download` | Download raw `.tmj` file |
| `GET` | `/api/tilesets/{path:path}` | Serve a tileset sprite-sheet PNG from local filesystem |

**Dev mode proxy:** Vite dev server (`frontend/vite.config.ts`) proxies all `/api` requests to `http://localhost:8000` so the React dev server and FastAPI can run on separate ports without CORS friction.

**Production mode:** FastAPI serves the built React app from `frontend/dist/` as a `StaticFiles` SPA mount at `/`. Both API and frontend are served from the same origin (`http://0.0.0.0:8000`), so no proxy is needed.

### File Format: TMJ (Tiled Map JSON)

The `.tmj` format is the **Tiled Map Editor** open JSON schema. It is used as the canonical map serialization format. The backend stores and retrieves these files verbatim (no transformation). The frontend types are defined in `frontend/src/types/tmj.ts`. This is a **file format convention**, not a live integration with the Tiled application.

## Environment Configuration

No environment variables are required. The application has no `.env` file and no secrets. All configuration is hardcoded:

- Server host: `0.0.0.0`, port `8000`
- Maps directory: `<project-root>/maps/`
- Frontend dist: `<project-root>/frontend/dist/`
- CORS: `allow_origins=["*"]` (intentional for LAN use)
