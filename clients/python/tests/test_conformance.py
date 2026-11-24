"""
The Python world-coordinate library against the shared test suite
(clients/conformance/expected.json, written by the editor's reference implementation).
"""
import json
from pathlib import Path

import pytest

from worldset_coords import SCALES, WorldSet

CONFORMANCE = Path(__file__).resolve().parents[2] / "conformance"
SHARED_SCALES = Path(__file__).resolve().parents[3] / "frontend" / "src" / "data" / "mapScales.json"
EXPECTED = json.loads((CONFORMANCE / "expected.json").read_text(encoding="utf-8"))
TOL = 1e-6


@pytest.fixture(scope="module")
def ws() -> WorldSet:
    return WorldSet.load(CONFORMANCE / "Conformance")


def _close(got, want):
    assert got is not None
    assert got[0] == pytest.approx(want[0], abs=TOL)
    assert got[1] == pytest.approx(want[1], abs=TOL)


def test_load_from_file_or_folder(ws):
    assert ws.name == "Conformance"
    assert WorldSet.load(CONFORMANCE / "Conformance" / "Conformance.worldset.json").roots == ws.roots


def test_cell_sizes(ws):
    for name, size in EXPECTED["cellSizes"].items():
        if size is None:
            assert ws.cell_size(name) is None
        else:
            assert ws.cell_size(name) == pytest.approx(size, rel=1e-12)


def test_embedded_scale_table_matches_the_editors():
    """
    The library embeds the scale table (it must work outside this repository). The editor
    and its server share one file; this fails if the copy here drifts from it.
    """
    shared = {
        s["id"]: (s["metric"]["metersPerUnit"], s["imperial"]["feetPerUnit"])
        for s in json.loads(SHARED_SCALES.read_text(encoding="utf-8"))
    }
    assert shared, "the shared scale table is empty"
    assert {k: tuple(v) for k, v in SCALES.items()} == shared

    # And through the library's own code, with its unit conversion
    blank = {"orientation": "orthogonal", "width": 1, "height": 1, "tilewidth": 32, "tileheight": 32}
    for units in ("metric", "imperial"):
        ws = WorldSet(CONFORMANCE, {"name": "scales", "units": units, "nodes": []})
        for scale, (meters, feet) in shared.items():
            ws._maps[scale] = {**blank, "properties": [{"name": "scale", "type": "string", "value": scale}]}
            want = meters if units == "metric" else feet * 0.3048
            assert ws.cell_size(scale) == pytest.approx(want, rel=1e-12), (scale, units)


def test_roots(ws):
    assert ws.roots == EXPECTED["roots"]


def test_frames_and_rects(ws):
    for name, want in EXPECTED["frames"].items():
        frame = ws.frame(name)
        if want is None:
            assert frame is None, name
            continue
        assert frame is not None and frame.root == want["root"], name
        rect = ws.world_rect(name)
        for side, value in want["rect"].items():
            assert rect[side] == pytest.approx(value, abs=TOL), (name, side)


def test_pixel_to_world(ws):
    for case in EXPECTED["pixelToWorld"]:
        _close(ws.pixel_to_world(case["map"], *case["pixel"]), case["world"])


def test_cell_to_world(ws):
    for case in EXPECTED["cellToWorld"]:
        _close(ws.cell_to_world(case["map"], *case["cell"]), case["world"])


def test_world_to_pixel(ws):
    for case in EXPECTED["worldToPixel"]:
        _close(ws.world_to_pixel(case["map"], *case["world"]), case["pixel"])


def test_world_to_cell(ws):
    for case in EXPECTED["worldToCell"]:
        got = ws.world_to_cell(case["map"], *case["world"])
        assert (list(got) if got else None) == case["cell"], case


def test_maps_at(ws):
    for case in EXPECTED["mapsAt"]:
        got = ws.maps_at(case["root"], *case["world"])
        assert [(m.name, m.z) for m in got] == [(m["name"], m["z"]) for m in case["maps"]], case
        for m, want in zip(got, case["maps"]):
            _close(m.pixel, want["pixel"])


def test_unplaced_and_unknown_maps(ws):
    assert ws.pixel_to_world("loose", 0, 0) is None
    assert ws.frame("no-such-map") is None
    assert ws.maps_at("world", 1e12, 0) == []
