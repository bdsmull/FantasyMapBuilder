"""
.mapset export/import: a whole world set packaged as one zip file.
"""
import io
import json
import zipfile

import pytest
import pytest_asyncio
from PIL import Image

import server.api.mapsets as mapsets_module


pytestmark = pytest.mark.asyncio


def _tileset():
    return {"firstgid": 1, "name": "Terrain", "tilewidth": 16, "tileheight": 16, "tilecount": 1,
            "columns": 8, "image": "", "tiles": [{"id": 0, "type": "Grass", "properties": [
                {"name": "color_r", "type": "int", "value": 10},
                {"name": "color_g", "type": "int", "value": 200},
                {"name": "color_b", "type": "int", "value": 30}]}]}


@pytest_asyncio.fixture
async def populated(client, sample_world_set, sample_tmj, patch_data_dir):
    """World set 'Brakka' with a map, a shared tileset (+ swatch) and a hidden file."""
    ws = {**sample_world_set, "name": "Brakka", "units": "metric",
          "nodes": [{"mapName": "world", "parentMapName": None, "parentAnchor": None, "z": 0}]}
    await client.post("/api/world_sets/Brakka", json=ws)
    await client.post("/api/world_sets/Brakka/maps/world", json={**sample_tmj, "tilesets": [_tileset()]})
    (patch_data_dir / "Brakka" / ".DS_Store").write_bytes(b"junk")
    return patch_data_dir / "Brakka"


def _zip(entries: dict) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content if isinstance(content, (bytes, str)) else json.dumps(content))
    return buffer.getvalue()


def _manifest(name="Brakka", version=1):
    return {"format": "mapset", "formatVersion": version, "worldSet": name, "files": []}


async def _import(client, data: bytes, name=None):
    form = {"name": name} if name else None
    return await client.post("/api/mapsets", files={"file": ("x.mapset", data, "application/zip")}, data=form)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

async def test_export_packages_the_world_set_folder(client, populated):
    resp = await client.get("/api/mapsets/Brakka")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "Brakka.mapset" in resp.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = sorted(zf.namelist())
        assert names == [
            "Brakka/Brakka.worldset.json",
            "Brakka/maps/world.tmj",
            "Brakka/tilesets/Terrain.png",
            "Brakka/tilesets/Terrain.tsj",
            "mapset.json",
        ]  # hidden .DS_Store left out
        manifest = json.loads(zf.read("mapset.json"))
        assert manifest["format"] == "mapset" and manifest["formatVersion"] == 1
        assert manifest["worldSet"] == "Brakka"
        assert sorted(manifest["files"]) == names[:-1]
        assert zf.getinfo("Brakka/tilesets/Terrain.png").compress_type == zipfile.ZIP_STORED
        assert zf.getinfo("Brakka/maps/world.tmj").compress_type == zipfile.ZIP_DEFLATED


async def test_export_missing_world_set_404(client):
    assert (await client.get("/api/mapsets/nope")).status_code == 404


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

async def test_round_trip_restores_identical_files(client, populated, patch_data_dir):
    exported = (await client.get("/api/mapsets/Brakka")).content
    originals = {p.relative_to(populated).as_posix(): p.read_bytes()
                 for p in populated.rglob("*") if p.is_file() and p.name != ".DS_Store"}
    await client.delete("/api/world_sets/Brakka")

    resp = await _import(client, exported)
    assert resp.status_code == 201
    assert resp.json() == {"imported": "Brakka", "maps": ["world"]}
    restored = {p.relative_to(populated).as_posix(): p.read_bytes()
                for p in populated.rglob("*") if p.is_file()}
    assert restored == originals
    loaded = (await client.get("/api/world_sets/Brakka/maps/world")).json()
    assert loaded["tilesets"][0]["tiles"][0]["type"] == "Grass"


async def test_import_existing_name_conflicts(client, populated):
    exported = (await client.get("/api/mapsets/Brakka")).content
    resp = await _import(client, exported)
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


async def test_import_under_a_new_name(client, populated, patch_data_dir):
    exported = (await client.get("/api/mapsets/Brakka")).content
    resp = await _import(client, exported, name="Brakka copy")
    assert resp.status_code == 201
    assert resp.json()["imported"] == "Brakka copy"
    folder = patch_data_dir / "Brakka copy"
    assert not (folder / "Brakka.worldset.json").exists()
    ws = json.loads((folder / "Brakka copy.worldset.json").read_text(encoding="utf-8"))
    assert ws["name"] == "Brakka copy"
    assert (await client.get("/api/world_sets")).json() == ["Brakka", "Brakka copy"]
    # the copy's map still finds its tileset
    loaded = (await client.get("/api/world_sets/Brakka copy/maps/world")).json()
    assert loaded["tilesets"][0]["name"] == "Terrain"


@pytest.mark.parametrize("entries, message", [
    ({"Brakka/Brakka.worldset.json": {"name": "Brakka"}}, "no mapset.json"),
    ({"mapset.json": "not json"}, "not JSON"),
    ({"mapset.json": {"format": "other", "formatVersion": 1, "worldSet": "Brakka"}}, "wrong format"),
    ({"mapset.json": _manifest(version=99)}, "unsupported format version"),
    ({"mapset.json": _manifest()}, "no Brakka.worldset.json"),
    ({"mapset.json": _manifest(), "Brakka/Brakka.worldset.json": {}, "../evil.txt": "x"}, "unexpected entry"),
    ({"mapset.json": _manifest(), "Brakka/Brakka.worldset.json": {}, "Brakka/../../evil.txt": "x"}, "unexpected entry"),
    ({"mapset.json": _manifest(), "Brakka/Brakka.worldset.json": {}, "Other/x.tmj": "{}"}, "unexpected entry"),
])
async def test_import_rejects_invalid_packages(client, patch_data_dir, entries, message):
    resp = await _import(client, _zip(entries))
    assert resp.status_code == 400
    assert message in resp.json()["detail"]
    # nothing is left behind, not even a staging folder
    assert list(patch_data_dir.iterdir()) == []


async def test_import_rejects_non_zip(client):
    resp = await _import(client, b"definitely not a zip")
    assert resp.status_code == 400
    assert "not a zip file" in resp.json()["detail"]


async def test_import_rejects_oversized_contents(client, patch_data_dir, monkeypatch):
    monkeypatch.setattr(mapsets_module, "MAX_UNCOMPRESSED_BYTES", 10)
    data = _zip({"mapset.json": _manifest(), "Brakka/Brakka.worldset.json": {"name": "Brakka", "nodes": []}})
    resp = await _import(client, data)
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"]


async def test_import_rejects_invalid_target_name(client, populated):
    exported = (await client.get("/api/mapsets/Brakka")).content
    resp = await _import(client, exported, name=".hidden")
    assert resp.status_code == 400


async def test_imported_image_is_byte_identical(client, populated, tmp_path):
    """Uploaded sprite sheets travel inside the package unchanged."""
    png = tmp_path / "sheet.png"
    Image.new("RGB", (16, 16), (1, 2, 3)).save(png)
    await client.post("/api/world_sets/Brakka/tilesets/images",
                      files={"file": ("sheet.png", png.read_bytes(), "image/png")})
    exported = (await client.get("/api/mapsets/Brakka")).content
    await _import(client, exported, name="Copy")
    assert (populated.parent / "Copy" / "tilesets" / "sheet.png").read_bytes() == png.read_bytes()
