"""
Layer models.

A map is composed of stacked layers, each of which is either:

  TileLayer   — a 2-D grid of integer tile IDs (0 = empty, ≥1 = tile)
  ObjectLayer — an unordered collection of MapObjects

Both types share common display properties (name, visible, opacity).
This closely mirrors the Tiled map editor layer model for easy TMJ I/O.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional

from map_editor.models.map_object import MapObject


class LayerType(Enum):
    TILE = auto()
    OBJECT = auto()


# ---------------------------------------------------------------------------
# TileLayer
# ---------------------------------------------------------------------------

@dataclass
class TileLayer:
    """
    A 2-D grid of tile IDs stored in row-major order.

    data[row][col] == 0  →  empty cell
    data[row][col] >= 1  →  tile ID within the map's tileset
    """

    name: str
    width: int
    height: int
    visible: bool = True
    opacity: float = 1.0          # 0.0 (transparent) – 1.0 (opaque)
    offset_x: int = 0             # Pixel offset (Tiled compatibility)
    offset_y: int = 0
    layer_type: LayerType = field(default=LayerType.TILE, init=False)

    # 2-D grid: list of rows, each row is a list of int tile IDs
    data: list[list[int]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.data:
            self.data = [[0] * self.width for _ in range(self.height)]

    # ------------------------------------------------------------------
    # Tile access
    # ------------------------------------------------------------------

    def get_tile(self, col: int, row: int) -> int:
        """Return tile ID at (col, row). Returns 0 for out-of-bounds."""
        if 0 <= row < self.height and 0 <= col < self.width:
            return self.data[row][col]
        return 0

    def set_tile(self, col: int, row: int, tile_id: int) -> bool:
        """
        Set tile ID at (col, row). Returns True on success, False if
        the position is out-of-bounds.
        """
        if 0 <= row < self.height and 0 <= col < self.width:
            self.data[row][col] = tile_id
            return True
        return False

    def clear(self) -> None:
        """Set every cell to 0 (empty)."""
        for row in range(self.height):
            for col in range(self.width):
                self.data[row][col] = 0

    def fill(self, tile_id: int) -> None:
        """Fill every cell with *tile_id*."""
        for row in range(self.height):
            for col in range(self.width):
                self.data[row][col] = tile_id

    # ------------------------------------------------------------------
    # Flood fill
    # ------------------------------------------------------------------

    def flood_fill(self, col: int, row: int, new_id: int) -> list[tuple[int, int]]:
        """
        Replace all contiguous cells matching the tile at (col, row) with
        *new_id*. Returns the list of (col, row) cells that were changed.
        """
        old_id = self.get_tile(col, row)
        if old_id == new_id:
            return []

        changed: list[tuple[int, int]] = []
        stack = [(col, row)]
        visited: set[tuple[int, int]] = set()

        while stack:
            c, r = stack.pop()
            if (c, r) in visited:
                continue
            if not (0 <= r < self.height and 0 <= c < self.width):
                continue
            if self.data[r][c] != old_id:
                continue
            visited.add((c, r))
            self.data[r][c] = new_id
            changed.append((c, r))
            stack.extend([(c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1)])

        return changed

    # ------------------------------------------------------------------
    # Flat data (Tiled TMJ format)
    # ------------------------------------------------------------------

    def to_flat(self) -> list[int]:
        """Return a flat row-major list of tile IDs (Tiled 'data' format)."""
        return [self.data[r][c] for r in range(self.height) for c in range(self.width)]

    @classmethod
    def from_flat(
        cls,
        name: str,
        width: int,
        height: int,
        flat_data: list[int],
        **kwargs,
    ) -> "TileLayer":
        """Reconstruct a TileLayer from a Tiled-style flat data list."""
        layer = cls(name=name, width=width, height=height, **kwargs)
        for r in range(height):
            for c in range(width):
                idx = r * width + c
                layer.data[r][c] = flat_data[idx] if idx < len(flat_data) else 0
        return layer

    # ------------------------------------------------------------------
    # Copy
    # ------------------------------------------------------------------

    def copy(self) -> "TileLayer":
        new = TileLayer(
            name=self.name,
            width=self.width,
            height=self.height,
            visible=self.visible,
            opacity=self.opacity,
            offset_x=self.offset_x,
            offset_y=self.offset_y,
        )
        new.data = [row[:] for row in self.data]
        return new

    def __repr__(self) -> str:
        return (
            f"TileLayer(name={self.name!r}, size={self.width}x{self.height}, "
            f"visible={self.visible})"
        )


# ---------------------------------------------------------------------------
# ObjectLayer
# ---------------------------------------------------------------------------

@dataclass
class ObjectLayer:
    """A layer that holds MapObjects rather than a tile grid."""

    name: str
    visible: bool = True
    opacity: float = 1.0
    offset_x: int = 0
    offset_y: int = 0
    color: str = "#a0a0a0"        # Accent color shown in the layer panel
    layer_type: LayerType = field(default=LayerType.OBJECT, init=False)

    objects: list[MapObject] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Object management
    # ------------------------------------------------------------------

    def add_object(self, obj: MapObject) -> None:
        self.objects.append(obj)

    def remove_object(self, obj: MapObject) -> bool:
        try:
            self.objects.remove(obj)
            return True
        except ValueError:
            return False

    def remove_by_id(self, object_id: int) -> Optional[MapObject]:
        for i, obj in enumerate(self.objects):
            if obj.object_id == object_id:
                return self.objects.pop(i)
        return None

    def object_by_id(self, object_id: int) -> Optional[MapObject]:
        for obj in self.objects:
            if obj.object_id == object_id:
                return obj
        return None

    def objects_at(self, px: float, py: float, tile_w: int, tile_h: int) -> list[MapObject]:
        """
        Return all objects whose bounding box contains pixel position (px, py).
        For point objects a small hit radius equal to half a tile is used.
        """
        results = []
        half_tw = tile_w / 2
        half_th = tile_h / 2
        for obj in self.objects:
            if obj.width == 0 and obj.height == 0:
                # Point: hit-test within half a tile
                if abs(px - obj.x) <= half_tw and abs(py - obj.y) <= half_th:
                    results.append(obj)
            else:
                if obj.x <= px <= obj.x + obj.width and obj.y <= py <= obj.y + obj.height:
                    results.append(obj)
        return results

    def __repr__(self) -> str:
        return (
            f"ObjectLayer(name={self.name!r}, objects={len(self.objects)}, "
            f"visible={self.visible})"
        )


# ---------------------------------------------------------------------------
# Union type alias
# ---------------------------------------------------------------------------

Layer = TileLayer | ObjectLayer
