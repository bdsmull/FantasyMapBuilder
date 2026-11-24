"""
Every saved map records its cell size in meters (#9): the ``metersPerUnit`` custom
property, from its scale preset and units (its own, else the world set's).
"""
import json

import pytest

from server.map_scales import preset_meters, stamp_cell_size

pytestmark = pytest.mark.asyncio


def _props(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return {p["name"]: p["value"] for p in data.get("properties", [])}


def _with(sample_tmj, **props):
    kinds = {"metersPerUnit": "float"}
    return {**sample_tmj, "properties": [{"name": k, "type": kinds.get(k, "string"), "value": v} for k, v in props.items()]}


async def test_save_records_the_preset_cell_size(client, sample_tmj, patch_maps_dir):
    await client.post("/api/world_sets/ws/maps/m", json=_with(sample_tmj, scale="kingdom"))
    assert _props(patch_maps_dir / "m.tmj")["metersPerUnit"] == 25000


async def test_imperial_units_and_a_stale_value(client, sample_tmj, patch_maps_dir):
    await client.post("/api/world_sets/ws/maps/m", json=_with(sample_tmj, scale="city", units="imperial", metersPerUnit=250.0))
    props = _props(patch_maps_dir / "m.tmj")
    assert props["metersPerUnit"] == pytest.approx(660 * 0.3048)
    assert list(props).count("metersPerUnit") == 1


async def test_custom_cell_sizes_and_unscaled_maps_are_kept(client, sample_tmj, patch_maps_dir):
    await client.post("/api/world_sets/ws/maps/a", json=_with(sample_tmj, metersPerUnit=750.0))
    assert _props(patch_maps_dir / "a.tmj") == {"metersPerUnit": 750.0}
    await client.post("/api/world_sets/ws/maps/b", json=sample_tmj)
    assert "properties" not in json.loads((patch_maps_dir / "b.tmj").read_text(encoding="utf-8"))


async def test_world_set_units_change_restamps_inheriting_maps(client, sample_tmj, patch_maps_dir):
    await client.post("/api/world_sets/ws/maps/inherits", json=_with(sample_tmj, scale="site"))
    await client.post("/api/world_sets/ws/maps/own", json=_with(sample_tmj, scale="site", units="metric"))
    assert _props(patch_maps_dir / "inherits.tmj")["metersPerUnit"] == 10

    resp = await client.post("/api/world_sets/ws", json={"name": "ws", "version": "1.0", "units": "imperial", "nodes": []})
    assert resp.json() == {"saved": "ws", "restamped": ["inherits"]}
    assert _props(patch_maps_dir / "inherits.tmj")["metersPerUnit"] == pytest.approx(30 * 0.3048)
    assert _props(patch_maps_dir / "own.tmj")["metersPerUnit"] == 10

    # Saving again with the same units rewrites nothing
    resp = await client.post("/api/world_sets/ws", json={"name": "ws", "version": "1.0", "units": "imperial", "nodes": []})
    assert resp.json() == {"saved": "ws"}


async def test_stamping_helpers():
    assert preset_meters("world", "metric") == 500e3
    assert preset_meters("nope", "metric") is None
    legacy = {"scale": "room", "metersPerUnit": 9}
    stamped = stamp_cell_size(legacy, None)
    assert "metersPerUnit" not in stamped
    assert stamped["properties"] == [{"name": "metersPerUnit", "type": "float", "value": 1.0}]
