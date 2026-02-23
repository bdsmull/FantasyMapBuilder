"""Canvas for displaying a TileMap."""
from PyQt6.QtGui import QImage

from map_editor.models.tile_map import TileMap
from map_editor.rendering.tile_renderer import TileRenderer
from map_editor.ui.map_canvas import MapCanvas


class TileCanvas(MapCanvas):
    """QGraphicsView-based canvas for a square-tile map."""

    def __init__(self, tile_map: TileMap, parent=None) -> None:
        super().__init__(parent)
        self.tile_map = tile_map
        self._renderer = TileRenderer()  # kept alive to preserve sheet cache
        self.refresh()

    # ------------------------------------------------------------------
    # MapCanvas abstract interface
    # ------------------------------------------------------------------

    def _do_render(self) -> QImage:
        return self._renderer.render(self.tile_map, show_grid=self._show_grid)

    def _pixel_to_cell(self, px: float, py: float) -> tuple[int, int]:
        col, row = self.tile_map.pixel_to_tile(px, py)
        if self.tile_map.in_bounds(col, row):
            return col, row
        return -1, -1

    def _map_pixel_size(self) -> tuple[float, float]:
        return float(self.tile_map.pixel_width), float(self.tile_map.pixel_height)

    def map_name(self) -> str:
        return self.tile_map.name
