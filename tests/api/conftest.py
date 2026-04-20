"""
Shared fixtures for API tests.
Uses httpx.AsyncClient with the FastAPI app in test mode.
Maps are stored in a temporary directory (not the real maps/ dir).
"""
import json
import pytest
import pytest_asyncio
from pathlib import Path
from httpx import AsyncClient, ASGITransport

# Patch the maps directory before importing the app
import server.api.maps as maps_module


@pytest.fixture(autouse=True)
def patch_maps_dir(tmp_path: Path, monkeypatch):
    """Redirect all map file I/O to a temp directory for test isolation."""
    maps_dir = tmp_path / "maps"
    maps_dir.mkdir()
    monkeypatch.setattr(maps_module, "_MAPS_DIR", maps_dir)
    return maps_dir


@pytest_asyncio.fixture
async def client():
    from server.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_tmj() -> dict:
    """Minimal valid TMJ map dict."""
    return {
        "orientation": "orthogonal",
        "width": 5,
        "height": 4,
        "tilewidth": 32,
        "tileheight": 32,
        "nextlayerid": 2,
        "nextobjectid": 1,
        "tilesets": [],
        "layers": [
            {
                "type": "tilelayer",
                "name": "Ground",
                "width": 5,
                "height": 4,
                "visible": True,
                "opacity": 1.0,
                "offsetx": 0,
                "offsety": 0,
                "data": [0] * 20,
            }
        ],
    }


# ---------------------------------------------------------------------------
# World set fixtures
# ---------------------------------------------------------------------------

import server.api.world_sets as world_sets_module


@pytest.fixture(autouse=True)
def patch_world_sets_dir(tmp_path: Path, monkeypatch):
    """Redirect all world set file I/O to a temp directory for test isolation."""
    world_sets_dir = tmp_path / "world_sets"
    world_sets_dir.mkdir()
    monkeypatch.setattr(world_sets_module, "_WORLD_SETS_DIR", world_sets_dir)
    return world_sets_dir


@pytest.fixture
def sample_world_set() -> dict:
    """Minimal valid WorldSet dict."""
    return {
        "name": "test-world",
        "version": "1.0",
        "nodes": [],
    }
