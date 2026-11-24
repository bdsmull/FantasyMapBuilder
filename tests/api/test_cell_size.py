"""
Every saved map records its cell size in meters (#9): the ``metersPerUnit`` custom
property, from its scale preset and units (its own, else the world set's).
"""
import json
import re

import pytest

from server.map_scales import SCALES, SCALES_FILE, preset_meters, stamp_cell_size

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


async def test_the_server_uses_the_editors_scale_table():
    table = json.loads(SCALES_FILE.read_text(encoding="utf-8"))
    assert SCALES and set(SCALES) == {s["id"] for s in table}
    for s in table:
        assert preset_meters(s["id"], "metric") == s["metric"]["metersPerUnit"]
        assert preset_meters(s["id"], "imperial") == pytest.approx(s["imperial"]["feetPerUnit"] * 0.3048)


async def test_the_documented_scale_table_matches():
    """docs/world-coordinates.md is what other implementations copy the table from."""
    page = (SCALES_FILE.parents[3] / "docs" / "world-coordinates.md").read_text(encoding="utf-8")
    rows = re.findall(r"^\| `(\w+)` \| ([\d,]+) \| ([\d,]+) \|$", page, re.MULTILINE)
    documented = {name: (float(m.replace(",", "")), float(ft.replace(",", ""))) for name, m, ft in rows}
    assert documented == SCALES


async def test_stamping_helpers():
    assert preset_meters("world", "metric") == 500e3
    assert preset_meters("nope", "metric") is None
    legacy = {"scale": "room", "metersPerUnit": 9}
    stamped = stamp_cell_size(legacy, None)
    assert "metersPerUnit" not in stamped
    assert stamped["properties"] == [{"name": "metersPerUnit", "type": "float", "value": 1.0}]
