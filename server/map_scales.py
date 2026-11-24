"""
Map scale presets and cell sizes (#9), so every saved map records its cell size in
meters (the ``metersPerUnit`` custom property) and readers outside the editor never
need the scale table.

The presets are the editor's own table, frontend/src/data/mapScales.json, read once at
startup. @mirrors frontend/src/data/mapScales.ts (resolveMetersPerUnit).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

SCALES_FILE = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "mapScales.json"

_METERS_PER_FOOT = 0.3048


def load_scales() -> dict[str, tuple[float, float]]:
    """Scale preset id -> (meters per cell in metric, feet per cell in imperial)."""
    return {
        s["id"]: (float(s["metric"]["metersPerUnit"]), float(s["imperial"]["feetPerUnit"]))
        for s in json.loads(SCALES_FILE.read_text(encoding="utf-8"))
    }


SCALES = load_scales()

CELL_SIZE_PROPERTY = "metersPerUnit"


def _prop(map_data: dict, name: str):
    for p in map_data.get("properties") or []:
        if isinstance(p, dict) and p.get("name") == name:
            return p.get("value")
    return map_data.get(name)


def preset_meters(scale: str, units: str) -> Optional[float]:
    """Cell size of a scale preset in meters for a unit system, or None if unknown."""
    preset = SCALES.get(scale)
    if preset is None:
        return None
    return preset[1] * _METERS_PER_FOOT if units == "imperial" else preset[0]


def has_own_units(map_data: dict) -> bool:
    """Whether the map sets its own unit system (rather than inheriting the world set's)."""
    return _prop(map_data, "units") in ("metric", "imperial")


def stamp_cell_size(map_data: dict, world_set_units: Optional[str]) -> dict:
    """
    The map with its ``metersPerUnit`` property set from its scale preset (sized by the
    map's own units, else the world set's, else metric). Maps without a known preset keep
    whatever cell size they have.
    """
    scale = _prop(map_data, "scale")
    units = _prop(map_data, "units")
    if units not in ("metric", "imperial"):
        units = world_set_units if world_set_units in ("metric", "imperial") else "metric"
    meters = preset_meters(scale, units) if isinstance(scale, str) else None
    if meters is None:
        return map_data
    props = [p for p in (map_data.get("properties") or []) if not (isinstance(p, dict) and p.get("name") == CELL_SIZE_PROPERTY)]
    props.append({"name": CELL_SIZE_PROPERTY, "type": "float", "value": meters})
    result = {**map_data, "properties": props}
    result.pop(CELL_SIZE_PROPERTY, None)  # the legacy top-level field
    return result
