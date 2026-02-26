"""Canvas for displaying a HexMap."""
from PyQt6.QtCore import QRectF
from PyQt6.QtGui import QImage

from map_editor.models.hex_map import HexMap
from map_editor.rendering.hex_renderer import HexRenderer
from map_editor.ui.map_canvas import MapCanvas


class HexCanvas(MapCanvas):
    """QGraphicsView-based canvas for a hex-grid map."""

    def __init__(self, hex_map: HexMap, parent=None) -> None:
        super().__init__(parent)
        self.hex_map = hex_map
        self._renderer = HexRenderer()  # kept alive to preserve sheet cache
        self.refresh()

    # ------------------------------------------------------------------
    # MapCanvas abstract interface
    # ------------------------------------------------------------------

    def _do_render(self, clip_rect: QRectF) -> tuple[QImage, float, float]:
        return self._renderer.render_clipped(
            self.hex_map, clip_rect, show_grid=self._show_grid
        )

    def _pixel_to_cell(self, px: float, py: float) -> tuple[int, int]:
        result = self.hex_map.pixel_to_hex(px, py)
        return result if result is not None else (-1, -1)

    def _map_pixel_size(self) -> tuple[float, float]:
        return self.hex_map.pixel_width, self.hex_map.pixel_height

    def map_name(self) -> str:
        return self.hex_map.name

    def _cell_to_pixel_center(self, col: int, row: int) -> tuple[float, float]:
        return self.hex_map.hex_center(col, row)

    def _get_tile_size(self) -> tuple[int, int]:
        hw, hh = self.hex_map.hex_pixel_size()
        return int(hw), int(hh)
