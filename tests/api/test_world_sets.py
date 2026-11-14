"""
FastAPI endpoint tests for the World Set API.
All file I/O is redirected to a temporary data folder via the `patch_data_dir` fixture.
Each world set is a folder: <data>/<name>/<name>.worldset.json plus maps/.
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

async def test_save_creates_file(client, sample_world_set, patch_data_dir):
    """POST /api/world_sets/{name} creates the world set folder, its .worldset.json and maps/."""
    resp = await client.post("/api/world_sets/newfile", json=sample_world_set)
    assert resp.status_code == 200
    assert resp.json() == {"saved": "newfile"}
    assert (patch_data_dir / "newfile" / "newfile.worldset.json").exists()
    assert (patch_data_dir / "newfile" / "maps").is_dir()


async def test_save_overwrites(client, sample_world_set):
    """Second POST to the same name overwrites the first."""
    await client.post("/api/world_sets/over", json=sample_world_set)
    modified = {**sample_world_set, "nodes": [{"mapName": "added", "parentMapName": None, "parentAnchor": None, "z": 0}]}
    await client.post("/api/world_sets/over", json=modified)
    resp = await client.get("/api/world_sets/over")
    assert len(resp.json()["nodes"]) == 1


async def test_save_strips_suffix_if_provided(client, sample_world_set, patch_data_dir):
    """Name arriving with .worldset.json suffix is stripped before write (no double-suffixed file)."""
    resp = await client.post("/api/world_sets/with_suffix.worldset.json", json=sample_world_set)
    assert resp.status_code == 200
    assert resp.json() == {"saved": "with_suffix"}
    assert (patch_data_dir / "with_suffix" / "with_suffix.worldset.json").exists()
    assert not (patch_data_dir / "with_suffix.worldset.json").exists()


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def test_delete_world_set(client, sample_world_set, patch_data_dir):
    """DELETE moves the whole folder, maps included, to <data>/.trash/ instead of erasing it."""
    await client.post("/api/world_sets/todelete", json=sample_world_set)
    (patch_data_dir / "todelete" / "maps" / "m.tmj").write_text("{}", encoding="utf-8")
    resp = await client.delete("/api/world_sets/todelete")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": "todelete"}
    assert not (patch_data_dir / "todelete").exists()
    trashed = list((patch_data_dir / ".trash").iterdir())
    assert len(trashed) == 1 and trashed[0].name.startswith("todelete ")
    assert (trashed[0] / "maps" / "m.tmj").exists()
    assert (await client.get("/api/world_sets")).json() == []


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


async def test_name_starting_with_dot_400(client, sample_world_set):
    """Names starting with a dot are reserved (e.g. .trash) and rejected."""
    resp = await client.post("/api/world_sets/.trash", json=sample_world_set)
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Folder discovery and data folder
# ---------------------------------------------------------------------------

async def test_list_ignores_folders_without_worldset_file(client, sample_world_set, patch_data_dir):
    """Only folders holding a matching <name>.worldset.json are world sets."""
    (patch_data_dir / "stray").mkdir()
    await client.post("/api/world_sets/real", json=sample_world_set)
    assert (await client.get("/api/world_sets")).json() == ["real"]


async def test_data_dir_endpoint(client, patch_data_dir):
    """GET /api/data_dir reports the data folder location."""
    resp = await client.get("/api/data_dir")
    assert resp.status_code == 200
    assert resp.json() == {"dataDir": str(patch_data_dir)}


# ---------------------------------------------------------------------------
# Maps across world sets
# ---------------------------------------------------------------------------

async def test_list_all_maps_across_world_sets(client, sample_world_set, sample_tmj):
    """GET /api/maps lists every map with its world set, sorted."""
    await client.post("/api/world_sets/beta", json=sample_world_set)
    await client.post("/api/world_sets/alpha", json=sample_world_set)
    await client.post("/api/world_sets/beta/maps/m2", json=sample_tmj)
    await client.post("/api/world_sets/alpha/maps/m1", json=sample_tmj)
    await client.post("/api/world_sets/beta/maps/m1", json=sample_tmj)
    assert (await client.get("/api/maps")).json() == [
        {"worldSet": "alpha", "name": "m1"},
        {"worldSet": "beta", "name": "m1"},
        {"worldSet": "beta", "name": "m2"},
    ]


async def test_same_map_name_in_two_world_sets_is_independent(client, sample_world_set, sample_tmj):
    """Maps are scoped to their world set: saving one never touches the other."""
    await client.post("/api/world_sets/a", json=sample_world_set)
    await client.post("/api/world_sets/b", json=sample_world_set)
    await client.post("/api/world_sets/a/maps/shared", json=sample_tmj)
    await client.post("/api/world_sets/b/maps/shared", json={**sample_tmj, "width": 9})
    assert (await client.get("/api/world_sets/a/maps/shared")).json()["width"] == sample_tmj["width"]
    assert (await client.get("/api/world_sets/b/maps/shared")).json()["width"] == 9


async def test_map_in_missing_world_set_404(client, sample_tmj):
    """Saving or listing maps of a world set that doesn't exist returns 404."""
    assert (await client.post("/api/world_sets/nope/maps/m", json=sample_tmj)).status_code == 404
    assert (await client.get("/api/world_sets/nope/maps")).status_code == 404
