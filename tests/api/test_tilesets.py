"""
Shared tilesets: maps reference Tiled external tileset files (.tsj) in their world
set's tilesets/ folder; the API inlines them for the editor and writes them back on save.
"""
import json

import pytest
from PIL import Image

from server.tileset_files import SWATCH_PROPERTY, same_tileset


pytestmark = pytest.mark.asyncio

MAPS = "/api/world_sets/ws/maps"


@pytest.fixture(autouse=True)
def _world_set(patch_maps_dir):
    return patch_maps_dir


@pytest.fixture
def tilesets_dir(patch_maps_dir):
    return patch_maps_dir.parent / "tilesets"


def _tile(tid, name, rgb):
    r, g, b = rgb
    return {"id": tid, "type": name, "properties": [
        {"name": "color_r", "type": "int", "value": r},
        {"name": "color_g", "type": "int", "value": g},
        {"name": "color_b", "type": "int", "value": b},
    ]}


def _tileset(name="Terrain", firstgid=1, tiles=None):
    tiles = tiles if tiles is not None else [_tile(0, "Grass", (10, 200, 30)), _tile(1, "Sea", (0, 0, 255))]
    return {"firstgid": firstgid, "name": name, "tilewidth": 16, "tileheight": 16,
            "tilecount": len(tiles), "columns": 8, "image": "", "tiles": tiles}


def _map(sample_tmj, *tilesets):
    return {**sample_tmj, "tilesets": list(tilesets)}


async def test_save_writes_external_tileset_and_swatch(client, sample_tmj, patch_maps_dir, tilesets_dir):
    """A color-only tileset is written to tilesets/<name>.tsj with a generated swatch PNG."""
    resp = await client.post(f"{MAPS}/m", json=_map(sample_tmj, _tileset()))
    assert resp.json()["tilesets"] == [{"firstgid": 1, "source": "../tilesets/Terrain.tsj", "name": "Terrain"}]

    on_disk = json.loads((patch_maps_dir / "m.tmj").read_text(encoding="utf-8"))
    assert on_disk["tilesets"] == [{"firstgid": 1, "source": "../tilesets/Terrain.tsj"}]

    tsj = json.loads((tilesets_dir / "Terrain.tsj").read_text(encoding="utf-8"))
    assert tsj["type"] == "tileset"
    assert tsj["image"] == "Terrain.png"
    assert tsj["tilerendersize"] == "grid"
    assert {"name": SWATCH_PROPERTY, "type": "bool", "value": True} in tsj["properties"]
    assert [t["type"] for t in tsj["tiles"]] == ["Grass", "Sea"]

    swatch = Image.open(tilesets_dir / "Terrain.png").convert("RGB")
    assert swatch.size == (8 * 16, 16)
    assert swatch.getpixel((3, 3)) == (10, 200, 30)    # tile 0
    assert swatch.getpixel((16 + 3, 3)) == (0, 0, 255)  # tile 1


async def test_get_inlines_tileset_for_the_editor(client, sample_tmj):
    """GET returns the full tileset, keeps its source, and hides the generated swatch."""
    await client.post(f"{MAPS}/m", json=_map(sample_tmj, _tileset()))
    ts = (await client.get(f"{MAPS}/m")).json()["tilesets"][0]
    assert ts["source"] == "../tilesets/Terrain.tsj"
    assert ts["firstgid"] == 1
    assert ts["image"] == ""  # editor draws colors
    assert "properties" not in ts
    assert [t["type"] for t in ts["tiles"]] == ["Grass", "Sea"]


async def test_round_trip_does_not_duplicate(client, sample_tmj, tilesets_dir):
    """Loading and re-saving a map reuses its tileset file."""
    await client.post(f"{MAPS}/m", json=_map(sample_tmj, _tileset()))
    loaded = (await client.get(f"{MAPS}/m")).json()
    await client.post(f"{MAPS}/m", json=loaded)
    assert sorted(p.name for p in tilesets_dir.glob("*.tsj")) == ["Terrain.tsj"]


async def test_identical_new_tileset_is_shared(client, sample_tmj, tilesets_dir):
    """Two maps adding the same tileset share one file."""
    await client.post(f"{MAPS}/a", json=_map(sample_tmj, _tileset()))
    resp = await client.post(f"{MAPS}/b", json=_map(sample_tmj, _tileset(firstgid=5)))
    assert resp.json()["tilesets"][0]["source"] == "../tilesets/Terrain.tsj"
    assert sorted(p.name for p in tilesets_dir.glob("*.tsj")) == ["Terrain.tsj"]


async def test_different_tileset_with_taken_name_gets_new_name(client, sample_tmj, tilesets_dir):
    """A new tileset never overwrites a different one that has the same name."""
    await client.post(f"{MAPS}/a", json=_map(sample_tmj, _tileset()))
    other = _tileset(tiles=[_tile(0, "Lava", (255, 80, 0))])
    resp = await client.post(f"{MAPS}/b", json=_map(sample_tmj, other))
    assert resp.json()["tilesets"] == [{"firstgid": 1, "source": "../tilesets/Terrain (2).tsj", "name": "Terrain (2)"}]
    original = json.loads((tilesets_dir / "Terrain.tsj").read_text(encoding="utf-8"))
    assert [t["type"] for t in original["tiles"]] == ["Grass", "Sea"]


