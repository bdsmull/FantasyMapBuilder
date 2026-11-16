"""
Importing a single map (with its tilesets) from another world set or a .mapset.
"""
import json

import pytest
import pytest_asyncio
from PIL import Image

from server.map_import import GID_FLAGS


pytestmark = pytest.mark.asyncio


def _tile(tid, name, rgb):
    r, g, b = rgb
    return {"id": tid, "type": name, "properties": [
        {"name": "color_r", "type": "int", "value": r},
        {"name": "color_g", "type": "int", "value": g},
        {"name": "color_b", "type": "int", "value": b}]}


GRASS, SEA, LAVA, SAND = _tile(0, "Grass", (0, 200, 0)), _tile(1, "Sea", (0, 0, 255)), \
    _tile(1, "Lava", (255, 60, 0)), _tile(2, "Sand", (230, 210, 150))


def _tileset(name, tiles, firstgid=1, **extra):
    return {"firstgid": firstgid, "name": name, "tilewidth": 16, "tileheight": 16,
            "tilecount": len(tiles), "columns": 8, "image": "", "tiles": tiles, **extra}


def _map(sample_tmj, tilesets, data, **extra):
    layer = {**sample_tmj["layers"][0], "width": len(data), "height": 1, "data": data}
    return {**sample_tmj, "width": len(data), "height": 1, "tilesets": tilesets, "layers": [layer], **extra}


@pytest_asyncio.fixture
async def make(client, sample_world_set):
    """make(world_set, map_name, map_json, units=None) creates the world set if needed and saves the map."""
    created = set()

    async def _make(ws, name=None, data=None, units=None):
        if ws not in created:
            await client.post(f"/api/world_sets/{ws}",
                              json={**sample_world_set, "name": ws, **({"units": units} if units else {})})
            created.add(ws)
        if name:
            await client.post(f"/api/world_sets/{ws}/maps/{name}", json=data)
    return _make


async def _plan(client, target, map_name, source="A"):
    return await client.post(f"/api/world_sets/{target}/import_map/plan",
                             json={"source": {"worldSet": source}, "map": map_name})


async def _import(client, target, map_name, source="A", **body):
    src = {"staging": source[8:]} if source.startswith("staging:") else {"worldSet": source}
    return await client.post(f"/api/world_sets/{target}/import_map", json={"source": src, "map": map_name, **body})


