"""
Shared fixtures for API tests.
Uses httpx.AsyncClient with the FastAPI app in test mode.
The data folder is redirected to a temporary directory (not the real world_sets/).
"""
import json
import pytest
import pytest_asyncio
from pathlib import Path
from httpx import AsyncClient, ASGITransport

import server.data_dir as data_dir_module

#: World set that map tests save into (created by the patch_maps_dir fixture).
TEST_WORLD_SET = "ws"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch):
    """Redirect the world set data folder to a temp directory for test isolation."""
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(data_dir_module, "DATA_DIR", data)
    return data


@pytest.fixture
def patch_maps_dir(patch_data_dir: Path) -> Path:
    """Create the TEST_WORLD_SET world set and return its maps/ folder."""
    folder = patch_data_dir / TEST_WORLD_SET
    (folder / "maps").mkdir(parents=True)
    (folder / f"{TEST_WORLD_SET}.worldset.json").write_text(
        json.dumps({"name": TEST_WORLD_SET, "version": "1.0", "nodes": []}), encoding="utf-8",
    )
    return folder / "maps"


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

@pytest.fixture
def sample_world_set() -> dict:
    """Minimal valid WorldSet dict."""
    return {
        "name": "test-world",
        "version": "1.0",
        "nodes": [],
    }
