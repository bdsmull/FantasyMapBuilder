"""
TileMap model.

Represents a square/rectangular grid map used for small-scale areas:
towns, dungeons, interiors, and combat arenas.

Maps are composed of stacked TileLayers and ObjectLayers sharing the
same grid dimensions. The coordinate system follows Tiled conventions:
origin (0,0) at the top-left, x increases right, y increases down.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from map_editor.models.layer import Layer, LayerType, ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject
from map_editor.models.tileset import Tileset, make_default_tile_tileset


@dataclass
class TileMap:
    """
    A tile-grid map.

    Attributes:
        name:         Display name / file name stem.
        width:        Map width in tiles.
        height:       Map height in tiles.
        tile_width:   Tile width in pixels.
        tile_height:  Tile height in pixels.
        tilesets:     Ordered list of Tilesets referenced by this map.
        layers:       Ordered list of Layers (bottom → top rendering order).
        source_path:  File path this map was loaded from / last saved to.
    """

    name: str
    width: int
    height: int
    tile_width: int = 32
    tile_height: int = 32
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
        width: int,
        height: int,
        tile_width: int = 32,
        tile_height: int = 32,
        placeholder_dir: Optional[Path] = None,
    ) -> "TileMap":
        """
        Create a new blank TileMap with one default tile layer,
        one object layer, and the placeholder tileset.
        """
        tileset = make_default_tile_tileset(output_dir=placeholder_dir)

        ground_layer = TileLayer(name="Ground", width=width, height=height)
        object_layer = ObjectLayer(name="Objects")

        return cls(
            name=name,
            width=width,
            height=height,
            tile_width=tile_width,
            tile_height=tile_height,
            tilesets=[tileset],
            layers=[ground_layer, object_layer],
        )

    # ------------------------------------------------------------------
    # Tileset helpers
    # ------------------------------------------------------------------

    def primary_tileset(self) -> Optional[Tileset]:
        """Return the first tileset (used for most palette operations)."""
        return self.tilesets[0] if self.tilesets else None

    def add_tileset(self, tileset: Tileset) -> None:
        # Assign firstgid = highest current last-gid + 1
        if self.tilesets:
            last = self.tilesets[-1]
            tileset.first_gid = last.first_gid + last.count
        else:
            tileset.first_gid = 1
        self.tilesets.append(tileset)

    def tileset_for_gid(self, gid: int) -> Optional[Tileset]:
        """Return the Tileset that contains *gid* (Tiled multi-tileset logic)."""
        for ts in reversed(self.tilesets):
            if gid >= ts.first_gid:
                return ts
        return None

    def local_id(self, gid: int) -> int:
        """Convert a global tile ID to a local ID within its tileset."""
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
        layer = TileLayer(name=name, width=self.width, height=self.height)
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
    # Tile access (delegates to layers by name or index)
    # ------------------------------------------------------------------

    def get_tile(self, layer: TileLayer, col: int, row: int) -> int:
        return layer.get_tile(col, row)

    def set_tile(self, layer: TileLayer, col: int, row: int, tile_id: int) -> bool:
        return layer.set_tile(col, row, tile_id)

    # ------------------------------------------------------------------
    # Pixel ↔ tile coordinate conversion
    # ------------------------------------------------------------------

    def pixel_to_tile(self, px: float, py: float) -> tuple[int, int]:
        """Convert pixel position to (col, row) tile coordinates."""
        return int(px // self.tile_width), int(py // self.tile_height)

    def tile_to_pixel(self, col: int, row: int) -> tuple[int, int]:
        """Return the top-left pixel of tile (col, row)."""
        return col * self.tile_width, row * self.tile_height

    # ------------------------------------------------------------------
    # Bounds checking
    # ------------------------------------------------------------------

    def in_bounds(self, col: int, row: int) -> bool:
        return 0 <= col < self.width and 0 <= row < self.height

    # ------------------------------------------------------------------
    # Display geometry
    # ------------------------------------------------------------------

    @property
    def pixel_width(self) -> int:
        return self.width * self.tile_width

    @property
    def pixel_height(self) -> int:
        return self.height * self.tile_height

    def __repr__(self) -> str:
        return (
            f"TileMap(name={self.name!r}, size={self.width}x{self.height}, "
            f"tile={self.tile_width}x{self.tile_height}, layers={len(self.layers)})"
        )