def _data(patch_data_dir, ws, name):
    return json.loads((patch_data_dir / ws / "maps" / f"{name}.tmj").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Simple cases
# ---------------------------------------------------------------------------

async def test_import_with_new_tileset(client, make, sample_tmj, patch_data_dir):
    await make("A", "m", _map(sample_tmj, [_tileset("Terrain", [GRASS, SEA])], [1, 2]))
    await make("B")
    plan = (await _plan(client, "B", "m")).json()
    assert plan == {"map": "m", "mapExists": False, "tilesets": [{"name": "Terrain", "status": "new"}], "unitsPinned": None}

    resp = await _import(client, "B", "m")
    assert resp.status_code == 201
    assert resp.json()["imported"] == "m"
    on_disk = _data(patch_data_dir, "B", "m")
    assert on_disk["tilesets"] == [{"firstgid": 1, "source": "../tilesets/Terrain.tsj"}]
    assert on_disk["layers"][0]["data"] == [1, 2]
    assert (patch_data_dir / "B" / "tilesets" / "Terrain.png").exists()
    ws = (await client.get("/api/world_sets/B")).json()
    assert ws["nodes"] == []  # arrives unplaced


async def test_identical_tileset_is_reused(client, make, sample_tmj, patch_data_dir):
    terrain = _tileset("Terrain", [GRASS, SEA])
    await make("A", "m", _map(sample_tmj, [terrain], [1, 2]))
    await make("B", "existing", _map(sample_tmj, [terrain], [2, 2]))
    assert (await _plan(client, "B", "m")).json()["tilesets"] == [{"name": "Terrain", "status": "identical"}]
    await _import(client, "B", "m")
    assert sorted(p.name for p in (patch_data_dir / "B" / "tilesets").glob("*.tsj")) == ["Terrain.tsj"]


async def test_map_name_clash(client, make, sample_tmj, patch_data_dir):
    m = _map(sample_tmj, [_tileset("Terrain", [GRASS])], [1])
    await make("A", "m", m)
    await make("B", "m", m)
    assert (await _plan(client, "B", "m")).json()["mapExists"] is True
    assert (await _import(client, "B", "m")).status_code == 409
    resp = await _import(client, "B", "m", newName="m from A")
    assert resp.status_code == 201
    assert (patch_data_dir / "B" / "maps" / "m from A.tmj").exists()


async def test_same_source_and_target_rejected(client, make, sample_tmj):
    await make("A", "m", _map(sample_tmj, [], [0]))
    assert (await _import(client, "A", "m", newName="copy")).status_code == 400


async def test_unknown_map_400(client, make):
    await make("A")
    await make("B")
    assert (await _plan(client, "B", "nope")).status_code == 400


# ---------------------------------------------------------------------------
# Tileset clashes
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def clash(make, sample_tmj):
    """A's Terrain: Grass, Lava (id 1), Sand; B's Terrain: Grass, Sea (id 1). A's map also uses Town."""
    town = _tileset("Town", [_tile(0, "Road", (90, 90, 90)), _tile(1, "Wall", (60, 60, 60))], firstgid=4)
    a_map = _map(sample_tmj, [_tileset("Terrain", [GRASS, LAVA, SAND]), town],
                 [1, 2, 3, 4, 5, 2 | 0x80000000])  # last: Lava flipped horizontally
    await make("A", "m", a_map)
    await make("B", "b_map", _map(sample_tmj, [_tileset("Terrain", [GRASS, SEA])], [1, 2]))


async def test_plan_reports_conflict_with_summary(client, clash):
    plan = (await _plan(client, "B", "m")).json()
    terrain = next(t for t in plan["tilesets"] if t["name"] == "Terrain")
    assert terrain["status"] == "conflict"
    assert terrain["canMerge"] is True
    assert terrain["summary"] == {
        "targetTiles": 2, "importedTiles": 3, "sameTiles": 1,
        "differingTiles": [{"id": 1, "target": "Sea", "imported": "Lava"}],
        "onlyImported": [2],
    }


async def test_conflict_needs_a_choice(client, clash):
    resp = await _import(client, "B", "m")
    assert resp.status_code == 400
    assert "Terrain" in resp.json()["detail"]


async def test_keep_both(client, clash, patch_data_dir):
    resp = await _import(client, "B", "m", tilesetChoices={"Terrain": "keep_both"})
    assert resp.status_code == 201
    on_disk = _data(patch_data_dir, "B", "m")
    assert on_disk["tilesets"][0]["source"] == "../tilesets/Terrain (2).tsj"
    assert on_disk["layers"][0]["data"] == [1, 2, 3, 4, 5, 2 | 0x80000000]
    original = json.loads((patch_data_dir / "B" / "tilesets" / "Terrain.tsj").read_text(encoding="utf-8"))
    assert [t["type"] for t in original["tiles"]] == ["Grass", "Sea"]


async def test_use_target(client, clash, patch_data_dir):
    await _import(client, "B", "m", tilesetChoices={"Terrain": "use_target"})
    loaded = (await client.get("/api/world_sets/B/maps/m")).json()
    assert loaded["tilesets"][0]["source"] == "../tilesets/Terrain.tsj"
    assert [t["type"] for t in loaded["tilesets"][0]["tiles"]] == ["Grass", "Sea"]
    # Target's Terrain has 2 tiles (A's had 3): Town moves down to firstgid 3
    assert loaded["tilesets"][1]["firstgid"] == 3
    assert loaded["layers"][0]["data"] == [1, 2, 3, 3, 4, 2 | 0x80000000]


async def test_merge_keeps_existing_maps_unchanged(client, clash, patch_data_dir):
    resp = await _import(client, "B", "m", tilesetChoices={"Terrain": "merge"})
    assert resp.status_code == 201
    merged = json.loads((patch_data_dir / "B" / "tilesets" / "Terrain.tsj").read_text(encoding="utf-8"))
    # B's tiles keep their IDs; Sand keeps its free ID 2; Lava (clashed with Sea at 1) is appended as 3
    assert [(t["id"], t["type"]) for t in merged["tiles"]] == [(0, "Grass"), (1, "Sea"), (2, "Sand"), (3, "Lava")]

    loaded = (await client.get("/api/world_sets/B/maps/m")).json()
    assert loaded["tilesets"][0]["tilecount"] == 4
    assert loaded["tilesets"][1]["firstgid"] == 5  # Town shifted past the bigger Terrain
    # Grass, Lava->3, Sand->2, Road, Wall, flipped Lava keeps its flag
    assert loaded["layers"][0]["data"] == [1, 4, 3, 5, 6, 4 | 0x80000000]
    # B's own map still shows Grass, Sea
    b_map = (await client.get("/api/world_sets/B/maps/b_map")).json()
    tiles = {t["id"]: t["type"] for t in b_map["tilesets"][0]["tiles"]}
    assert [tiles[g - 1] for g in b_map["layers"][0]["data"]] == ["Grass", "Sea"]


async def test_merge_not_offered_for_sprite_sheets(client, make, sample_tmj, patch_data_dir, tmp_path):
    sheet = tmp_path / "sheet.png"
    Image.new("RGB", (32, 16), (5, 5, 5)).save(sheet)
    await make("A", "m", _map(sample_tmj, [_tileset("Art", [GRASS, LAVA], image=str(sheet))], [1]))
    await make("B", "b", _map(sample_tmj, [_tileset("Art", [GRASS, SEA])], [1]))
    terrain = (await _plan(client, "B", "m")).json()["tilesets"][0]
    assert terrain["canMerge"] is False
    assert (await _import(client, "B", "m", tilesetChoices={"Art": "merge"})).status_code == 400


async def test_sprite_sheet_travels_without_overwriting(client, make, sample_tmj, patch_data_dir, tmp_path):
    """An imported sheet is copied in; a different image with the same file name is kept."""
    sheet = tmp_path / "sheet.png"
    Image.new("RGB", (32, 16), (1, 2, 3)).save(sheet)
    await make("A", "m", _map(sample_tmj, [_tileset("Art", [GRASS], image=str(sheet))], [1]))
    await make("B")
    other = patch_data_dir / "B" / "tilesets"
    other.mkdir(parents=True)
    Image.new("RGB", (8, 8), (9, 9, 9)).save(other / "Art.png")
    before = (other / "Art.png").read_bytes()

    await _import(client, "B", "m")
    tsj = json.loads((other / "Art.tsj").read_text(encoding="utf-8"))
    assert tsj["image"] != "Art.png"
    assert (other / tsj["image"]).read_bytes() == sheet.read_bytes()
    assert (other / "Art.png").read_bytes() == before


async def test_same_tiles_different_image_is_not_identical(client, make, sample_tmj, tmp_path, patch_data_dir):
    """Regression: two sprite-sheet tilesets with the same tiles but different pictures differ."""
    red, blue = tmp_path / "red.png", tmp_path / "blue.png"
    Image.new("RGB", (16, 16), (255, 0, 0)).save(red)
    Image.new("RGB", (16, 16), (0, 0, 255)).save(blue)
    await make("B", "first", _map(sample_tmj, [_tileset("Art", [GRASS], image=str(red))], [1]))
    resp = await client.post("/api/world_sets/B/maps/second",
                             json=_map(sample_tmj, [_tileset("Art", [GRASS], image=str(blue))], [1]))
    assert resp.json()["tilesets"][0]["name"] == "Art (2)"


# ---------------------------------------------------------------------------
# Units and .mapset sources
# ---------------------------------------------------------------------------

async def test_inherited_units_are_pinned(client, make, sample_tmj, patch_data_dir):
    m = _map(sample_tmj, [], [0], properties=[{"name": "scale", "type": "string", "value": "battle"}])
    await make("A", "inherits", m, units="imperial")
    await make("A", "own", {**m, "properties": m["properties"] + [{"name": "units", "type": "string", "value": "metric"}]})
    await make("B", units="metric")
    assert (await _plan(client, "B", "inherits")).json()["unitsPinned"] == "imperial"

    await _import(client, "B", "inherits")
    await _import(client, "B", "own")
    props = {p["name"]: p["value"] for p in _data(patch_data_dir, "B", "inherits")["properties"]}
    assert props["units"] == "imperial"
    props = {p["name"]: p["value"] for p in _data(patch_data_dir, "B", "own")["properties"]}
    assert props["units"] == "metric"


async def test_import_from_a_mapset(client, make, sample_tmj, patch_data_dir):
    await make("Source", "m", _map(sample_tmj, [_tileset("Terrain", [GRASS, SEA])], [2]))
    package = (await client.get("/api/mapsets/Source")).content
    await make("B")

    resp = await client.post("/api/mapsets/inspect", files={"file": ("s.mapset", package, "application/zip")})
    assert resp.status_code == 201
    staged = resp.json()
    assert staged["worldSet"] == "Source" and staged["maps"] == ["m"]
    # The staged copy is not listed as a world set
    assert (await client.get("/api/world_sets")).json() == ["B", "Source"]

    plan = await client.post("/api/world_sets/B/import_map/plan",
                             json={"source": {"staging": staged["staging"]}, "map": "m"})
    assert plan.json()["tilesets"] == [{"name": "Terrain", "status": "new"}]
    resp = await _import(client, "B", "m", source=f"staging:{staged['staging']}")
    assert resp.status_code == 201
    assert _data(patch_data_dir, "B", "m")["layers"][0]["data"] == [2]


async def test_unknown_staging_token_404(client, make):
    await make("B")
    resp = await client.post("/api/world_sets/B/import_map/plan",
                             json={"source": {"staging": "0" * 32}, "map": "m"})
    assert resp.status_code == 404
    resp = await client.post("/api/world_sets/B/import_map/plan",
                             json={"source": {"staging": "../B"}, "map": "m"})
    assert resp.status_code == 404


async def test_gid_flag_mask_covers_hex_rotation():
    assert GID_FLAGS == 0x80000000 | 0x40000000 | 0x20000000 | 0x10000000
