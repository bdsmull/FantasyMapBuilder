"""
Map scale presets and cell sizes (#9), so every saved map records its cell size in
meters (the ``metersPerUnit`` custom property) and readers outside the editor never
need this table.

@mirrors frontend/src/data/mapScales.ts (MAP_SCALES, resolveMetersPerUnit).
"""

from __future__ import annotations

from typing import Optional

_METERS_PER_FOOT = 0.3048
_FEET_PER_MILE = 5280

#: Scale preset id -> (meters per cell in metric, feet per cell in imperial)
SCALES: dict[str, tuple[float, float]] = {
    "room": (1, 2),
    "battle": (2, 5),
    "dungeon": (5, 10),
    "site": (10, 30),
    "town": (50, 150),
    "city": (250, _FEET_PER_MILE / 8),
    "local": (1e3, _FEET_PER_MILE),
    "province": (5e3, _FEET_PER_MILE * 6),
    "kingdom": (25e3, _FEET_PER_MILE * 30),
    "continent": (100e3, _FEET_PER_MILE * 100),
    "world": (500e3, _FEET_PER_MILE * 500),
}

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
    return preset[1] * _METERS_PER_FOOT if units == "imperial" else float(preset[0])


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
