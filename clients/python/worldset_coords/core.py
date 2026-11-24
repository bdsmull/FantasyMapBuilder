"""
World coordinates for Fantasy Map Builder world sets, read straight from the files.

World coordinates are meters, x east and y north of the world origin: the
``world-origin`` point object in the world's root map, or that map's centre. A world
whose root map wraps east-west repeats in x: positions are continuous, and lookups from
a world point accept any x. The algorithm is specified in docs/coordinates.md of the Fantasy Map Builder repository.

@mirrors frontend/src/utils/worldCoords.ts (and worldSurface.ts / worldSetUtils.ts /
hexGeometry.ts for the geometry it uses). The shared test suite in
clients/conformance checks that this and the other implementations agree.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

WORLD_ORIGIN_TYPE = "world-origin"
WORLD_SET_SUFFIX = ".worldset.json"

_METERS_PER_FOOT = 0.3048
_FEET_PER_MILE = 5280
_WHOLE_CELL_TOLERANCE = 1e-9
_MIN_WRAP_WIDTH = 4

#: Scale preset id -> (meters per cell in metric, feet per cell in imperial). Only
#: needed for map files without a ``metersPerUnit`` property (saved by older editors).
#: A copy of the editor's frontend/src/data/mapScales.json; the tests check they match.
SCALES: Dict[str, Tuple[float, float]] = {
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

Point = Tuple[float, float]


# ---------------------------------------------------------------------------
# One map: its grid geometry
# ---------------------------------------------------------------------------

def _trunc_half(n: float) -> int:
    """C++ integer halving (toward zero), as Tiled computes its hex parameters."""
    return int(n / 2)


class MapGeometry:
    """A map's grid: cell <-> pixel, and its cell space (one unit per cell, both axes)."""

    def __init__(self, data: dict) -> None:
        self.width = int(data["width"])
        self.height = int(data["height"])
        self.tilewidth = float(data["tilewidth"])
        self.tileheight = float(data["tileheight"])
        self.hexagonal = data.get("orientation") == "hexagonal"
        if self.hexagonal:
            self.stagger_x = (data.get("staggeraxis") or "x") == "x"
            self.stagger_even = data.get("staggerindex") == "even"
            side = int(data.get("hexsidelength") or 0)
            self.side_x = side if self.stagger_x else 0
            self.side_y = 0 if self.stagger_x else side
            self.offset_x = _trunc_half(self.tilewidth - self.side_x)
            self.offset_y = _trunc_half(self.tileheight - self.side_y)
            self.column_width = self.offset_x + self.side_x
            self.row_height = self.offset_y + self.side_y
            self.hex_width = self.column_width + self.offset_x
            self.hex_height = self.row_height + self.offset_y
            c00 = self.hex_centre(0, 0)
            self._ox, self._oy = c00
            self._px = (self.hex_centre(1, 0)[0] - c00[0]) or 1
            self._py = (self.hex_centre(0, 1)[1] - c00[1]) or 1
        else:
            self._px, self._py = self.tilewidth, self.tileheight
            self._ox, self._oy = self.tilewidth / 2, self.tileheight / 2

    # Hex layout (Tiled's HexagonalRenderer)
    def _staggered(self, i: int) -> bool:
        return ((i & 1) == 1) != self.stagger_even

    def _hex_top_left(self, col: int, row: int) -> Point:
        if self.stagger_x:
            return (col * self.column_width,
                    row * (self.hex_height + self.side_y) + (self.row_height if self._staggered(col) else 0))
        return (col * (self.hex_width + self.side_x) + (self.column_width if self._staggered(row) else 0),
                row * self.row_height)

    def hex_centre(self, col: int, row: int) -> Point:
        x, y = self._hex_top_left(col, row)
        return (x + self.hex_width / 2, y + self.hex_height / 2)

    # Cell space
    def pixel_to_cell_space(self, x: float, y: float) -> Point:
        return (0.5 + (x - self._ox) / self._px, 0.5 + (y - self._oy) / self._py)

    def cell_space_to_pixel(self, u: float, v: float) -> Point:
        return (self._ox + (u - 0.5) * self._px, self._oy + (v - 0.5) * self._py)

    def cell_centre(self, col: int, row: int) -> Point:
        """Centre of cell (col, row), in map pixels."""
        if self.hexagonal:
            return self.hex_centre(col, row)
        return self.cell_space_to_pixel(col + 0.5, row + 0.5)

    def pixel_size(self) -> Point:
        """The map's extent in pixels, from (0, 0)."""
        if not self.hexagonal:
            return (self.width * self.tilewidth, self.height * self.tileheight)
        if self.stagger_x:
            return (self.width * self.column_width + self.offset_x,
                    self.height * (self.hex_height + self.side_y) + (self.row_height if self.width > 1 else 0))
        return (self.width * (self.hex_width + self.side_x) + (self.column_width if self.height > 1 else 0),
                self.height * self.row_height + self.offset_y)

    def can_wrap(self) -> bool:
        """Whether the grid can meet itself east-west: flat-topped hexes need an even width."""
        return self.width >= _MIN_WRAP_WIDTH and not (self.hexagonal and self.stagger_x and self.width % 2)

    def pixel_to_cell(self, x: float, y: float, wrap: bool = False) -> Optional[Tuple[int, int]]:
        """
        The cell holding a pixel (hex: the nearest centre), or None off the map. With
        ``wrap`` the columns continue round the world.
        """
        u, v = self.pixel_to_cell_space(x, y)
        if not self.hexagonal:
            col, row = math.floor(u), math.floor(v)
            if wrap:
                col %= self.width
            return (col, row) if 0 <= col < self.width and 0 <= row < self.height else None
        best, best_d = None, math.inf
        for col in range(math.floor(u) - 1, math.floor(u) + 2):
            for row in range(math.floor(v) - 1, math.floor(v) + 2):
                if not 0 <= row < self.height or not (wrap or 0 <= col < self.width):
                    continue
                cx, cy = self.hex_centre(col, row)
                d = (cx - x) ** 2 + (cy - y) ** 2
                if d < best_d - 1e-9:
                    best, best_d = (col % self.width, row), d
        if best is None or math.sqrt(best_d) > max(self.hex_width, self.hex_height) / 2:
            return None
        return best


