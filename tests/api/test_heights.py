"""
Map elevation: height patches stored as <ws>/heights/<map>.tif (+ .mask.png),
exchanged with the editor as little-endian int32 centimeters followed by a mask.
"""
import array
import io
import json
import struct
import sys
import zipfile

import pytest


pytestmark = pytest.mark.asyncio

URL = "/api/world_sets/ws/heights"


@pytest.fixture(autouse=True)
def _world_set(patch_maps_dir):
    return patch_maps_dir


def _body(values, mask):
    data = array.array("i", values)
    if sys.byteorder == "big":
        data.byteswap()
    return data.tobytes() + bytes(mask)


def _headers(cols, rows):
    return {"X-Height-Cols": str(cols), "X-Height-Rows": str(rows), "Content-Type": "application/octet-stream"}


async def _square_map(client, sample_tmj, name="m"):
    # sample_tmj is 5 x 4 cells -> 6 x 5 corner samples
    await client.post(f"/api/world_sets/ws/maps/{name}", json=sample_tmj)


async def test_round_trip_is_exact(client, sample_tmj, patch_maps_dir):
    await _square_map(client, sample_tmj)
    values = [-1099400, 0, 884800, 2147483647, -2147483648] + list(range(25))
    mask = [1, 0] * 15
    resp = await client.put(f"{URL}/m", content=_body(values, mask), headers=_headers(6, 5))
    assert resp.status_code == 200
    assert (patch_maps_dir.parent / "heights" / "m.tif").is_file()
    assert (patch_maps_dir.parent / "heights" / "m.mask.png").is_file()

    got = await client.get(f"{URL}/m")
    assert got.status_code == 200
    assert got.headers["x-height-cols"] == "6" and got.headers["x-height-rows"] == "5"
    assert got.content == _body(values, mask)
    assert list(struct.unpack("<5i", got.content[:20])) == values[:5]


async def test_hex_maps_sample_cell_centres(client, sample_tmj):
    await client.post("/api/world_sets/ws/maps/h", json={**sample_tmj, "orientation": "hexagonal"})
    assert (await client.put(f"{URL}/h", content=_body([0] * 30, [0] * 30), headers=_headers(6, 5))).status_code == 400
    assert (await client.put(f"{URL}/h", content=_body([0] * 20, [0] * 20), headers=_headers(5, 4))).status_code == 200


async def test_rejects_wrong_grid_length_and_headers(client, sample_tmj):
    await _square_map(client, sample_tmj)
    assert (await client.put(f"{URL}/m", content=_body([0] * 20, [0] * 20), headers=_headers(5, 4))).status_code == 400
    assert (await client.put(f"{URL}/m", content=b"\x00" * 10, headers=_headers(6, 5))).status_code == 400
    resp = await client.put(f"{URL}/m", content=_body([0] * 30, [0] * 30))
    assert resp.status_code == 400 and "X-Height-Cols" in resp.json()["detail"]


async def test_missing_heights_and_maps_404(client, sample_tmj):
    await _square_map(client, sample_tmj)
    assert (await client.get(f"{URL}/m")).status_code == 404
    assert (await client.get(f"{URL}/nope")).status_code == 404
    assert (await client.delete(f"{URL}/m")).status_code == 404


async def test_delete_heights(client, sample_tmj, patch_maps_dir):
    await _square_map(client, sample_tmj)
    await client.put(f"{URL}/m", content=_body([5] * 30, [0] * 30), headers=_headers(6, 5))
    assert (await client.delete(f"{URL}/m")).status_code == 200
    assert not (patch_maps_dir.parent / "heights" / "m.tif").exists()
    assert (await client.get(f"{URL}/m")).status_code == 404


async def test_deleting_a_map_deletes_its_heights(client, sample_tmj, patch_maps_dir):
    await _square_map(client, sample_tmj)
    await client.put(f"{URL}/m", content=_body([5] * 30, [0] * 30), headers=_headers(6, 5))
    await client.delete("/api/world_sets/ws/maps/m")
    assert not (patch_maps_dir.parent / "heights" / "m.tif").exists()
    assert not (patch_maps_dir.parent / "heights" / "m.mask.png").exists()


async def test_mapset_export_includes_heights_uncompressed(client, sample_tmj):
    await _square_map(client, sample_tmj)
    await client.put(f"{URL}/m", content=_body([5] * 30, [0] * 30), headers=_headers(6, 5))
    package = (await client.get("/api/mapsets/ws")).content
    with zipfile.ZipFile(io.BytesIO(package)) as zf:
        assert zf.getinfo("ws/heights/m.tif").compress_type == zipfile.ZIP_STORED
        assert "ws/heights/m.mask.png" in zf.namelist()


async def test_map_import_brings_heights_under_the_new_name(client, sample_tmj, sample_world_set, patch_data_dir):
    heights_prop = {"name": "heights", "type": "file", "value": "../heights/m.tif"}
    await client.post("/api/world_sets/ws/maps/m", json={**sample_tmj, "properties": [heights_prop]})
    values = list(range(30))
    await client.put(f"{URL}/m", content=_body(values, [1] * 30), headers=_headers(6, 5))
    await client.post("/api/world_sets/other", json={**sample_world_set, "name": "other"})

    resp = await client.post("/api/world_sets/other/import_map",
                             json={"source": {"worldSet": "ws"}, "map": "m", "newName": "copy"})
    assert resp.status_code == 201
    got = await client.get("/api/world_sets/other/heights/copy")
    assert got.content == _body(values, [1] * 30)
    on_disk = json.loads((patch_data_dir / "other" / "maps" / "copy.tmj").read_text(encoding="utf-8"))
    assert {"name": "heights", "type": "file", "value": "../heights/copy.tif"} in on_disk["properties"]
    assert heights_prop not in on_disk["properties"]
