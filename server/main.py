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

from server.api import maps as maps_router
from server.api import tilesets as tilesets_router

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

# Serve the React build as a SPA at / (only when the build exists)
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