# ---------------------------------------------------------------------------
# Placement of a child map on its parent
# ---------------------------------------------------------------------------

def _ceil_cells(x: float) -> int:
    nearest = math.floor(x + 0.5)
    if abs(x - nearest) <= _WHOLE_CELL_TOLERANCE * max(1.0, abs(x)):
        return int(nearest)
    return math.ceil(x)


def child_top_left(child_w: int, child_h: int, child_mpu: float, parent_mpu: float,
                   anchor: dict, offset: Optional[dict]) -> Point:
    """Top-left of a child map's cell space, in its parent's cell space."""
    fp_cols = _ceil_cells((child_w * child_mpu) / parent_mpu)
    fp_rows = _ceil_cells((child_h * child_mpu) / parent_mpu)
    col, row = int(anchor["col"]), int(anchor["row"])
    col_min, col_max = col - fp_cols // 2, col + (fp_cols - 1) // 2
    row_min, row_max = row - fp_rows // 2, row + (fp_rows - 1) // 2
    width = (child_w * child_mpu) / parent_mpu
    height = (child_h * child_mpu) / parent_mpu
    cu = (col_min + col_max + 1) / 2 + float((offset or {}).get("x") or 0)
    cv = (row_min + row_max + 1) / 2 + float((offset or {}).get("y") or 0)
    return (cu - width / 2, cv - height / 2)


# ---------------------------------------------------------------------------
# World set
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MapFrame:
    """Where a placed map sits in its world: enough to convert any of its points."""
    name: str
    root: str
    meters_per_cell: float
    #: The map's cell-space origin, meters east / south of the root's cell-space origin
    bx: float
    by: float
    #: The world origin, the same way
    ox: float
    oy: float
    #: Meters once round the world when its root map wraps east-west, else None
    circumference: Optional[float] = None


@dataclass(frozen=True)
class MapAtPoint:
    """A map covering a world point, and where the point is on it (pixels)."""
    name: str
    z: int
    meters_per_cell: float
    pixel: Point


def wrap_delta(start: float, end: float, circumference: Optional[float]) -> float:
    """
    Meters east from one world x to another, the short way round a world that wraps
    (negative: west): at least minus half the circumference, less than half of it.
    """
    d = end - start
    return d - circumference * math.floor(d / circumference + 0.5) if circumference else d


def _prop(data: dict, name: str):
    for p in data.get("properties") or []:
        if isinstance(p, dict) and p.get("name") == name:
            return p.get("value")
    return data.get(name)