async def test_editing_a_shared_tileset_updates_every_map(client, sample_tmj):
    """Saving a map whose tileset has a source writes that shared file."""
    await client.post(f"{MAPS}/a", json=_map(sample_tmj, _tileset()))
    await client.post(f"{MAPS}/b", json=_map(sample_tmj, _tileset()))
    loaded = (await client.get(f"{MAPS}/a")).json()
    loaded["tilesets"][0]["tiles"].append(_tile(2, "Sand", (220, 200, 120)))
    loaded["tilesets"][0]["tilecount"] = 3
    await client.post(f"{MAPS}/a", json=loaded)
    other = (await client.get(f"{MAPS}/b")).json()["tilesets"][0]
    assert [t["type"] for t in other["tiles"]] == ["Grass", "Sea", "Sand"]


async def test_missing_tileset_file_is_reported_and_kept(client, sample_tmj, patch_maps_dir):
    """A reference to a missing .tsj loads as an empty '(missing)' tileset and survives a save."""
    (patch_maps_dir / "m.tmj").write_text(json.dumps(
        {**sample_tmj, "tilesets": [{"firstgid": 1, "source": "../tilesets/Gone.tsj"}]}), encoding="utf-8")
    loaded = (await client.get(f"{MAPS}/m")).json()
    assert loaded["tilesets"][0]["name"] == "(missing) ../tilesets/Gone.tsj"
    await client.post(f"{MAPS}/m", json=loaded)
    on_disk = json.loads((patch_maps_dir / "m.tmj").read_text(encoding="utf-8"))
    assert on_disk["tilesets"] == [{"firstgid": 1, "source": "../tilesets/Gone.tsj"}]


async def test_source_outside_tilesets_folder_is_not_read(client, sample_tmj, patch_maps_dir):
    """A source pointing outside <ws>/tilesets/ is treated as missing (no path traversal)."""
    (patch_maps_dir / "m.tmj").write_text(json.dumps(
        {**sample_tmj, "tilesets": [{"firstgid": 1, "source": "../../ws/ws.worldset.json"}]}), encoding="utf-8")
    loaded = (await client.get(f"{MAPS}/m")).json()
    assert loaded["tilesets"][0]["name"].startswith("(missing)")


async def test_uploaded_image_tileset(client, sample_tmj, tilesets_dir):
    """An uploaded sprite sheet is stored in tilesets/ and used instead of a swatch."""
    png = tilesets_dir.parent / "sheet.png"
    Image.new("RGB", (32, 16), (1, 2, 3)).save(png)
    resp = await client.post("/api/world_sets/ws/tilesets/images",
                             files={"file": ("my sheet.png", png.read_bytes(), "image/png")})
    assert resp.status_code == 201
    url = resp.json()["image"]
    assert url == "/api/world_sets/ws/tilesets/my%20sheet.png"
    assert (await client.get(url)).status_code == 200

    sheet = {**_tileset(name="Sheet"), "image": url, "imagewidth": 32, "imageheight": 16}
    await client.post(f"{MAPS}/m", json=_map(sample_tmj, sheet))
    tsj = json.loads((tilesets_dir / "Sheet.tsj").read_text(encoding="utf-8"))
    assert tsj["image"] == "my sheet.png"
    assert "properties" not in tsj
    assert not (tilesets_dir / "Sheet.png").exists()
    assert (await client.get(f"{MAPS}/m")).json()["tilesets"][0]["image"] == url


async def test_legacy_absolute_image_is_copied_in(client, sample_tmj, tilesets_dir, tmp_path):
    """An embedded tileset with an absolute image path gets a copy in tilesets/."""
    outside = tmp_path / "outside.png"
    Image.new("RGB", (16, 16), (9, 9, 9)).save(outside)
    await client.post(f"{MAPS}/m", json=_map(sample_tmj, {**_tileset(name="Old"), "image": str(outside)}))
    tsj = json.loads((tilesets_dir / "Old.tsj").read_text(encoding="utf-8"))
    assert tsj["image"] == "Old.png"
    assert (tilesets_dir / "Old.png").read_bytes() == outside.read_bytes()


async def test_tileset_image_route_rejects_non_images_and_traversal(client, tilesets_dir):
    tilesets_dir.mkdir(exist_ok=True)
    (tilesets_dir / "x.tsj").write_text("{}", encoding="utf-8")
    assert (await client.get("/api/world_sets/ws/tilesets/x.tsj")).status_code == 400
    assert (await client.get("/api/world_sets/ws/tilesets/..%5Cws.worldset.json")).status_code == 400
    assert (await client.get("/api/world_sets/ws/tilesets/none.png")).status_code == 404


async def test_upload_rejects_non_images(client):
    resp = await client.post("/api/world_sets/ws/tilesets/images",
                             files={"file": ("notes.txt", b"hi", "text/plain")})
    assert resp.status_code == 400


async def test_same_tileset_ignores_property_order_and_placement():
    """Tiled re-sorts properties on save; that must not count as a different tileset."""
    a = _tileset()
    b = json.loads(json.dumps(_tileset(firstgid=40)))
    for tile in b["tiles"]:
        tile["properties"].reverse()
    assert same_tileset(a, b)
    assert not same_tileset(a, _tileset(tiles=[_tile(0, "Grass", (10, 200, 31))]))
