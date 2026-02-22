"""
HexMap model.

Represents a large-scale world map using a hexagonal grid.

Coordinate system
-----------------
Internally we use *offset coordinates* (col, row) for storage — this maps
directly to a 2-D array and is what Tiled exports.  For algorithmic work
(neighbours, distance, line-of-sight) we convert to *axial coordinates*
(q, r) on the fly using the helpers below.

Orientation
-----------
We default to "flat-top" hexes (pointy-top is also supported via the enum).
Tiled uses stagger_axis / stagger_index to describe the same concept.

  Flat-top  → stagger_axis = "x", stagger_index = "odd"
  Pointy-top → stagger_axis = "y", stagger_index = "odd"

Hex size
--------
`hex_size` is the distance from the centre of a hex to the middle of any
flat edge (the *apothem* for flat-top, or equivalently the circumradius for
pointy-top).  Pixel width/height are derived from this value.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional

from map_editor.models.layer import Layer, ObjectLayer, TileLayer
from map_editor.models.tileset import Tileset, make_default_hex_tileset


class HexOrientation(Enum):
    FLAT_TOP = auto()    # Flat edge on top/bottom; pointy corners left/right
    POINTY_TOP = auto()  # Pointy corners top/bottom; flat edges left/right


@dataclass
class HexMap:
    """
    A hexagonal-grid world map.

    Attributes:
        name:         Display name / file name stem.
        cols:         Number of hex columns.
        rows:         Number of hex rows.
        hex_size:     Circumradius of each hex in pixels (centre → corner).
        orientation:  Flat-top or pointy-top hex orientation.
        tilesets:     Ordered list of Tilesets used by this map.
        layers:       Ordered list of Layers (bottom → top).
        source_path:  File path this map was loaded from / last saved to.
    """

    name: str
    cols: int
    rows: int
    hex_size: float = 40.0
    orientation: HexOrientation = HexOrientation.FLAT_TOP
    tilesets: list[Tileset] = field(default_factory=list)
    layers: list[Layer] = field(default_factory=list)
    source_path: str = ""

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def create_new(
        cls,
        name: str,
        cols: int,
        rows: int,
        hex_size: float = 40.0,
        orientation: HexOrientation = HexOrientation.FLAT_TOP,
        placeholder_dir=None,
    ) -> "HexMap":
        """Create a blank HexMap with one terrain layer and one object layer."""
        tileset = make_default_hex_tileset(output_dir=placeholder_dir)

        terrain_layer = TileLayer(name="Terrain", width=cols, height=rows)
        object_layer = ObjectLayer(name="Locations")

        return cls(
            name=name,
            cols=cols,
            rows=rows,
            hex_size=hex_size,
            orientation=orientation,
            tilesets=[tileset],
            layers=[terrain_layer, object_layer],
        )

    # ------------------------------------------------------------------
    # Geometry helpers — pixel ↔ offset coord conversion
    # ------------------------------------------------------------------

    def hex_pixel_size(self) -> tuple[float, float]:
        """Return (width, height) of a single hex in pixels."""
        s = self.hex_size
        if self.orientation == HexOrientation.FLAT_TOP:
            return (2 * s, math.sqrt(3) * s)
        else:  # POINTY_TOP
            return (math.sqrt(3) * s, 2 * s)

    def hex_center(self, col: int, row: int) -> tuple[float, float]:
        """
        Return the pixel (cx, cy) of the centre of hex at offset (col, row).

        Flat-top stagger: odd columns are shifted down by half a hex height.
        Pointy-top stagger: odd rows are shifted right by half a hex width.
        """
        s = self.hex_size
        if self.orientation == HexOrientation.FLAT_TOP:
            w = 2 * s
            h = math.sqrt(3) * s
            cx = col * (w * 3 / 4) + s
            cy = row * h + (h / 2 if col % 2 == 1 else 0) + h / 2
        else:  # POINTY_TOP
            w = math.sqrt(3) * s
            h = 2 * s
            cx = col * w + (w / 2 if row % 2 == 1 else 0) + w / 2
            cy = row * (h * 3 / 4) + s
        return cx, cy

    def hex_corners(self, col: int, row: int) -> list[tuple[float, float]]:
        """Return the 6 corner pixel positions of hex (col, row)."""
        cx, cy = self.hex_center(col, row)
        s = self.hex_size
        corners = []
        if self.orientation == HexOrientation.FLAT_TOP:
            for i in range(6):
                angle = math.radians(60 * i)
                corners.append((cx + s * math.cos(angle), cy + s * math.sin(angle)))
        else:
            for i in range(6):
                angle = math.radians(60 * i + 30)
                corners.append((cx + s * math.cos(angle), cy + s * math.sin(angle)))
        return corners

    def pixel_to_hex(self, px: float, py: float) -> Optional[tuple[int, int]]:
        """
        Convert a pixel position to an offset (col, row), or None if outside
        the map bounds.  Uses axial round then converts back to offset coords.
        """
        q, r = self._pixel_to_axial(px, py)
        col, row = self._axial_to_offset(q, r)
        if self.in_bounds(col, row):
            return col, row
        return None

    # ------------------------------------------------------------------
    # Axial coordinate helpers (internal use / algorithms)
    # ------------------------------------------------------------------

    def _pixel_to_axial(self, px: float, py: float) -> tuple[int, int]:
        """Convert pixel to axial (q, r) coordinates, rounded to nearest hex.

        The standard axial formulas assume the centre of axial (0, 0) sits at
        pixel (0, 0).  Our hex_center(0, 0) places that hex at (s, h/2) for
        flat-top and (w/2, s) for pointy-top, so we shift the pixel by that
        origin offset before applying the formula.
        """
        s = self.hex_size
        if self.orientation == HexOrientation.FLAT_TOP:
            h = math.sqrt(3) * s
            x = px - s        # origin offset: hex_center(0, 0).x = s
            y = py - h / 2    # origin offset: hex_center(0, 0).y = h/2
            q = (2 / 3 * x) / s
            r = (-1 / 3 * x + math.sqrt(3) / 3 * y) / s
        else:  # POINTY_TOP
            w = math.sqrt(3) * s
            x = px - w / 2   # origin offset: hex_center(0, 0).x = w/2
            y = py - s        # origin offset: hex_center(0, 0).y = s
            q = (math.sqrt(3) / 3 * x - 1 / 3 * y) / s
            r = (2 / 3 * y) / s
        return self._axial_round(q, r)

    @staticmethod
    def _axial_round(q: float, r: float) -> tuple[int, int]:
        """Round fractional axial coords to the nearest hex using cube rounding."""
        s = -q - r
        rq, rr, rs = round(q), round(r), round(s)
        dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
        if dq > dr and dq > ds:
            rq = -rr - rs
        elif dr > ds:
            rr = -rq - rs
        return rq, rr

    def _axial_to_offset(self, q: int, r: int) -> tuple[int, int]:
        """Convert axial (q, r) to offset (col, row) for this orientation."""
        if self.orientation == HexOrientation.FLAT_TOP:
            col = q
            row = r + (q - (q & 1)) // 2
        else:
            col = q + (r - (r & 1)) // 2
            row = r
        return col, row

    def _offset_to_axial(self, col: int, row: int) -> tuple[int, int]:
        """Convert offset (col, row) to axial (q, r)."""
        if self.orientation == HexOrientation.FLAT_TOP:
            q = col
            r = row - (col - (col & 1)) // 2
        else:
            q = col - (row - (row & 1)) // 2
            r = row
        return q, r

    def axial_neighbors(self, col: int, row: int) -> list[tuple[int, int]]:
        """Return up to 6 in-bounds neighbouring (col, row) offsets."""
        q, r = self._offset_to_axial(col, row)
        axial_dirs = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
        neighbors = []
        for dq, dr in axial_dirs:
            nc, nr = self._axial_to_offset(q + dq, r + dr)
            if self.in_bounds(nc, nr):
                neighbors.append((nc, nr))
        return neighbors

    def axial_distance(self, col1: int, row1: int, col2: int, row2: int) -> int:
        """Return the hex grid distance between two offset positions."""
        q1, r1 = self._offset_to_axial(col1, row1)
        q2, r2 = self._offset_to_axial(col2, row2)
        return (abs(q1 - q2) + abs(q1 + r1 - q2 - r2) + abs(r1 - r2)) // 2

    # ------------------------------------------------------------------
    # Tileset helpers (mirrors TileMap)
    # ------------------------------------------------------------------

    def primary_tileset(self) -> Optional[Tileset]:
        return self.tilesets[0] if self.tilesets else None

    def add_tileset(self, tileset: Tileset) -> None:
        if self.tilesets:
            last = self.tilesets[-1]
            tileset.first_gid = last.first_gid + last.count
        else:
            tileset.first_gid = 1
        self.tilesets.append(tileset)

    def tileset_for_gid(self, gid: int) -> Optional[Tileset]:
        for ts in reversed(self.tilesets):
            if gid >= ts.first_gid:
                return ts
        return None

    def local_id(self, gid: int) -> int:
        ts = self.tileset_for_gid(gid)
        return gid - ts.first_gid + 1 if ts else gid

    # ------------------------------------------------------------------
    # Layer helpers
    # ------------------------------------------------------------------

    def tile_layers(self) -> list[TileLayer]:
        return [l for l in self.layers if isinstance(l, TileLayer)]

    def object_layers(self) -> list[ObjectLayer]:
        return [l for l in self.layers if isinstance(l, ObjectLayer)]

    def layer_by_name(self, name: str) -> Optional[Layer]:
        for l in self.layers:
            if l.name == name:
                return l
        return None

    def add_tile_layer(self, name: str, insert_above: Optional[Layer] = None) -> TileLayer:
        layer = TileLayer(name=name, width=self.cols, height=self.rows)
        self._insert_layer(layer, insert_above)
        return layer

    def add_object_layer(self, name: str, insert_above: Optional[Layer] = None) -> ObjectLayer:
        layer = ObjectLayer(name=name)
        self._insert_layer(layer, insert_above)
        return layer

    def remove_layer(self, layer: Layer) -> bool:
        try:
            self.layers.remove(layer)
            return True
        except ValueError:
            return False

    def move_layer_up(self, layer: Layer) -> bool:
        idx = self._layer_index(layer)
        if idx is None or idx >= len(self.layers) - 1:
            return False
        self.layers[idx], self.layers[idx + 1] = self.layers[idx + 1], self.layers[idx]
        return True

    def move_layer_down(self, layer: Layer) -> bool:
        idx = self._layer_index(layer)
        if idx is None or idx == 0:
            return False
        self.layers[idx], self.layers[idx - 1] = self.layers[idx - 1], self.layers[idx]
        return True

    def _layer_index(self, layer: Layer) -> Optional[int]:
        try:
            return self.layers.index(layer)
        except ValueError:
            return None

    def _insert_layer(self, layer: Layer, above: Optional[Layer]) -> None:
        if above is None:
            self.layers.append(layer)
        else:
            idx = self._layer_index(above)
            if idx is None:
                self.layers.append(layer)
            else:
                self.layers.insert(idx + 1, layer)

    # ------------------------------------------------------------------
    # Bounds
    # ------------------------------------------------------------------

    def in_bounds(self, col: int, row: int) -> bool:
        return 0 <= col < self.cols and 0 <= row < self.rows

    # ------------------------------------------------------------------
    # Display geometry
    # ------------------------------------------------------------------

    @property
    def pixel_width(self) -> float:
        w, h = self.hex_pixel_size()
        if self.orientation == HexOrientation.FLAT_TOP:
            return self.cols * (w * 3 / 4) + w / 4
        else:
            return self.cols * w + w / 2

    @property
    def pixel_height(self) -> float:
        w, h = self.hex_pixel_size()
        if self.orientation == HexOrientation.FLAT_TOP:
            return self.rows * h + h / 2
        else:
            return self.rows * (h * 3 / 4) + h / 4

    # ------------------------------------------------------------------
    # Tiled TMJ metadata
    # ------------------------------------------------------------------

    @property
    def tiled_stagger_axis(self) -> str:
        return "x" if self.orientation == HexOrientation.FLAT_TOP else "y"

    @property
    def tiled_stagger_index(self) -> str:
        return "odd"

    @property
    def tiled_hex_side_length(self) -> int:
        """
        Tiled's hexsidelength = the flat-edge length of a hex.
        For a regular hex with circumradius s, the flat-edge length = s.
        """
        return int(self.hex_size)

    def __repr__(self) -> str:
        return (
            f"HexMap(name={self.name!r}, size={self.cols}x{self.rows}, "
            f"hex_size={self.hex_size}, orientation={self.orientation.name}, "
            f"layers={len(self.layers)})"
        )