class WorldSet:
    """
    A world set folder (``<name>.worldset.json`` plus ``maps/*.tmj``). Maps are read
    when first needed. Coordinates are meters, x east and y north of the world origin.
    """

    def __init__(self, folder: Path, data: dict) -> None:
        self.folder = folder
        self.data = data
        self.name: str = data.get("name") or folder.name
        units = data.get("units")
        self.units: str = units if units in ("metric", "imperial") else "metric"
        self.nodes: List[dict] = [n for n in data.get("nodes") or [] if isinstance(n, dict)]
        self._by_name = {n.get("mapName"): n for n in self.nodes}
        self._maps: Dict[str, Optional[dict]] = {}
        self._geometry: Dict[str, MapGeometry] = {}

    @classmethod
    def load(cls, path: Union[str, Path]) -> "WorldSet":
        """Open a world set from its folder or its ``.worldset.json`` file."""
        path = Path(path)
        if path.is_dir():
            files = sorted(path.glob(f"*{WORLD_SET_SUFFIX}"))
            if not files:
                raise FileNotFoundError(f"No {WORLD_SET_SUFFIX} file in {path}")
            path = files[0]
        return cls(path.parent, json.loads(path.read_text(encoding="utf-8")))

    # Maps
    def map_data(self, name: str) -> Optional[dict]:
        """A map's TMJ JSON, or None if there's no such file."""
        if name not in self._maps:
            path = self.folder / "maps" / f"{name}.tmj"
            self._maps[name] = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
        return self._maps[name]

    def geometry(self, name: str) -> Optional[MapGeometry]:
        if name not in self._geometry:
            data = self.map_data(name)
            if data is None:
                return None
            self._geometry[name] = MapGeometry(data)
        return self._geometry[name]

    def cell_size(self, name: str) -> Optional[float]:
        """A map's cell size in meters: its ``metersPerUnit``, else its scale preset."""
        data = self.map_data(name)
        if data is None:
            return None
        mpu = _prop(data, "metersPerUnit")
        if isinstance(mpu, (int, float)) and not isinstance(mpu, bool) and math.isfinite(mpu) and mpu > 0:
            return float(mpu)
        scale = _prop(data, "scale")
        preset = SCALES.get(scale) if isinstance(scale, str) else None
        if preset is None:
            return None
        units = _prop(data, "units")
        if units not in ("metric", "imperial"):
            units = self.units
        return preset[1] * _METERS_PER_FOOT if units == "imperial" else float(preset[0])

    @property
    def roots(self) -> List[str]:
        """Maps with no parent: each is the root of its own world (frame of coordinates)."""
        return [n["mapName"] for n in self.nodes if n.get("parentMapName") is None]

    def origin_pixel(self, name: str) -> Optional[Point]:
        """A map's world origin in its pixels: its ``world-origin`` point object, else its centre."""
        data, geo = self.map_data(name), self.geometry(name)
        if data is None or geo is None:
            return None
        for layer in data.get("layers") or []:
            if not isinstance(layer, dict) or layer.get("type") != "objectgroup":
                continue
            for obj in layer.get("objects") or []:
                if isinstance(obj, dict) and obj.get("type", obj.get("class")) == WORLD_ORIGIN_TYPE:
                    return (float(obj.get("x", 0)), float(obj.get("y", 0)))
        return geo.cell_space_to_pixel(geo.width / 2, geo.height / 2)

    # Frames
    def frame(self, name: str) -> Optional[MapFrame]:
        """Where a placed map sits in its world; None if it isn't placed (or can't be)."""
        node = self._by_name.get(name)
        geo, mpu = self.geometry(name), self.cell_size(name)
        if node is None or geo is None or mpu is None:
            return None
        bx = by = 0.0
        child_geo, child_mpu = geo, mpu
        seen = {name}
        while node.get("parentMapName") is not None:
            parent = node["parentMapName"]
            parent_node = self._by_name.get(parent)
            parent_geo, parent_mpu = self.geometry(parent), self.cell_size(parent)
            if (not node.get("parentAnchor") or parent_node is None or parent_geo is None
                    or parent_mpu is None or parent in seen):
                return None
            seen.add(parent)
            left, top = child_top_left(child_geo.width, child_geo.height, child_mpu, parent_mpu,
                                       node["parentAnchor"], node.get("parentOffset"))
            bx += left * parent_mpu
            by += top * parent_mpu
            child_geo, child_mpu, node = parent_geo, parent_mpu, parent_node
        root = node["mapName"]
        ou, ov = child_geo.pixel_to_cell_space(*self.origin_pixel(root))
        return MapFrame(name, root, mpu, bx, by, ou * child_mpu, ov * child_mpu, self.world_width(root))

    def world_width(self, root: str) -> Optional[float]:
        """Meters once round the world of a root map that wraps east-west, else None."""
        data, geo, mpu = self.map_data(root), self.geometry(root), self.cell_size(root)
        if data is None or geo is None or mpu is None:
            return None
        return geo.width * mpu if _prop(data, "wrapX") is True and geo.can_wrap() else None

    def wrap_delta(self, root: str, start: float, end: float) -> float:
        """Meters east from world x ``start`` to ``end``, the short way round (negative: west)."""
        return wrap_delta(start, end, self.world_width(root))

    def _nearest_turn(self, f: MapFrame, x: float) -> float:
        """On a wrapped world, the same place's x on the turn nearest the middle of the map."""
        if not f.circumference:
            return x
        r = self.world_rect(f.name)
        assert r is not None
        middle = (r["west"] + r["east"]) / 2
        return middle + wrap_delta(middle, x, f.circumference)

    # Conversions
    def pixel_to_world(self, name: str, x: float, y: float) -> Optional[Point]:
        """A map pixel -> world meters (x east, y north)."""
        f, geo = self.frame(name), self.geometry(name)
        if f is None or geo is None:
            return None
        u, v = geo.pixel_to_cell_space(x, y)
        return (f.bx + u * f.meters_per_cell - f.ox, f.oy - (f.by + v * f.meters_per_cell))

    def cell_to_world(self, name: str, col: int, row: int) -> Optional[Point]:
        """The centre of a map cell -> world meters."""
        geo = self.geometry(name)
        return None if geo is None else self.pixel_to_world(name, *geo.cell_centre(col, row))

    def world_to_pixel(self, name: str, x: float, y: float) -> Optional[Point]:
        """
        World meters -> a map pixel (which may lie off the map). On a wrapped world any x
        does; the pixel is the one nearest the middle of the map.
        """
        f, geo = self.frame(name), self.geometry(name)
        if f is None or geo is None:
            return None
        u = (self._nearest_turn(f, x) + f.ox - f.bx) / f.meters_per_cell
        v = (f.oy - y - f.by) / f.meters_per_cell
        return geo.cell_space_to_pixel(u, v)

    def world_to_cell(self, name: str, x: float, y: float) -> Optional[Tuple[int, int]]:
        """World meters -> the map cell there, or None when it's off the map."""
        f, p, geo = self.frame(name), self.world_to_pixel(name, x, y), self.geometry(name)
        if f is None or p is None or geo is None:
            return None
        return geo.pixel_to_cell(*p, wrap=f.circumference is not None and f.name == f.root)

    def world_rect(self, name: str) -> Optional[Dict[str, float]]:
        """A map's extent in world meters: west, east, south, north."""
        geo = self.geometry(name)
        a = self.pixel_to_world(name, 0, 0)
        if geo is None or a is None:
            return None
        b = self.pixel_to_world(name, *geo.pixel_size())
        assert b is not None
        return {"west": min(a[0], b[0]), "east": max(a[0], b[0]), "south": min(a[1], b[1]), "north": max(a[1], b[1])}

    def maps_at(self, root: str, x: float, y: float) -> List[MapAtPoint]:
        """
        Maps of ``root``'s world covering world point (x, y): most detailed (smallest cells)
        first; among equals, ground level (Z = 0) before other levels, then by name.
        """
        found = []
        for node in self.nodes:
            name = node.get("mapName")
            f = self.frame(name)
            if f is None or f.root != root:
                continue
            r = self.world_rect(name)
            if r is None or not (r["west"] <= self._nearest_turn(f, x) <= r["east"] and r["south"] <= y <= r["north"]):
                continue
            pixel = self.world_to_pixel(name, x, y)
            assert pixel is not None
            found.append(MapAtPoint(name, int(node.get("z") or 0), f.meters_per_cell, pixel))
        found.sort(key=lambda m: (m.meters_per_cell, m.z != 0, m.name))
        return found
