"""
World coordinates for Fantasy Map Builder world sets (meters, x east, y north).

    from worldset_coords import WorldSet

    ws = WorldSet.load("world_sets/Brakka")
    ws.cell_to_world("nauram-town", 12, 7)      # (x, y) meters
    ws.world_to_cell("nauram-town", x, y)       # (col, row) or None
    ws.maps_at(ws.roots[0], x, y)               # most detailed map first

See docs/coordinates.md in the Fantasy Map Builder repository for the algorithm.
"""

from .core import (
    SCALES,
    WORLD_ORIGIN_TYPE,
    MapAtPoint,
    MapFrame,
    MapGeometry,
    WorldSet,
    child_top_left,
)

__all__ = [
    "SCALES",
    "WORLD_ORIGIN_TYPE",
    "MapAtPoint",
    "MapFrame",
    "MapGeometry",
    "WorldSet",
    "child_top_left",
]

__version__ = "0.1.0"
