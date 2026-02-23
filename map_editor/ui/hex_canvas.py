"""Canvas for displaying a HexMap."""
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

    def _do_render(self) -> QImage:
        return self._renderer.render(self.hex_map, show_grid=self._show_grid)

    def _pixel_to_cell(self, px: float, py: float) -> tuple[int, int]:
        result = self.hex_map.pixel_to_hex(px, py)
        return result if result is not None else (-1, -1)

    def _map_pixel_size(self) -> tuple[float, float]:
        return self.hex_map.pixel_width, self.hex_map.pixel_height

    def map_name(self) -> str:
        return self.hex_map.name
