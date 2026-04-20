"""
FastAPI endpoint tests for the World Set API.
All file I/O is redirected to a temporary directory via the `patch_world_sets_dir` fixture.
"""
import pytest


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

async def test_list_world_sets_empty(client):
    """Empty world_sets directory returns an empty list."""
    resp = await client.get("/api/world_sets")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_save_and_list(client, sample_world_set):
    """Saving a world set makes it appear in the list — and the name is the bare stem (no .worldset suffix)."""
    await client.post("/api/world_sets/myworld", json=sample_world_set)
    resp = await client.get("/api/world_sets")
    assert resp.status_code == 200
    names = resp.json()
    assert "myworld" in names
    # Regression guard: double-extension stem must be stripped cleanly.
    assert "myworld.worldset" not in names


async def test_list_sorted(client, sample_world_set):
    """List output is sorted alphabetically."""
    await client.post("/api/world_sets/charlie", json=sample_world_set)
    await client.post("/api/world_sets/alpha", json=sample_world_set)
    await client.post("/api/world_sets/bravo", json=sample_world_set)
    resp = await client.get("/api/world_sets")
    assert resp.json() == ["alpha", "bravo", "charlie"]


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

async def test_save_and_get_roundtrip(client, sample_world_set):
    """Saved world set can be retrieved and has the same structure."""
    await client.post("/api/world_sets/round_trip", json=sample_world_set)
    resp = await client.get("/api/world_sets/round_trip")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == sample_world_set["name"]
    assert data["version"] == sample_world_set["version"]
    assert data["nodes"] == sample_world_set["nodes"]


async def test_get_nonexistent_404(client):
    """GET for an unknown world set name returns 404."""
    resp = await client.get("/api/world_sets/does_not_exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------

async def test_save_creates_file(client, sample_world_set, patch_world_sets_dir):
    """POST /api/world_sets/{name} creates a .worldset.json file on disk."""
    resp = await client.post("/api/world_sets/newfile", json=sample_world_set)
    assert resp.status_code == 200
    assert resp.json() == {"saved": "newfile"}
    assert (patch_world_sets_dir / "newfile.worldset.json").exists()


async def test_save_overwrites(client, sample_world_set):
    """Second POST to the same name overwrites the first."""
    await client.post("/api/world_sets/over", json=sample_world_set)
    modified = {**sample_world_set, "nodes": [{"mapName": "added", "parentMapName": None, "parentAnchor": None, "z": 0}]}
    await client.post("/api/world_sets/over", json=modified)
    resp = await client.get("/api/world_sets/over")
    assert len(resp.json()["nodes"]) == 1


async def test_save_strips_suffix_if_provided(client, sample_world_set, patch_world_sets_dir):
    """Name arriving with .worldset.json suffix is stripped before write (no double-suffixed file)."""
    resp = await client.post("/api/world_sets/with_suffix.worldset.json", json=sample_world_set)
    assert resp.status_code == 200
    assert resp.json() == {"saved": "with_suffix"}
    assert (patch_world_sets_dir / "with_suffix.worldset.json").exists()
    assert not (patch_world_sets_dir / "with_suffix.worldset.json.worldset.json").exists()


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def test_delete_world_set(client, sample_world_set, patch_world_sets_dir):
    """DELETE removes the file from disk and returns the stem."""
    await client.post("/api/world_sets/todelete", json=sample_world_set)
    resp = await client.delete("/api/world_sets/todelete")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": "todelete"}
    assert not (patch_world_sets_dir / "todelete.worldset.json").exists()


async def test_delete_nonexistent_404(client):
    """DELETE for an unknown world set name returns 404."""
    resp = await client.delete("/api/world_sets/ghost")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Invalid names
# ---------------------------------------------------------------------------

async def test_invalid_name_400(client, sample_world_set):
    """Names with characters outside [\\w\\-. ] return 400. We use %21 (!) because %2F (/) is consumed by the ASGI router before reaching the handler."""
    resp = await client.get("/api/world_sets/bad%21name")
    assert resp.status_code == 400
