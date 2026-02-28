"""
FastAPI endpoint tests for the Map Editor API.
All file I/O is redirected to a temporary directory via the `patch_maps_dir` fixture.
"""
import json
import pytest
import pytest_asyncio


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Map listing
# ---------------------------------------------------------------------------

async def test_list_maps_empty(client):
    """Empty maps directory returns an empty list."""
    resp = await client.get("/api/maps")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_save_and_list(client, sample_tmj):
    """Saving a map makes it appear in the list."""
    await client.post("/api/maps/mymap", json=sample_tmj)
    resp = await client.get("/api/maps")
    assert "mymap" in resp.json()


# ---------------------------------------------------------------------------
# Get map
# ---------------------------------------------------------------------------

async def test_save_and_get_roundtrip(client, sample_tmj):
    """Saved map can be retrieved and has the same structure."""
    await client.post("/api/maps/round_trip", json=sample_tmj)
    resp = await client.get("/api/maps/round_trip")
    assert resp.status_code == 200
    data = resp.json()
    assert data["width"] == sample_tmj["width"]
    assert data["height"] == sample_tmj["height"]
    assert data["orientation"] == sample_tmj["orientation"]


async def test_get_nonexistent_404(client):
    """GET for an unknown map name returns 404."""
    resp = await client.get("/api/maps/does_not_exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Save (create / overwrite)
# ---------------------------------------------------------------------------

async def test_save_creates_file(client, sample_tmj, patch_maps_dir):
    """POST /api/maps/{name} creates a .tmj file on disk."""
    resp = await client.post("/api/maps/newfile", json=sample_tmj)
    assert resp.status_code == 200
    assert (patch_maps_dir / "newfile.tmj").exists()


async def test_save_overwrites(client, sample_tmj):
    """Second POST to the same name overwrites the first."""
    await client.post("/api/maps/over", json=sample_tmj)
    modified = {**sample_tmj, "width": 10}
    await client.post("/api/maps/over", json=modified)
    resp = await client.get("/api/maps/over")
    assert resp.json()["width"] == 10


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def test_delete_map(client, sample_tmj, patch_maps_dir):
    """DELETE removes the file from disk."""
    await client.post("/api/maps/todelete", json=sample_tmj)
    resp = await client.delete("/api/maps/todelete")
    assert resp.status_code == 200
    assert not (patch_maps_dir / "todelete.tmj").exists()


async def test_delete_nonexistent_404(client):
    """DELETE for an unknown map name returns 404."""
    resp = await client.delete("/api/maps/ghost")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

async def test_upload_tmj(client, sample_tmj, patch_maps_dir):
    """Multipart upload creates the .tmj file."""
    content = json.dumps(sample_tmj).encode()
    resp = await client.post(
        "/api/maps/upload",
        files={"file": ("uploaded.tmj", content, "application/json")},
    )
    assert resp.status_code == 201
    assert (patch_maps_dir / "uploaded.tmj").exists()


async def test_upload_invalid_json_422(client):
    """Uploading non-JSON content returns 422."""
    resp = await client.post(
        "/api/maps/upload",
        files={"file": ("bad.tmj", b"not json at all", "application/json")},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

async def test_download_tmj(client, sample_tmj):
    """GET /download returns the raw .tmj with correct content-type."""
    await client.post("/api/maps/dl", json=sample_tmj)
    resp = await client.get("/api/maps/dl/download")
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]


async def test_download_nonexistent_404(client):
    """Downloading a missing map returns 404."""
    resp = await client.get("/api/maps/missing/download")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tileset image
# ---------------------------------------------------------------------------

async def test_tileset_image_not_found(client):
    """Requesting a tileset image that doesn't exist returns 404."""
    resp = await client.get("/api/tilesets/C:/does_not_exist_path/fake.png")
    assert resp.status_code == 404


async def test_tileset_image_relative_path_400(client):
    """Relative tileset paths are rejected with 400."""
    resp = await client.get("/api/tilesets/relative/path/tile.png")
    assert resp.status_code == 400
