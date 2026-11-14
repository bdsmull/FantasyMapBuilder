"""
FastAPI endpoint tests for the Map Editor API.
All file I/O is redirected to a temporary data folder; maps are saved into the
`ws` world set created by the `patch_maps_dir` fixture.
"""
import json
import pytest
import pytest_asyncio


pytestmark = pytest.mark.asyncio

MAPS = "/api/world_sets/ws/maps"


@pytest.fixture(autouse=True)
def _world_set(patch_maps_dir):
    """Every map test runs against an existing world set."""
    return patch_maps_dir


# ---------------------------------------------------------------------------
# Map listing
# ---------------------------------------------------------------------------

async def test_list_maps_empty(client):
    """Empty maps directory returns an empty list."""
    resp = await client.get(MAPS)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_save_and_list(client, sample_tmj):
    """Saving a map makes it appear in the list."""
    await client.post(f"{MAPS}/mymap", json=sample_tmj)
    resp = await client.get(MAPS)
    assert "mymap" in resp.json()


# ---------------------------------------------------------------------------
# Get map
# ---------------------------------------------------------------------------

async def test_save_and_get_roundtrip(client, sample_tmj):
    """Saved map can be retrieved and has the same structure."""
    await client.post(f"{MAPS}/round_trip", json=sample_tmj)
    resp = await client.get(f"{MAPS}/round_trip")
    assert resp.status_code == 200
    data = resp.json()
    assert data["width"] == sample_tmj["width"]
    assert data["height"] == sample_tmj["height"]
    assert data["orientation"] == sample_tmj["orientation"]


async def test_get_nonexistent_404(client):
    """GET for an unknown map name returns 404."""
    resp = await client.get(f"{MAPS}/does_not_exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Save (create / overwrite)
# ---------------------------------------------------------------------------

async def test_save_creates_file(client, sample_tmj, patch_maps_dir):
    """POST /api/maps/{name} creates a .tmj file on disk."""
    resp = await client.post(f"{MAPS}/newfile", json=sample_tmj)
    assert resp.status_code == 200
    assert (patch_maps_dir / "newfile.tmj").exists()


async def test_save_writes_tile_data_one_row_per_line(client, sample_tmj, patch_maps_dir):
    """Tile layer data is written like Tiled: one map row per line, not one ID per line."""
    data = list(range(20))  # 5 wide x 4 high
    tmj = {**sample_tmj, "layers": [{**sample_tmj["layers"][0], "data": data}]}
    await client.post(f"{MAPS}/rows", json=tmj)
    text = (patch_maps_dir / "rows.tmj").read_text(encoding="utf-8")

    assert json.loads(text) == tmj
    assert '      "data": [\n        0, 1, 2, 3, 4,\n' in text
    assert "\n        15, 16, 17, 18, 19\n      ]" in text
    assert text.count("\n") < 40


async def test_save_formats_tile_layers_inside_groups(client, sample_tmj, patch_maps_dir):
    """Tile layers nested in group layers are formatted too, and the file still round-trips."""
    group = {"type": "group", "name": "G", "layers": [sample_tmj["layers"][0]]}
    tmj = {**sample_tmj, "layers": [group]}
    await client.post(f"{MAPS}/grouped", json=tmj)
    text = (patch_maps_dir / "grouped.tmj").read_text(encoding="utf-8")

    assert json.loads(text) == tmj
    assert "0, 0, 0, 0, 0" in text


async def test_save_overwrites(client, sample_tmj):
    """Second POST to the same name overwrites the first."""
    await client.post(f"{MAPS}/over", json=sample_tmj)
    modified = {**sample_tmj, "width": 10}
    await client.post(f"{MAPS}/over", json=modified)
    resp = await client.get(f"{MAPS}/over")
    assert resp.json()["width"] == 10


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def test_delete_map(client, sample_tmj, patch_maps_dir):
    """DELETE removes the file from disk."""
    await client.post(f"{MAPS}/todelete", json=sample_tmj)
    resp = await client.delete(f"{MAPS}/todelete")
    assert resp.status_code == 200
    assert not (patch_maps_dir / "todelete.tmj").exists()


async def test_delete_nonexistent_404(client):
    """DELETE for an unknown map name returns 404."""
    resp = await client.delete(f"{MAPS}/ghost")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

async def test_upload_tmj(client, sample_tmj, patch_maps_dir):
    """Multipart upload creates the .tmj file."""
    content = json.dumps(sample_tmj).encode()
    resp = await client.post(
        f"{MAPS}/upload",
        files={"file": ("uploaded.tmj", content, "application/json")},
    )
    assert resp.status_code == 201
    assert (patch_maps_dir / "uploaded.tmj").exists()


async def test_upload_invalid_json_422(client):
    """Uploading non-JSON content returns 422."""
    resp = await client.post(
        f"{MAPS}/upload",
        files={"file": ("bad.tmj", b"not json at all", "application/json")},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

async def test_download_tmj(client, sample_tmj):
    """GET /download returns the raw .tmj with correct content-type."""
    await client.post(f"{MAPS}/dl", json=sample_tmj)
    resp = await client.get(f"{MAPS}/dl/download")
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]


async def test_download_nonexistent_404(client):
    """Downloading a missing map returns 404."""
    resp = await client.get(f"{MAPS}/missing/download")
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
