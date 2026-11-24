"""
Fantasy RPG Map Editor — FastAPI application.

Run in development:
    python main.py

Access from iPad:
    http://<your-pc-lan-ip>:8000
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from server.api import maps as maps_router
from server.api import tilesets as tilesets_router
from server.api import world_sets as world_sets_router
from server.api import mapsets as mapsets_router
from server.api import map_imports as map_imports_router
from server.api import heights as heights_router
from server.api import heightmaps as heightmaps_router

app = FastAPI(
    title="Fantasy RPG Map Editor API",
    version="1.0.0",
    description="REST API for the Fantasy RPG Map Editor web app.",
)

# Allow all origins — safe for a local LAN-only server.
# If you ever expose this to the internet, restrict allow_origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(maps_router.router, prefix="/api")
app.include_router(tilesets_router.router, prefix="/api")
app.include_router(world_sets_router.router, prefix="/api")
app.include_router(map_imports_router.router, prefix="/api")
app.include_router(heights_router.router, prefix="/api")
app.include_router(heightmaps_router.router, prefix="/api")
app.include_router(mapsets_router.router, prefix="/api")

class SpaFiles(StaticFiles):
    """
    The React build. Browsers must check for a new index.html on every load: without
    this they keep using a cached page, and so the old scripts it names, after a
    rebuild. The scripts themselves have hashed names, so they can stay cached.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if path in ("", ".") or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache"
        return response


# Serve the React build as a SPA at / (only when the build exists)
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", SpaFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
